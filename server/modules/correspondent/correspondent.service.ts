/**
 * Correspondent Banking Risk Service — FATF Recommendation 13
 *
 * Processus d'évaluation des banques correspondantes :
 * 1. Onboarding avec évaluation des 4 critères FATF R.13
 * 2. Calcul automatique du risk_score (0-100) et du risk_level
 * 3. Demande d'approbation senior management (via approval_requests)
 * 4. Revue annuelle obligatoire
 */

import { eq, and, lte, desc, count } from "drizzle-orm";
import { db } from "../../_core/db";
import {
  correspondentBanks,
  correspondentAssessments,
  type CorrespondentBank,
  type InsertCorrespondentBank,
  type CorrespondentAssessment,
} from "../../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { createLogger } from "../../_core/logger";

const log = createLogger("correspondent");

// ─── Risk scoring (FATF R.13 — 4 critères, 25 pts chacun) ───────────────────

function computeRiskLevel(score: number): CorrespondentBank["riskLevel"] {
  if (score <= 25)  return "LOW";
  if (score <= 50)  return "MEDIUM";
  if (score <= 75)  return "HIGH";
  return "UNACCEPTABLE";
}

function computeRiskScore(
  amlFramework: number,
  ownershipTransp: number,
  supervisory: number,
  sanctionsRisk: number,
): number {
  // Score composite : somme des 4 sous-scores (chacun 0-25 → total 0-100)
  return amlFramework + ownershipTransp + supervisory + sanctionsRisk;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listCorrespondentBanks(opts: {
  page:      number;
  limit:     number;
  country?:  string;
  riskLevel?: CorrespondentBank["riskLevel"];
  status?:   CorrespondentBank["status"];
  search?:   string;
}): Promise<{ items: CorrespondentBank[]; total: number }> {
  const conditions = [];

  if (opts.country)   conditions.push(eq(correspondentBanks.country,   opts.country));
  if (opts.riskLevel) conditions.push(eq(correspondentBanks.riskLevel, opts.riskLevel));
  if (opts.status)    conditions.push(eq(correspondentBanks.status,    opts.status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(correspondentBanks)
      .where(where)
      .orderBy(desc(correspondentBanks.riskScore), desc(correspondentBanks.updatedAt))
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit),
    db.select({ total: count() }).from(correspondentBanks).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.total ?? 0) };
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getCorrespondentBankById(id: number): Promise<CorrespondentBank | null> {
  const [bank] = await db
    .select()
    .from(correspondentBanks)
    .where(eq(correspondentBanks.id, id))
    .limit(1);

  return bank ?? null;
}

export async function getAssessments(bankId: number): Promise<CorrespondentAssessment[]> {
  return db
    .select()
    .from(correspondentAssessments)
    .where(eq(correspondentAssessments.bankId, bankId))
    .orderBy(desc(correspondentAssessments.createdAt));
}

// ─── Create / Update ──────────────────────────────────────────────────────────

export async function createCorrespondentBank(
  input: Omit<InsertCorrespondentBank, "riskScore" | "riskLevel" | "createdAt" | "updatedAt">
): Promise<CorrespondentBank> {
  const [bank] = await db
    .insert(correspondentBanks)
    .values({
      ...input,
      riskScore: 50,
      riskLevel: "MEDIUM",
      status:    "UNDER_REVIEW",
    })
    .returning();

  if (!bank) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur création" });
  log.info({ id: bank.id, name: bank.name }, "Correspondent bank created");
  return bank;
}

// ─── Assessment (évaluation FATF R.13) ────────────────────────────────────────

export async function submitAssessment(input: {
  bankId:               number;
  assessedBy:           number;
  amlFrameworkScore:    number;   // 0-25 : solidité du dispositif AML
  ownershipTranspScore: number;   // 0-25 : transparence de l'actionnariat
  supervisoryScore:     number;   // 0-25 : qualité de la supervision locale
  sanctionsRiskScore:   number;   // 0-25 : exposition aux sanctions
  findings?:            string;
  recommendation:       "approve" | "conditional" | "reject";
  approvalRequestId?:   number;
}): Promise<{ bank: CorrespondentBank; assessment: CorrespondentAssessment }> {
  const bank = await getCorrespondentBankById(input.bankId);
  if (!bank) throw new TRPCError({ code: "NOT_FOUND", message: `Banque #${input.bankId} introuvable` });

  const riskScore = computeRiskScore(
    input.amlFrameworkScore,
    input.ownershipTranspScore,
    input.supervisoryScore,
    input.sanctionsRiskScore,
  );
  const riskLevel = computeRiskLevel(riskScore);

  // Calcul next review : +1 an si LOW/MEDIUM, +6 mois si HIGH, +3 mois si UNACCEPTABLE
  const months = riskLevel === "LOW" || riskLevel === "MEDIUM" ? 12 : riskLevel === "HIGH" ? 6 : 3;
  const nextReviewDate = new Date();
  nextReviewDate.setMonth(nextReviewDate.getMonth() + months);

  // Transaction : insertion assessment + mise à jour bank
  const [[assessment], [updatedBank]] = await Promise.all([
    db
      .insert(correspondentAssessments)
      .values({
        bankId:               input.bankId,
        assessedBy:           input.assessedBy,
        riskScore,
        riskLevel,
        amlFrameworkScore:    input.amlFrameworkScore,
        ownershipTranspScore: input.ownershipTranspScore,
        supervisoryScore:     input.supervisoryScore,
        sanctionsRiskScore:   input.sanctionsRiskScore,
        findings:             input.findings ?? null,
        recommendation:       input.recommendation,
        approvalRequestId:    input.approvalRequestId ?? null,
      })
      .returning(),
    db
      .update(correspondentBanks)
      .set({
        riskScore,
        riskLevel,
        nextReviewDate,
        updatedAt: new Date(),
        // Si recommendation = reject → suspendre automatiquement
        status: input.recommendation === "reject" ? "SUSPENDED" : bank.status,
      })
      .where(eq(correspondentBanks.id, input.bankId))
      .returning(),
  ]);

  if (!assessment || !updatedBank) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur assessment" });
  }

  log.info({ bankId: input.bankId, riskScore, riskLevel }, "Correspondent assessment submitted");
  return { bank: updatedBank, assessment };
}

// ─── Approval (senior management) ─────────────────────────────────────────────

export async function approveCorrespondentBank(bankId: number, approvedBy: number): Promise<CorrespondentBank> {
  const [bank] = await db
    .update(correspondentBanks)
    .set({ approvedBy, status: "ACTIVE", updatedAt: new Date() })
    .where(eq(correspondentBanks.id, bankId))
    .returning();

  if (!bank) throw new TRPCError({ code: "NOT_FOUND", message: `Banque #${bankId} introuvable` });
  log.info({ bankId, approvedBy }, "Correspondent bank approved");
  return bank;
}

export async function suspendCorrespondentBank(bankId: number): Promise<CorrespondentBank> {
  const [bank] = await db
    .update(correspondentBanks)
    .set({ status: "SUSPENDED", updatedAt: new Date() })
    .where(eq(correspondentBanks.id, bankId))
    .returning();

  if (!bank) throw new TRPCError({ code: "NOT_FOUND", message: `Banque #${bankId} introuvable` });
  return bank;
}

export async function terminateCorrespondentBank(bankId: number): Promise<CorrespondentBank> {
  const [bank] = await db
    .update(correspondentBanks)
    .set({ status: "TERMINATED", updatedAt: new Date() })
    .where(eq(correspondentBanks.id, bankId))
    .returning();

  if (!bank) throw new TRPCError({ code: "NOT_FOUND", message: `Banque #${bankId} introuvable` });
  return bank;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getCorrespondentStats(): Promise<{
  total:          number;
  active:         number;
  underReview:    number;
  highRisk:       number;
  overdueReview:  number;
}> {
  const now = new Date();
  const [rows] = await db.select({ total: count() }).from(correspondentBanks);

  const [active]  = await db.select({ c: count() }).from(correspondentBanks)
    .where(eq(correspondentBanks.status, "ACTIVE"));
  const [review]  = await db.select({ c: count() }).from(correspondentBanks)
    .where(eq(correspondentBanks.status, "UNDER_REVIEW"));
  const [high]    = await db.select({ c: count() }).from(correspondentBanks)
    .where(and(
      eq(correspondentBanks.riskLevel, "HIGH"),
    ));
  const [overdue] = await db.select({ c: count() }).from(correspondentBanks)
    .where(lte(correspondentBanks.nextReviewDate, now));

  return {
    total:         Number(rows?.total ?? 0),
    active:        Number(active?.c ?? 0),
    underReview:   Number(review?.c ?? 0),
    highRisk:      Number(high?.c ?? 0),
    overdueReview: Number(overdue?.c ?? 0),
  };
}
