/**
 * Enhanced Due Diligence (EDD) onboarding service — tier RENFORCÉ
 *
 * Activé uniquement si enhancedOnboarding=true (MICROFINANCE / PAYMENT_INSTITUTION).
 * Un dossier EDD est un Case standard enrichi avec un titre préfixé "EDD:" et
 * un champ findings contenant le JSON de la checklist de diligence renforcée.
 *
 * Flux :
 *   1. initEdd        — crée un Case EDD OPEN + checklist vide
 *   2. updateChecklist — met à jour les items de la checklist (entretien, docs…)
 *   3. completeEdd    — valide l'EDD → promeut le wallet au tier RENFORCE
 *   4. rejectEdd      — rejette l'EDD → ferme le dossier REJECTED
 */

import { TRPCError }  from "@trpc/server";
import { nanoid }     from "nanoid";
import { eq, and }    from "drizzle-orm";
import { db }         from "../../_core/db";
import { cases, caseTimeline } from "../../../drizzle/schema";
import type { Case }  from "../../../drizzle/schema";
import { updateWalletTier } from "./kyc-tier.service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EddChecklistItem {
  id:        string;
  label:     string;
  done:      boolean;
  notes?:    string;
  doneAt?:   string;  // ISO string
}

export interface EddChecklist {
  items:      EddChecklistItem[];
  interview:  boolean;
  interviewDate?: string;
  interviewNotes?: string;
}

export const INITIAL_EDD_CHECKLIST: EddChecklist = {
  interview: false,
  items: [
    { id: "ID_VERIFIED",       label: "Pièce d'identité vérifiée (CIN/Passeport)",          done: false },
    { id: "ADDRESS_PROOF",     label: "Justificatif de domicile (≤ 3 mois)",                done: false },
    { id: "BANK_STATEMENT",    label: "Relevé bancaire (3 derniers mois)",                  done: false },
    { id: "INCOME_SOURCE",     label: "Justificatif de revenus / source des fonds",         done: false },
    { id: "PROFESSION_CHECK",  label: "Vérification profession / employeur",                done: false },
    { id: "PEP_SCREENING",     label: "Criblage PEP / sanctions (résultat consigné)",       done: false },
    { id: "ADVERSE_MEDIA",     label: "Recherche médias défavorables",                     done: false },
    { id: "INTERVIEW_REPORT",  label: "Rapport d'entretien EDD signé",                     done: false },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EDD_TITLE_PREFIX = "EDD:";

function isEddCase(c: Case): boolean {
  return c.title.startsWith(EDD_TITLE_PREFIX);
}

function parseChecklist(findings: string | null): EddChecklist {
  if (!findings) return structuredClone(INITIAL_EDD_CHECKLIST);
  try {
    return JSON.parse(findings) as EddChecklist;
  } catch {
    return structuredClone(INITIAL_EDD_CHECKLIST);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Ouvre un dossier EDD pour un client.
 * Refuse si un dossier EDD ouvert existe déjà pour ce client.
 */
export async function initEdd(params: {
  customerId: number;
  walletId:   number;
  analystId:  number;
}): Promise<Case> {
  // Vérifier qu'aucun EDD ouvert n'existe déjà pour ce client
  const existing = await db
    .select({ id: cases.id, title: cases.title, status: cases.status })
    .from(cases)
    .where(eq(cases.customerId, params.customerId));

  const openEdd = existing.find(
    (c) => c.title.startsWith(EDD_TITLE_PREFIX) && c.status === "OPEN"
  );
  if (openEdd) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Un dossier EDD ouvert existe déjà pour ce client (Case #${openEdd.id})`,
    });
  }

  const caseId   = `EDD-${nanoid(8).toUpperCase()}`;
  const checklist = structuredClone(INITIAL_EDD_CHECKLIST);

  const [eddCase] = await db.insert(cases).values({
    caseId,
    customerId:  params.customerId,
    title:       `${EDD_TITLE_PREFIX} Diligence Renforcée — Wallet #${params.walletId}`,
    description: `Dossier EDD requis pour la promotion au tier RENFORCÉ. Wallet ID: ${params.walletId}`,
    status:      "OPEN",
    severity:    "HIGH",
    assignedTo:  params.analystId,
    decision:    "PENDING",
    findings:    JSON.stringify(checklist),
  }).returning();

  if (!eddCase) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Échec création dossier EDD" });

  await db.insert(caseTimeline).values({
    caseId:      eddCase.id,
    action:      "CASE_OPENED",
    description: `Dossier EDD ouvert pour promotion wallet #${params.walletId} au tier RENFORCÉ`,
    performedBy: params.analystId,
  });

  return eddCase;
}

/**
 * Récupère le dossier EDD ouvert pour un client, ou null.
 */
export async function getOpenEddCase(customerId: number): Promise<Case | null> {
  const rows = await db
    .select()
    .from(cases)
    .where(and(eq(cases.customerId, customerId), eq(cases.status, "OPEN")));

  return rows.find(isEddCase) ?? null;
}

/**
 * Récupère un dossier EDD par son Case id, ou throw NOT_FOUND.
 */
export async function getEddCaseOrThrow(caseId: number): Promise<Case> {
  const [c] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: `Dossier EDD #${caseId} introuvable` });
  if (!isEddCase(c)) throw new TRPCError({ code: "BAD_REQUEST", message: `Le dossier #${caseId} n'est pas un dossier EDD` });
  return c;
}

/**
 * Met à jour un item de la checklist EDD.
 */
export async function updateEddChecklistItem(params: {
  caseId:   number;
  itemId:   string;
  done:     boolean;
  notes?:   string;
  userId:   number;
}): Promise<Case> {
  const eddCase  = await getEddCaseOrThrow(params.caseId);
  const checklist = parseChecklist(eddCase.findings);

  const item = checklist.items.find((i) => i.id === params.itemId);
  if (!item) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Item checklist "${params.itemId}" introuvable` });
  }

  item.done = params.done;
  if (params.done) {
    item.doneAt = new Date().toISOString();
  } else {
    delete item.doneAt;
  }
  if (params.notes !== undefined) {
    item.notes = params.notes;
  }

  const [updated] = await db
    .update(cases)
    .set({ findings: JSON.stringify(checklist), updatedAt: new Date() })
    .where(eq(cases.id, params.caseId))
    .returning();

  if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Échec mise à jour checklist" });

  await db.insert(caseTimeline).values({
    caseId:      params.caseId,
    action:      "NOTE_ADDED",
    description: `Checklist EDD — "${item.label}" : ${params.done ? "✓ validé" : "annulé"}${params.notes ? ` — ${params.notes}` : ""}`,
    performedBy: params.userId,
  });

  return updated;
}

/**
 * Enregistre l'entretien EDD (interview).
 */
export async function recordEddInterview(params: {
  caseId:         number;
  interviewDate:  string;
  notes:          string;
  userId:         number;
}): Promise<Case> {
  const eddCase   = await getEddCaseOrThrow(params.caseId);
  const checklist  = parseChecklist(eddCase.findings);

  checklist.interview      = true;
  checklist.interviewDate  = params.interviewDate;
  checklist.interviewNotes = params.notes;

  const interviewItem = checklist.items.find((i) => i.id === "INTERVIEW_REPORT");
  if (interviewItem) {
    interviewItem.done   = true;
    interviewItem.doneAt = new Date().toISOString();
    interviewItem.notes  = params.notes;
  }

  const [updated] = await db
    .update(cases)
    .set({ findings: JSON.stringify(checklist), updatedAt: new Date() })
    .where(eq(cases.id, params.caseId))
    .returning();

  if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Échec enregistrement entretien" });

  await db.insert(caseTimeline).values({
    caseId:      params.caseId,
    action:      "NOTE_ADDED",
    description: `Entretien EDD enregistré le ${params.interviewDate}`,
    performedBy: params.userId,
  });

  return updated;
}

/**
 * Valide l'EDD et promeut le wallet au tier RENFORCÉ.
 * Exige que tous les items de la checklist soient validés ET l'entretien fait.
 */
export async function completeEdd(params: {
  caseId:       number;
  walletId:     number;
  customerId:   number;
  decision:     string;
  userId:       number;
}): Promise<{ eddCase: Case; promoted: boolean }> {
  const eddCase   = await getEddCaseOrThrow(params.caseId);
  const checklist  = parseChecklist(eddCase.findings);

  // Vérifier complétude
  const incomplete = checklist.items.filter((i) => !i.done);
  if (incomplete.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${incomplete.length} item(s) checklist non validés : ${incomplete.map((i) => i.label).join(", ")}`,
    });
  }
  if (!checklist.interview) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "L'entretien EDD n'a pas encore été enregistré",
    });
  }

  // Clore le dossier (CLOSED_NO_ACTION = approuvé, tier promu)
  const [closed] = await db
    .update(cases)
    .set({
      status:        "CLOSED",
      decision:      "CLOSED_NO_ACTION",
      decisionNotes: `[EDD APPROUVÉ] ${params.decision}`,
      decisionBy:    params.userId,
      decisionAt:    new Date(),
      updatedAt:     new Date(),
    })
    .where(eq(cases.id, params.caseId))
    .returning();

  if (!closed) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Échec clôture dossier EDD" });

  // Promouvoir le wallet
  await updateWalletTier({
    walletId:    params.walletId,
    customerId:  params.customerId,
    newTier:     "RENFORCE",
    reason:      `EDD validé — dossier ${eddCase.caseId} — ${params.decision}`,
    triggeredBy: params.userId,
  });

  await db.insert(caseTimeline).values({
    caseId:      params.caseId,
    action:      "CASE_CLOSED",
    description: `EDD validé — wallet #${params.walletId} promu RENFORCÉ`,
    performedBy: params.userId,
  });

  return { eddCase: closed, promoted: true };
}

/**
 * Rejette l'EDD — ferme le dossier sans promotion de tier.
 */
export async function rejectEdd(params: {
  caseId:  number;
  reason:  string;
  userId:  number;
}): Promise<Case> {
  const eddCase = await getEddCaseOrThrow(params.caseId);
  if (eddCase.status !== "OPEN") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ce dossier EDD n'est plus ouvert" });
  }

  const [closed] = await db
    .update(cases)
    .set({
      status:        "CLOSED",
      decision:      "ESCALATED",
      decisionNotes: `[EDD REJETÉ] ${params.reason}`,
      decisionBy:    params.userId,
      decisionAt:    new Date(),
      updatedAt:     new Date(),
    })
    .where(eq(cases.id, params.caseId))
    .returning();

  if (!closed) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Échec rejet dossier EDD" });

  await db.insert(caseTimeline).values({
    caseId:      params.caseId,
    action:      "CASE_CLOSED",
    description: `EDD rejeté — ${params.reason}`,
    performedBy: params.userId,
  });

  return closed;
}

/**
 * Historique des dossiers EDD d'un client (tous statuts).
 */
export async function listEddCases(customerId: number): Promise<Case[]> {
  const rows = await db
    .select()
    .from(cases)
    .where(eq(cases.customerId, customerId));

  return rows.filter(isEddCase);
}
