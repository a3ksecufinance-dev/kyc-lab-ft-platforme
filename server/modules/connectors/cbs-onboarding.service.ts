/**
 * CBS Onboarding Service — UC-1 & UC-2
 *
 * Reçoit une demande d'entrée en relation depuis le CBS (format API Reset),
 * exécute le pipeline KYC synchrone et retourne une décision immédiate.
 *
 * Pipeline synchrone (< 3s) :
 *  1. Validation & normalisation du payload CBS
 *  2. Vérification doublon (même CIN déjà en base)
 *  3. Création client (kycStatus=PENDING)
 *  4. Screening sanctions + PEP temps réel
 *  5. Vérification document expiré (si expiryDate fourni)
 *  6. Calcul score risque initial
 *  7. Décision finale → APPROVED / IN_REVIEW / REJECTED
 *  8. Audit log
 *
 * UC-1 : Happy Path → APPROVED (< 3s)
 * UC-2 : Sanctions MATCH → REJECTED immédiat
 */

import { nanoid }       from "nanoid";
import { eq }           from "drizzle-orm";
import { db }           from "../../_core/db";
import { createLogger } from "../../_core/logger";
import { customers, documents, alerts } from "../../../drizzle/schema";
import { insertCustomer }               from "../customers/customers.repository";
import { screenCustomer }               from "../screening/screening.service";
import { insertDocument }               from "../documents/documents.repository";
import { runDocExpiryCheck }            from "../documents/doc-expiry.service";

const log = createLogger("cbs-onboarding");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CbsOnboardingPayload {
  ID:              string;    // registration.slice(-8) — référence CBS
  code:            string;    // "entree" | "matcash"
  nom:             string;
  prenom:          string;
  date_naissance:  string;    // format CBS : "DD/MM/YYYY" ou "YYYY-MM-DD"
  CIN:             string;
  nationalite?:    string;
  ville_naissance?: string;
  pays_naissance?:  string;
  // Document optionnel (si CBS envoie l'image)
  document?: {
    type:        "ID_CARD" | "PASSPORT" | "DRIVING_LICENSE";
    expiryDate?: string;    // "YYYY-MM-DD"
    number?:     string;
  };
}

export interface CbsOnboardingResult {
  // Statut décision
  decision:       "APPROVED" | "IN_REVIEW" | "REJECTED";
  reason:         string;
  reasonCode:     CbsReasonCode;

  // Références créées
  customerId:     number;
  customerRef:    string;    // KYC-XXXXXXXX

  // Risque
  riskLevel:      "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskScore:      number;

  // Screening
  screening: {
    status:         "CLEAR" | "MATCH" | "REVIEW";
    matchScore:     number;
    matchedEntity:  string | null;
    listSource:     string | null;
  };

  // Métadonnées
  processedAt:    string;
  durationMs:     number;
  cbsRef:         string;
}

type CbsReasonCode =
  | "APPROVED_CLEAR"
  | "REVIEW_SANCTIONS_PARTIAL"
  | "REVIEW_DOCUMENT_EXPIRED"
  | "REVIEW_DOCUMENT_EXPIRING_SOON"
  | "REVIEW_DUPLICATE_CIN"
  | "REJECTED_SANCTIONS_MATCH"
  | "REJECTED_INVALID_PAYLOAD";

// ─── Normalisation date ───────────────────────────────────────────────────────

function normalizeDateOfBirth(raw: string): string | undefined {
  if (!raw) return undefined;
  // Format DD/MM/YYYY → YYYY-MM-DD
  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const m = ddmmyyyy.exec(raw.trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Format YYYY-MM-DD déjà correct
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  return undefined;
}

function isDocumentExpired(expiryDate: string): boolean {
  const today = new Date().toISOString().split("T")[0]!;
  return expiryDate < today;
}

function isDocumentExpiringSoon(expiryDate: string, warnDays = 30): boolean {
  const warnDate = new Date();
  warnDate.setDate(warnDate.getDate() + warnDays);
  const warnStr = warnDate.toISOString().split("T")[0]!;
  const today   = new Date().toISOString().split("T")[0]!;
  return expiryDate >= today && expiryDate <= warnStr;
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

export async function processCbsOnboarding(
  payload: CbsOnboardingPayload,
  cbsRef:  string,
): Promise<CbsOnboardingResult> {
  const start = Date.now();
  const now   = new Date();

  log.info({ cbsRef, cin: payload.CIN, code: payload.code }, "CBS onboarding reçu");

  // ── 1. Validation basique ──────────────────────────────────────────────────
  if (!payload.nom || !payload.CIN || !payload.date_naissance) {
    log.warn({ cbsRef }, "Payload CBS invalide — champs obligatoires manquants");
    // On crée quand même un client minimal pour traçabilité
    const fallback = await createMinimalCustomer(payload, cbsRef, now);
    return buildResult({
      decision:    "REJECTED",
      reasonCode:  "REJECTED_INVALID_PAYLOAD",
      reason:      "Payload CBS invalide : nom, CIN ou date_naissance manquant",
      customer:    fallback,
      screening:   { status: "CLEAR", matchScore: 0, matchedEntity: null, listSource: null },
      riskScore:   0,
      riskLevel:   "LOW",
      start, now, cbsRef,
    });
  }

  // ── 2. Vérification doublon CIN ────────────────────────────────────────────
  const existingByCin = await db.select({ id: customers.id, customerId: customers.customerId })
    .from(customers)
    .where(eq(customers.nicNumber, payload.CIN.toUpperCase()))
    .limit(1);

  if (existingByCin.length > 0) {
    const existing = existingByCin[0]!;
    log.warn({ cbsRef, cin: payload.CIN, existingId: existing.id }, "CIN déjà en base");
    // Retourner une référence vers l'existant plutôt que créer un doublon
    const customer = await db.select().from(customers)
      .where(eq(customers.id, existing.id)).limit(1).then(r => r[0]!);
    return buildResult({
      decision:   "IN_REVIEW",
      reasonCode: "REVIEW_DUPLICATE_CIN",
      reason:     `Client avec CIN ${payload.CIN} déjà enregistré (${existing.customerId}) — vérification requise`,
      customer,
      screening:  { status: "CLEAR", matchScore: 0, matchedEntity: null, listSource: null },
      riskScore:  customer.riskScore ?? 0,
      riskLevel:  (customer.riskLevel ?? "LOW") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      start, now, cbsRef,
    });
  }

  // ── 3. Création client ─────────────────────────────────────────────────────
  const customerRef = `KYC-${nanoid(8).toUpperCase()}`;
  const dateOfBirth = normalizeDateOfBirth(payload.date_naissance);

  const customer = await insertCustomer({
    customerId:       customerRef,
    firstName:        payload.prenom || "",
    lastName:         payload.nom.toUpperCase(),
    dateOfBirth:      dateOfBirth ?? null,
    nationality:      payload.nationalite ?? "MA",
    customerType:     "INDIVIDUAL",
    kycStatus:        "PENDING",
    riskLevel:        "LOW",
    riskScore:        0,
    pepStatus:        false,
    nicNumber:        payload.CIN.toUpperCase(),
    birthCity:        payload.ville_naissance ?? null,
    birthCountry:     payload.pays_naissance  ?? null,
  });

  log.info({ customerId: customer.id, customerRef }, "Client créé");

  // ── 4. Screening sanctions synchrone ──────────────────────────────────────
  const fullName       = `${payload.nom} ${payload.prenom}`.trim();
  const screeningResult = await screenCustomer(customer.id, fullName);

  log.info({
    customerId: customer.id,
    screeningStatus: screeningResult.status,
    score: screeningResult.sanctionsResult.matchScore,
  }, "Screening terminé");

  // UC-2 : MATCH sanctions → rejet immédiat
  if (screeningResult.status === "MATCH") {
    // Passer le client en REJECTED
    await db.update(customers)
      .set({ kycStatus: "REJECTED", sanctionStatus: "MATCH", updatedAt: now })
      .where(eq(customers.id, customer.id));

    // Créer alerte CRITICAL
    await db.insert(alerts).values({
      alertId:    `CBS-SANC-${nanoid(8).toUpperCase()}`,
      customerId: customer.id,
      scenario:   "SANCTIONS_MATCH",
      alertType:  "IDENTITY",
      priority:   "CRITICAL",
      status:     "OPEN",
      riskScore:  100,
      reason:     `CBS onboarding rejeté — Correspondance sanctions détectée : ` +
                  `${screeningResult.sanctionsResult.matchedEntity} ` +
                  `(${screeningResult.sanctionsResult.listSource}, ` +
                  `score ${screeningResult.sanctionsResult.matchScore})`,
      enrichmentData: {
        cbsRef,
        cin: payload.CIN,
        matchedEntity: screeningResult.sanctionsResult.matchedEntity,
        listSource:    screeningResult.sanctionsResult.listSource,
        matchScore:    screeningResult.sanctionsResult.matchScore,
      },
      createdAt: now,
      updatedAt: now,
    });

    return buildResult({
      decision:   "REJECTED",
      reasonCode: "REJECTED_SANCTIONS_MATCH",
      reason:     `Correspondance sanctions : ${screeningResult.sanctionsResult.matchedEntity} ` +
                  `(${screeningResult.sanctionsResult.listSource})`,
      customer:   { ...customer, kycStatus: "REJECTED" as const },
      screening: {
        status:        screeningResult.status,
        matchScore:    screeningResult.sanctionsResult.matchScore ?? 0,
        matchedEntity: screeningResult.sanctionsResult.matchedEntity,
        listSource:    screeningResult.sanctionsResult.listSource,
      },
      riskScore: 100,
      riskLevel: "CRITICAL",
      start, now, cbsRef,
    });
  }

  // ── 5. Vérification document (si fourni par CBS) ───────────────────────────
  let docReasonCode: CbsReasonCode | null = null;
  let docReason:     string               = "";

  if (payload.document?.expiryDate) {
    const expiry = payload.document.expiryDate;

    // Créer l'entrée document en DB
    await db.insert(documents).values({
      customerId:   customer.id,
      documentType: payload.document.type ?? "ID_CARD",
      documentNumber: payload.document.number ?? payload.CIN,
      expiryDate:   expiry,
      status:       isDocumentExpired(expiry) ? "EXPIRED" : "APPROVED",
      ekycStatus:   "PENDING",
      createdAt:    now,
      updatedAt:    now,
    });

    if (isDocumentExpired(expiry)) {
      docReasonCode = "REVIEW_DOCUMENT_EXPIRED";
      docReason     = `Document ${payload.document.type} expiré le ${expiry}`;
    } else if (isDocumentExpiringSoon(expiry)) {
      docReasonCode = "REVIEW_DOCUMENT_EXPIRING_SOON";
      docReason     = `Document ${payload.document.type} expire le ${expiry} (bientôt)`;
    }
  }

  // ── 6. Calcul score risque initial ─────────────────────────────────────────
  let riskScore = 0;
  let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";

  // Screening REVIEW → risque médium
  if (screeningResult.status === "REVIEW") riskScore += 30;
  // Nationalité étrangère
  if (payload.nationalite && payload.nationalite !== "MA") riskScore += 10;
  // Document expirant bientôt
  if (docReasonCode === "REVIEW_DOCUMENT_EXPIRING_SOON") riskScore += 5;
  // Document expiré
  if (docReasonCode === "REVIEW_DOCUMENT_EXPIRED") riskScore += 20;

  if      (riskScore >= 70) riskLevel = "CRITICAL";
  else if (riskScore >= 50) riskLevel = "HIGH";
  else if (riskScore >= 20) riskLevel = "MEDIUM";

  // ── 7. Décision finale ─────────────────────────────────────────────────────
  let decision:   "APPROVED" | "IN_REVIEW" | "REJECTED" = "APPROVED";
  let reasonCode: CbsReasonCode = "APPROVED_CLEAR";
  let reason                    = "Screening CLEAR — client approuvé";

  if (screeningResult.status === "REVIEW") {
    decision   = "IN_REVIEW";
    reasonCode = "REVIEW_SANCTIONS_PARTIAL";
    reason     = `Correspondance partielle screening (score ${screeningResult.sanctionsResult.matchScore}) — révision manuelle requise`;
  } else if (docReasonCode === "REVIEW_DOCUMENT_EXPIRED") {
    decision   = "IN_REVIEW";
    reasonCode = docReasonCode;
    reason     = docReason;
  } else if (docReasonCode === "REVIEW_DOCUMENT_EXPIRING_SOON") {
    // Document expirant bientôt → APPROVED mais avec alerte
    decision   = "APPROVED";
    reasonCode = "APPROVED_CLEAR";
    reason     = `Screening CLEAR — approuvé (${docReason})`;
  }

  // Mettre à jour le client avec la décision
  const finalKycStatus = decision === "APPROVED" ? "APPROVED"
    : decision === "REJECTED" ? "REJECTED"
    : "IN_REVIEW";

  const nextReviewDate = decision === "APPROVED"
    ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
    : null;

  await db.update(customers)
    .set({
      kycStatus:    finalKycStatus,
      riskScore,
      riskLevel,
      sanctionStatus: screeningResult.status === "CLEAR" ? "CLEAR" : screeningResult.status,
      ...(nextReviewDate ? { nextReviewDate, lastReviewDate: now } : {}),
      updatedAt: now,
    })
    .where(eq(customers.id, customer.id));

  log.info({
    customerId: customer.id,
    decision,
    reasonCode,
    riskLevel,
    riskScore,
    durationMs: Date.now() - start,
  }, "CBS onboarding terminé");

  return buildResult({
    decision,
    reasonCode,
    reason,
    customer: { ...customer, kycStatus: finalKycStatus as typeof customer.kycStatus },
    screening: {
      status:        screeningResult.status,
      matchScore:    screeningResult.sanctionsResult.matchScore ?? 0,
      matchedEntity: screeningResult.sanctionsResult.matchedEntity,
      listSource:    screeningResult.sanctionsResult.listSource,
    },
    riskScore,
    riskLevel,
    start,
    now,
    cbsRef,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createMinimalCustomer(
  payload: CbsOnboardingPayload,
  cbsRef:  string,
  now:     Date,
) {
  const ref = `KYC-ERR-${nanoid(6).toUpperCase()}`;
  return insertCustomer({
    customerId:  ref,
    firstName:   payload.prenom   || "INCONNU",
    lastName:    payload.nom      || "INCONNU",
    kycStatus:   "REJECTED",
    riskLevel:   "LOW",
    riskScore:   0,
    pepStatus:   false,
    customerType: "INDIVIDUAL",
    nicNumber:   payload.CIN      || null,
  });
}

function buildResult(args: {
  decision:   "APPROVED" | "IN_REVIEW" | "REJECTED";
  reasonCode: CbsReasonCode;
  reason:     string;
  customer:   { id: number; customerId: string; riskLevel: string; riskScore: number };
  screening:  { status: "CLEAR" | "MATCH" | "REVIEW"; matchScore: number; matchedEntity: string | null; listSource: string | null };
  riskScore:  number;
  riskLevel:  "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  start:      number;
  now:        Date;
  cbsRef:     string;
}): CbsOnboardingResult {
  return {
    decision:    args.decision,
    reason:      args.reason,
    reasonCode:  args.reasonCode,
    customerId:  args.customer.id,
    customerRef: args.customer.customerId,
    riskLevel:   args.riskLevel,
    riskScore:   args.riskScore,
    screening:   args.screening,
    processedAt: args.now.toISOString(),
    durationMs:  Date.now() - args.start,
    cbsRef:      args.cbsRef,
  };
}
