import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import {
  insertReport,
  findReportById,
  findManyReports,
  updateReport,
  getReportStats,
  type ListReportsInput,
} from "./reports.repository";
import { findCustomerById } from "../customers/customers.repository";
import { findCaseById } from "../cases/cases.repository";
import type { Report } from "../../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateSarInput {
  customerId: number;
  caseId?: number | undefined;
  title: string;
  suspicionType: string;
  amountInvolved?: string | undefined;
  currency?: string | undefined;
  content: SarContent;
}

export interface CreateStrInput {
  customerId: number;
  caseId?: number | undefined;
  title: string;
  suspicionType: string;
  amountInvolved: string;
  currency?: string | undefined;
  content: StrContent;
}

/**
 * Contenu structuré d'un SAR (Suspicious Activity Report)
 * Format conforme TRACFIN / GAFI
 */
export interface SarContent {
  subjectDescription: string;     // Description du sujet
  suspiciousActivities: string[]; // Liste des activités suspectes
  evidenceSummary: string;        // Résumé des preuves
  relatedTransactions?: string[] | undefined; // IDs transactions liées
  relatedAlerts?: string[] | undefined;       // IDs alertes liées
  narrativeSummary: string;       // Narration libre
  recommendedAction?: string | undefined;
}

/**
 * Contenu structuré d'un STR (Suspicious Transaction Report)
 * Centré sur la transaction plutôt que l'activité globale
 */
export interface StrContent {
  transactionId: string;          // ID transaction principale
  transactionDate: string;        // Date ISO
  transactionAmount: string;      // Montant
  transactionType: string;        // Type de transaction
  suspicionBasis: string;         // Base légale de la suspicion
  involvedParties: string[];      // Parties impliquées
  evidenceSummary: string;        // Résumé des preuves
  narrativeSummary: string;       // Narration libre
  relatedTransactions?: string[] | undefined;
}

// ─── Workflow SAR ─────────────────────────────────────────────────────────────

/**
 * Créer un SAR en statut DRAFT
 * Nécessite un customer valide + optionnellement un case lié
 */
export async function createSar(input: CreateSarInput, createdBy: number): Promise<Report> {
  const customer = await findCustomerById(input.customerId);
  if (!customer) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable" });
  }

  if (input.caseId !== undefined) {
    const c = await findCaseById(input.caseId);
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Dossier introuvable" });
  }

  const reportId = `SAR-${nanoid(10).toUpperCase()}`;

  return insertReport({
    reportId,
    reportType: "SAR",
    customerId: input.customerId,
    caseId: input.caseId ?? null,
    title: input.title,
    status: "DRAFT",
    suspicionType: input.suspicionType,
    amountInvolved: input.amountInvolved ?? null,
    currency: input.currency ?? "EUR",
    content: input.content as unknown as null, // jsonb
    submittedBy: createdBy,
  });
}

/**
 * Créer un STR en statut DRAFT
 */
export async function createStr(input: CreateStrInput, createdBy: number): Promise<Report> {
  const customer = await findCustomerById(input.customerId);
  if (!customer) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable" });
  }

  if (input.caseId !== undefined) {
    const c = await findCaseById(input.caseId);
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Dossier introuvable" });
  }

  const reportId = `STR-${nanoid(10).toUpperCase()}`;

  return insertReport({
    reportId,
    reportType: "STR",
    customerId: input.customerId,
    caseId: input.caseId ?? null,
    title: input.title,
    status: "DRAFT",
    suspicionType: input.suspicionType,
    amountInvolved: input.amountInvolved,
    currency: input.currency ?? "EUR",
    content: input.content as unknown as null, // jsonb
    submittedBy: createdBy,
  });
}

// ─── Workflow de validation ───────────────────────────────────────────────────

export async function getReportOrThrow(id: number): Promise<Report> {
  const report = await findReportById(id);
  if (!report) throw new TRPCError({ code: "NOT_FOUND", message: `Rapport #${id} introuvable` });
  return report;
}

/**
 * Soumettre pour révision (DRAFT → REVIEW)
 */
export async function submitForReview(id: number): Promise<Report> {
  const report = await getReportOrThrow(id);

  if (report.status !== "DRAFT") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Rapport déjà en statut ${report.status} — seul un DRAFT peut être soumis`,
    });
  }

  return updateReport(id, { status: "REVIEW" });
}

/**
 * Approuver et soumettre au régulateur (REVIEW → SUBMITTED)
 * Compliance Officer+ seulement
 */
export async function approveAndSubmit(
  id: number,
  approvedBy: number,
  regulatoryRef?: string | undefined
): Promise<Report> {
  const report = await getReportOrThrow(id);

  if (report.status !== "REVIEW") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Rapport en statut ${report.status} — seul un rapport en REVIEW peut être approuvé`,
    });
  }

  return updateReport(id, {
    status: "SUBMITTED",
    approvedBy,
    approvedAt: new Date(),
    submittedAt: new Date(),
    ...(regulatoryRef !== undefined ? { regulatoryRef } : {}),
  });
}

/**
 * Rejeter un rapport (REVIEW → REJECTED)
 */
export async function rejectReport(id: number): Promise<Report> {
  const report = await getReportOrThrow(id);

  if (report.status !== "REVIEW") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Rapport en statut ${report.status} — seul un rapport en REVIEW peut être rejeté`,
    });
  }

  return updateReport(id, { status: "REJECTED" });
}

/**
 * Mettre à jour le contenu d'un rapport en DRAFT ou REJECTED
 */
export async function updateReportContent(
  id: number,
  patch: {
    title?: string | undefined;
    suspicionType?: string | undefined;
    amountInvolved?: string | undefined;
    content?: SarContent | StrContent | undefined;
  }
): Promise<Report> {
  const report = await getReportOrThrow(id);

  if (report.status !== "DRAFT" && report.status !== "REJECTED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Seuls les rapports en DRAFT ou REJECTED peuvent être modifiés",
    });
  }

  return updateReport(id, {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.suspicionType !== undefined ? { suspicionType: patch.suspicionType } : {}),
    ...(patch.amountInvolved !== undefined ? { amountInvolved: patch.amountInvolved } : {}),
    ...(patch.content !== undefined ? { content: patch.content as unknown as null } : {}),
  });
}

export async function listReports(input: ListReportsInput) {
  return findManyReports(input);
}

export { getReportStats };
