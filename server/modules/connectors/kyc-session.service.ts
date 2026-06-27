/**
 * KYC Session Service — Persistance des sessions d'entrée en relation
 *
 * Une session suit le candidat client à travers les étapes :
 *   DRAFT → OCR_DONE → AGENT_REVIEW → DECIDED
 *           ou → ABANDONED (expiration / annulation)
 *
 * La table customer n'est créée qu'à la décision finale.
 *
 * Avantages vs ancien Redis-only :
 *   - Reprise possible (audit/agent revient sur dossier abandonné)
 *   - Statistiques (taux d'abandon par étape, durée moyenne)
 *   - Audit BAM (qui a validé, quand, quels champs modifiés)
 *   - Reporting (X dossiers initiés, Y complétés)
 */

import { and, eq, lt } from "drizzle-orm";
import { nanoid }      from "nanoid";
import { db }          from "../../_core/db";
import { createLogger } from "../../_core/logger";
import { kycSessions, type KycSession } from "../../../drizzle/schema";

const log = createLogger("kyc-session");

// Durée de vie d'une session par défaut : 24h pour CBS, 1h pour digital
const TTL_HOURS = {
  CBS_API:      24,
  DIGITAL_WEB:   1,
  AGENT_OFFICE:  8,
  MOBILE_APP:    2,
} as const;

// ─── Création de session ─────────────────────────────────────────────────────

export async function createSession(input: {
  channel:    KycSession["channel"];
  cbsRef?:    string;
  cbsCode?:   string;
  cbsFields?: Record<string, unknown>;
}): Promise<KycSession> {
  const sessionRef = `OCR-${nanoid(10).toUpperCase()}`;
  const now        = new Date();
  const ttl        = TTL_HOURS[input.channel] ?? 1;
  const expiresAt  = new Date(now.getTime() + ttl * 3_600_000);

  const [session] = await db.insert(kycSessions).values({
    sessionRef,
    channel:   input.channel,
    status:    "DRAFT",
    cbsRef:    input.cbsRef    ?? null,
    cbsCode:   input.cbsCode   ?? null,
    cbsFields: (input.cbsFields ?? null) as unknown as null,
    startedAt: now,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  }).returning();

  log.info({ sessionRef, channel: input.channel }, "Session KYC créée");
  return session!;
}

// ─── Récupération ─────────────────────────────────────────────────────────────

export async function findSessionByRef(sessionRef: string): Promise<KycSession | null> {
  const rows = await db.select().from(kycSessions)
    .where(eq(kycSessions.sessionRef, sessionRef))
    .limit(1);
  return rows[0] ?? null;
}

export async function requireValidSession(sessionRef: string): Promise<KycSession> {
  const session = await findSessionByRef(sessionRef);
  if (!session) {
    throw new Error(`Session ${sessionRef} introuvable`);
  }
  if (session.status === "ABANDONED") {
    throw new Error(`Session ${sessionRef} a été abandonnée`);
  }
  if (session.expiresAt < new Date()) {
    // Marquer comme abandonnée si pas encore fait
    await db.update(kycSessions)
      .set({ status: "ABANDONED", abandonedAt: new Date(), updatedAt: new Date() })
      .where(eq(kycSessions.id, session.id));
    throw new Error(`Session ${sessionRef} expirée`);
  }
  return session;
}

// ─── Mise à jour étape OCR ───────────────────────────────────────────────────

export async function attachOcrResult(input: {
  sessionRef:      string;
  ocrResult:       Record<string, unknown>;
  candidateFields: Record<string, unknown>;
}): Promise<KycSession> {
  const session = await requireValidSession(input.sessionRef);
  const [updated] = await db.update(kycSessions)
    .set({
      status:          "OCR_DONE",
      ocrResult:       input.ocrResult as unknown as null,
      candidateFields: input.candidateFields as unknown as null,
      updatedAt:       new Date(),
    })
    .where(eq(kycSessions.id, session.id))
    .returning();

  log.info({ sessionRef: input.sessionRef }, "OCR attaché à la session");
  return updated!;
}

// ─── Mise à jour étape revue agent ───────────────────────────────────────────

export async function markAgentReview(input: {
  sessionRef: string;
  reviewedBy: number;
}): Promise<KycSession> {
  const session = await requireValidSession(input.sessionRef);
  const [updated] = await db.update(kycSessions)
    .set({
      status:     "AGENT_REVIEW",
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date(),
      updatedAt:  new Date(),
    })
    .where(eq(kycSessions.id, session.id))
    .returning();
  return updated!;
}

// ─── Décision finale ─────────────────────────────────────────────────────────

export async function decideSession(input: {
  sessionRef:      string;
  customerId:      number;
  decisionResult:  Record<string, unknown>;
  modifiedFields?: string[];
}): Promise<KycSession> {
  const session = await requireValidSession(input.sessionRef);
  const now = new Date();

  const [updated] = await db.update(kycSessions)
    .set({
      status:         "DECIDED",
      customerId:     input.customerId,
      decisionResult: input.decisionResult as unknown as null,
      modifiedFields: (input.modifiedFields ?? []) as unknown as null,
      decidedAt:      now,
      updatedAt:      now,
    })
    .where(eq(kycSessions.id, session.id))
    .returning();

  log.info({
    sessionRef:    input.sessionRef,
    customerId:    input.customerId,
    durationMs:    now.getTime() - session.startedAt.getTime(),
    modifiedCount: input.modifiedFields?.length ?? 0,
  }, "Session KYC décidée");

  return updated!;
}

// ─── Marquer abandonnée ──────────────────────────────────────────────────────

export async function abandonSession(sessionRef: string, reason?: string): Promise<void> {
  const session = await findSessionByRef(sessionRef);
  if (!session || session.status === "DECIDED" || session.status === "ABANDONED") return;

  await db.update(kycSessions)
    .set({
      status:       "ABANDONED",
      abandonedAt:  new Date(),
      updatedAt:    new Date(),
    })
    .where(eq(kycSessions.id, session.id));

  log.info({ sessionRef, reason }, "Session KYC abandonnée");
}

// ─── Nettoyage des sessions expirées (scheduler optionnel) ──────────────────

export async function abandonExpiredSessions(): Promise<number> {
  const now = new Date();
  const expired = await db.select({ id: kycSessions.id, sessionRef: kycSessions.sessionRef })
    .from(kycSessions)
    .where(and(
      lt(kycSessions.expiresAt, now),
      eq(kycSessions.status, "DRAFT"),
    ));

  if (expired.length === 0) return 0;

  await db.update(kycSessions)
    .set({ status: "ABANDONED", abandonedAt: now, updatedAt: now })
    .where(and(
      lt(kycSessions.expiresAt, now),
      eq(kycSessions.status, "DRAFT"),
    ));

  log.info({ count: expired.length }, "Sessions expirées marquées abandonnées");
  return expired.length;
}

// ─── Statistiques ────────────────────────────────────────────────────────────

export async function getSessionStats(): Promise<{
  total:     number;
  byStatus:  Record<string, number>;
  byChannel: Record<string, number>;
}> {
  const rows = await db.select().from(kycSessions);

  const byStatus:  Record<string, number> = {};
  const byChannel: Record<string, number> = {};

  for (const r of rows) {
    byStatus[r.status]   = (byStatus[r.status]   ?? 0) + 1;
    byChannel[r.channel] = (byChannel[r.channel] ?? 0) + 1;
  }

  return { total: rows.length, byStatus, byChannel };
}
