/**
 * CBS Onboarding Service — UC-1, UC-2, UC-3, UC-4, UC-5
 *
 * Pipeline synchrone (< 5s) :
 *  1. Validation & normalisation du payload CBS
 *  2. Vérification doublon CIN
 *  3. Création client
 *  4. Screening sanctions (UC-1 / UC-2)
 *  5. Screening PEP séparé (UC-3)
 *  6. OCR image document si fournie → cohérence CBS↔OCR (UC-4)
 *  7. Vérification expiration document (UC-5)
 *  8. Calcul score risque initial
 *  9. Décision finale → APPROVED / IN_REVIEW / REJECTED
 *
 * UC-1 : Happy Path → APPROVED
 * UC-2 : Sanctions MATCH → REJECTED immédiat + alerte CRITICAL
 * UC-3 : PEP détecté → IN_REVIEW + EDD + alerte HIGH
 * UC-4 : Discordance CBS↔OCR → IN_REVIEW + alerte FRAUD
 * UC-5 : Document expiré à l'ouverture → IN_REVIEW + alerte CRITICAL
 * UC-6 : Expiration en vie → scheduler doc-expiry (déjà implémenté)
 */

import { nanoid }       from "nanoid";
import { eq }           from "drizzle-orm";
import { db }           from "../../_core/db";
import { createLogger } from "../../_core/logger";
import { customers, documents, alerts } from "../../../drizzle/schema";
import { insertCustomer }               from "../customers/customers.repository";
import { screenCustomer, getSanctionLists } from "../screening/screening.service";
import { matchAgainstMultipleLists }    from "../screening/screening.matcher";
import { insertScreeningResult }        from "../screening/screening.repository";
import { runOcr, type OcrData }         from "../documents/ocr.service";
import { ENV }                          from "../../_core/env";

const log = createLogger("cbs-onboarding");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CbsOnboardingPayload {
  ID:              string;      // registration.slice(-8)
  code:            string;      // "entree" | "matcash"
  nom:             string;
  prenom:          string;
  date_naissance:  string;      // "DD/MM/YYYY" ou "YYYY-MM-DD"
  CIN:             string;
  nationalite?:    string;
  ville_naissance?: string;
  pays_naissance?:  string;
  document?: {
    type:         "ID_CARD" | "PASSPORT" | "DRIVING_LICENSE";
    expiryDate?:  string;       // "YYYY-MM-DD"
    number?:      string;
    imageBase64?: string;       // image du document encodée base64 (UC-4)
    mimeType?:    string;       // "image/jpeg" | "image/png" | "application/pdf"
  };
}

export interface CbsOnboardingResult {
  decision:    "APPROVED" | "IN_REVIEW" | "REJECTED";
  reason:      string;
  reasonCode:  CbsReasonCode;
  customerId:  number;
  customerRef: string;
  riskLevel:   "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskScore:   number;
  screening: {
    status:        "CLEAR" | "MATCH" | "REVIEW";
    matchScore:    number;
    matchedEntity: string | null;
    listSource:    string | null;
  };
  pep?: {
    detected:      boolean;
    matchScore:    number;
    matchedEntity: string | null;
    requiresEdd:   boolean;
  };
  ocr?: {
    performed:    boolean;
    coherent:     boolean;
    mismatches:   OcrMismatch[];
    confidence:   number;
  };
  processedAt: string;
  durationMs:  number;
  cbsRef:      string;
}

export interface OcrMismatch {
  field:    string;
  cbsValue: string;
  ocrValue: string;
  severity: "BLOCKING" | "WARNING";
}

type CbsReasonCode =
  | "APPROVED_CLEAR"
  | "REVIEW_SANCTIONS_PARTIAL"
  | "REVIEW_PEP_DETECTED"
  | "REVIEW_DOCUMENT_EXPIRED"
  | "REVIEW_DOCUMENT_EXPIRING_SOON"
  | "REVIEW_DOCUMENT_MISMATCH"
  | "REVIEW_DUPLICATE_CIN"
  | "REJECTED_SANCTIONS_MATCH"
  | "REJECTED_INVALID_PAYLOAD";

// ─── Helpers dates ────────────────────────────────────────────────────────────

function normalizeDateOfBirth(raw: string): string | undefined {
  if (!raw) return undefined;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  return undefined;
}

function isDocumentExpired(expiryDate: string): boolean {
  return expiryDate < new Date().toISOString().split("T")[0]!;
}

function isDocumentExpiringSoon(expiryDate: string, warnDays = 30): boolean {
  const today   = new Date().toISOString().split("T")[0]!;
  const warnDate = new Date();
  warnDate.setDate(warnDate.getDate() + warnDays);
  const warnStr = warnDate.toISOString().split("T")[0]!;
  return expiryDate >= today && expiryDate <= warnStr;
}

// ─── UC-4 : Vérification cohérence CBS ↔ OCR ─────────────────────────────────

/**
 * Calcule la similarité entre deux chaînes (Levenshtein normalisé, 0-100).
 * Utilisé pour comparer les champs texte avec tolérance aux erreurs OCR.
 */
function stringSimilarity(a: string, b: string): number {
  const s1 = a.toUpperCase().trim();
  const s2 = b.toUpperCase().trim();
  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;

  const maxLen = Math.max(s1.length, s2.length);
  const dp: number[][] = Array.from({ length: s1.length + 1 }, (_, i) =>
    Array.from({ length: s2.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      dp[i]![j] = s1[i - 1] === s2[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }

  const distance = dp[s1.length]![s2.length]!;
  return Math.round((1 - distance / maxLen) * 100);
}

/**
 * Compare les données CBS avec les données OCR et retourne la liste des
 * discordances avec leur sévérité.
 *
 * Seuils :
 *   Nom/Prénom  : similitude < 70 % → BLOCKING
 *   Date naiss. : écart > 365 jours → BLOCKING (tolérance format OCR)
 *   Numéro CIN  : différent → BLOCKING
 */
function checkCoherence(
  payload: CbsOnboardingPayload,
  ocr:     OcrData,
  cbsDob:  string | undefined,
): OcrMismatch[] {
  const mismatches: OcrMismatch[] = [];

  // ── Nom ────────────────────────────────────────────────────────────────────
  if (ocr.lastName) {
    const sim = stringSimilarity(payload.nom, ocr.lastName);
    if (sim < 70) {
      mismatches.push({
        field:    "nom",
        cbsValue: payload.nom,
        ocrValue: ocr.lastName,
        severity: "BLOCKING",
      });
    }
  }

  // ── Prénom ─────────────────────────────────────────────────────────────────
  if (ocr.firstName && payload.prenom) {
    const sim = stringSimilarity(payload.prenom, ocr.firstName);
    if (sim < 70) {
      mismatches.push({
        field:    "prenom",
        cbsValue: payload.prenom,
        ocrValue: ocr.firstName,
        severity: "BLOCKING",
      });
    }
  }

  // ── Date de naissance ──────────────────────────────────────────────────────
  if (ocr.dateOfBirth && cbsDob) {
    const ocrDate = new Date(ocr.dateOfBirth);
    const cbsDate = new Date(cbsDob);
    if (!isNaN(ocrDate.getTime()) && !isNaN(cbsDate.getTime())) {
      const diffDays = Math.abs(ocrDate.getTime() - cbsDate.getTime()) / 86_400_000;
      if (diffDays > 365) {
        mismatches.push({
          field:    "date_naissance",
          cbsValue: cbsDob,
          ocrValue: ocr.dateOfBirth,
          severity: "BLOCKING",
        });
      } else if (diffDays > 1) {
        // Tolérance 1 jour pour les formats
        mismatches.push({
          field:    "date_naissance",
          cbsValue: cbsDob,
          ocrValue: ocr.dateOfBirth,
          severity: "WARNING",
        });
      }
    }
  }

  // ── Numéro CIN ────────────────────────────────────────────────────────────
  if (ocr.documentNumber && payload.CIN) {
    const ocrCin  = ocr.documentNumber.replace(/\s/g, "").toUpperCase();
    const cbsCin  = payload.CIN.replace(/\s/g, "").toUpperCase();
    if (ocrCin !== cbsCin) {
      mismatches.push({
        field:    "CIN",
        cbsValue: cbsCin,
        ocrValue: ocrCin,
        severity: "BLOCKING",
      });
    }
  }

  return mismatches;
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

export async function processCbsOnboarding(
  payload: CbsOnboardingPayload,
  cbsRef:  string,
): Promise<CbsOnboardingResult> {
  const start = Date.now();
  const now   = new Date();

  log.info({ cbsRef, cin: payload.CIN, code: payload.code }, "CBS onboarding reçu");

  // ── 1. Validation ──────────────────────────────────────────────────────────
  if (!payload.nom || !payload.CIN || !payload.date_naissance) {
    const fallback = await createMinimalCustomer(payload, now);
    return buildResult({
      decision:   "REJECTED",
      reasonCode: "REJECTED_INVALID_PAYLOAD",
      reason:     "Payload CBS invalide : nom, CIN ou date_naissance manquant",
      customer:   fallback,
      screening:  { status: "CLEAR", matchScore: 0, matchedEntity: null, listSource: null },
      riskScore: 0, riskLevel: "LOW", start, now, cbsRef,
    });
  }

  // ── 2. Doublon CIN ─────────────────────────────────────────────────────────
  const existingByCin = await db
    .select({ id: customers.id, customerId: customers.customerId })
    .from(customers)
    .where(eq(customers.nicNumber, payload.CIN.toUpperCase()))
    .limit(1);

  if (existingByCin.length > 0) {
    const ex = existingByCin[0]!;
    log.warn({ cbsRef, cin: payload.CIN, existingId: ex.id }, "CIN déjà en base");
    const customer = await db.select().from(customers)
      .where(eq(customers.id, ex.id)).limit(1).then(r => r[0]!);
    return buildResult({
      decision:   "IN_REVIEW",
      reasonCode: "REVIEW_DUPLICATE_CIN",
      reason:     `Client avec CIN ${payload.CIN} déjà enregistré (${ex.customerId}) — vérification requise`,
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
    customerId:  customerRef,
    firstName:   payload.prenom || "",
    lastName:    payload.nom.toUpperCase(),
    dateOfBirth: dateOfBirth ?? null,
    nationality: payload.nationalite ?? "MA",
    customerType: "INDIVIDUAL",
    kycStatus:   "PENDING",
    riskLevel:   "LOW",
    riskScore:   0,
    pepStatus:   false,
    nicNumber:   payload.CIN.toUpperCase(),
    birthCity:   payload.ville_naissance ?? null,
    birthCountry: payload.pays_naissance  ?? null,
    cbsRef:      payload.ID,
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

  // UC-2 : MATCH → rejet immédiat
  if (screeningResult.status === "MATCH") {
    await db.update(customers)
      .set({ kycStatus: "REJECTED", sanctionStatus: "MATCH", updatedAt: now })
      .where(eq(customers.id, customer.id));

    await db.insert(alerts).values({
      alertId:        `CBS-SANC-${nanoid(8).toUpperCase()}`,
      customerId:     customer.id,
      scenario:       "SANCTIONS_MATCH",
      alertType:      "SANCTIONS",
      priority:       "CRITICAL",
      status:         "OPEN",
      riskScore:      100,
      reason:         `CBS onboarding rejeté — Correspondance sanctions : ` +
                      `${screeningResult.sanctionsResult.matchedEntity} ` +
                      `(${screeningResult.sanctionsResult.listSource}, score ${screeningResult.sanctionsResult.matchScore})`,
      enrichmentData: {
        cbsRef, cin: payload.CIN,
        matchedEntity: screeningResult.sanctionsResult.matchedEntity,
        listSource:    screeningResult.sanctionsResult.listSource,
        matchScore:    screeningResult.sanctionsResult.matchScore,
      },
      createdAt: now, updatedAt: now,
    });

    return buildResult({
      decision:   "REJECTED",
      reasonCode: "REJECTED_SANCTIONS_MATCH",
      reason:     `Correspondance sanctions : ${screeningResult.sanctionsResult.matchedEntity} (${screeningResult.sanctionsResult.listSource})`,
      customer:   { ...customer, kycStatus: "REJECTED" as const },
      screening: {
        status:        screeningResult.status,
        matchScore:    screeningResult.sanctionsResult.matchScore ?? 0,
        matchedEntity: screeningResult.sanctionsResult.matchedEntity,
        listSource:    screeningResult.sanctionsResult.listSource,
      },
      riskScore: 100, riskLevel: "CRITICAL", start, now, cbsRef,
    });
  }

  // ── 5. Screening PEP séparé (UC-3) ────────────────────────────────────────
  let pepDetected   = false;
  let pepMatchScore = 0;
  let pepEntity:    string | null = null;

  try {
    const allEntities = await getSanctionLists();
    const pepEntities = allEntities.filter(e => e.listSource === "PEP");

    if (pepEntities.length > 0) {
      const pepThreshold = ENV.SCREENING_REVIEW_THRESHOLD; // même seuil que REVIEW
      const { bestMatch } = matchAgainstMultipleLists(fullName, pepEntities, pepThreshold);

      pepMatchScore = bestMatch.score;
      pepDetected   = bestMatch.score >= pepThreshold;
      pepEntity     = bestMatch.matchedEntity ?? null;

      if (pepDetected) {
        log.info({ customerId: customer.id, pepEntity, pepMatchScore }, "UC-3 : PEP détecté");

        // Marquer le client comme PEP
        await db.update(customers)
          .set({ pepStatus: true, customerType: "PEP", updatedAt: now })
          .where(eq(customers.id, customer.id));

        // Enregistrer le résultat screening PEP
        await insertScreeningResult({
          customerId:      customer.id,
          screeningType:   "PEP",
          status:          pepMatchScore >= ENV.SCREENING_MATCH_THRESHOLD ? "MATCH" : "REVIEW",
          matchScore:      pepMatchScore,
          matchedEntity:   pepEntity,
          listSource:      "PEP",
          confidenceScore: pepMatchScore,
          details: {
            matchedEntity: pepEntity,
            matchScore:    pepMatchScore,
            threshold:     pepThreshold,
            requiresEdd:   true,
          } as unknown as null,
          decision: "PENDING",
        });

        // Alerte PEP HIGH
        await db.insert(alerts).values({
          alertId:        `CBS-PEP-${nanoid(8).toUpperCase()}`,
          customerId:     customer.id,
          scenario:       "PEP_MATCH",
          alertType:      "PEP",
          priority:       "HIGH",
          status:         "OPEN",
          riskScore:      70,
          reason:         `CBS onboarding — PEP détecté : ${pepEntity} ` +
                          `(score ${pepMatchScore}) — EDD (Enhanced Due Diligence) obligatoire`,
          enrichmentData: {
            cbsRef, cin: payload.CIN,
            matchedEntity: pepEntity,
            matchScore:    pepMatchScore,
            requiresEdd:   true,
            eddChecklist: [
              "Vérifier la source des fonds",
              "Obtenir justificatifs patrimoine",
              "Valider l'origine des revenus",
              "Approbation supervisor obligatoire",
            ],
          },
          createdAt: now, updatedAt: now,
        });
      }
    }
  } catch (pepErr) {
    log.error({ customerId: customer.id, pepErr }, "UC-3 : screening PEP échoué — poursuite");
  }

  // ── 6. OCR + cohérence CBS↔document (UC-4) ────────────────────────────────
  let ocrResult: OcrData | null        = null;
  let ocrMismatches: OcrMismatch[]     = [];
  let ocrCoherent                      = true;
  let hasBlockingMismatch              = false;

  if (payload.document?.imageBase64) {
    log.info({ customerId: customer.id }, "UC-4 : OCR document CBS en cours");
    try {
      const imgBuffer = Buffer.from(payload.document.imageBase64, "base64");
      const mimeType  = payload.document.mimeType ?? "image/jpeg";
      ocrResult       = await runOcr(imgBuffer, mimeType, payload.document.type ?? "ID_CARD");

      log.info({ customerId: customer.id, confidence: ocrResult.confidence, hasMrz: !!ocrResult.mrz }, "OCR terminé");

      // Comparer CBS vs OCR uniquement si OCR a extrait des données exploitables
      if (ocrResult.confidence >= 40 || ocrResult.mrz) {
        ocrMismatches = checkCoherence(payload, ocrResult, dateOfBirth);
        hasBlockingMismatch = ocrMismatches.some(m => m.severity === "BLOCKING");
        ocrCoherent = ocrMismatches.length === 0;

        if (ocrMismatches.length > 0) {
          log.warn({ customerId: customer.id, mismatches: ocrMismatches }, "UC-4 : discordances CBS↔OCR détectées");
        }
      }

      // Enregistrer le document avec les données OCR
      const docExpiry = payload.document.expiryDate ?? ocrResult.expiryDate;
      await db.insert(documents).values({
        customerId:     customer.id,
        documentType:   payload.document.type ?? "ID_CARD",
        documentNumber: payload.document.number ?? ocrResult.documentNumber ?? payload.CIN,
        expiryDate:     docExpiry ?? null,
        status:         docExpiry && isDocumentExpired(docExpiry) ? "EXPIRED" : "APPROVED",
        ocrData:        ocrResult as unknown as null,
        ocrRawText:     ocrResult.rawText,
        ocrConfidence:  ocrResult.confidence,
        ocrProcessedAt: now,
        mrzData:        ocrResult.mrz as unknown as null ?? null,
        ekycStatus:     "PENDING",
        createdAt:      now,
        updatedAt:      now,
      });

    } catch (ocrErr) {
      log.error({ customerId: customer.id, ocrErr }, "UC-4 : OCR échoué — poursuite sans vérification");
    }
  } else if (payload.document?.expiryDate || payload.document?.number) {
    // Document sans image → on enregistre juste les métadonnées
    const expiry = payload.document.expiryDate;
    await db.insert(documents).values({
      customerId:     customer.id,
      documentType:   payload.document.type ?? "ID_CARD",
      documentNumber: payload.document.number ?? payload.CIN,
      expiryDate:     expiry ?? null,
      status:         expiry && isDocumentExpired(expiry) ? "EXPIRED" : "APPROVED",
      ekycStatus:     "PENDING",
      createdAt:      now,
      updatedAt:      now,
    });
  }

  // ── 6. Vérification expiration document (UC-5) ────────────────────────────
  const docExpiry = payload.document?.expiryDate ?? ocrResult?.expiryDate;
  let docReasonCode: CbsReasonCode | null = null;
  let docReason                           = "";

  if (docExpiry) {
    if (isDocumentExpired(docExpiry)) {
      // UC-5 : document expiré → IN_REVIEW + alerte CRITICAL
      docReasonCode = "REVIEW_DOCUMENT_EXPIRED";
      const daysOver = Math.ceil((now.getTime() - new Date(docExpiry).getTime()) / 86_400_000);
      docReason = `Document ${payload.document?.type ?? "ID_CARD"} expiré depuis ${daysOver} jour(s) (${docExpiry})`;

      await db.update(customers)
        .set({ kycStatus: "IN_REVIEW", updatedAt: now })
        .where(eq(customers.id, customer.id));

      await db.insert(alerts).values({
        alertId:        `CBS-DOCEXP-${nanoid(8).toUpperCase()}`,
        customerId:     customer.id,
        scenario:       "DOCUMENT_EXPIRY",
        alertType:      "SANCTIONS",
        priority:       "CRITICAL",
        status:         "OPEN",
        riskScore:      85,
        reason:         `Onboarding CBS bloqué — ${docReason} — Client ${payload.nom} ${payload.prenom} (CIN: ${payload.CIN})`,
        enrichmentData: { cbsRef, docExpiry, daysOver, cin: payload.CIN },
        createdAt:      now,
        updatedAt:      now,
      });

      log.warn({ customerId: customer.id, docExpiry, daysOver }, "UC-5 : document expiré à l'onboarding");

    } else if (isDocumentExpiringSoon(docExpiry)) {
      docReasonCode = "REVIEW_DOCUMENT_EXPIRING_SOON";
      const daysLeft = Math.ceil((new Date(docExpiry).getTime() - now.getTime()) / 86_400_000);
      docReason = `Document expire dans ${daysLeft} jour(s) (${docExpiry})`;
    }
  }

  // ── UC-4 : alerte discordance CBS↔OCR ─────────────────────────────────────
  if (hasBlockingMismatch) {
    await db.insert(alerts).values({
      alertId:        `CBS-MISM-${nanoid(8).toUpperCase()}`,
      customerId:     customer.id,
      scenario:       "DOCUMENT_MISMATCH",
      alertType:      "FRAUD",
      priority:       "HIGH",
      status:         "OPEN",
      riskScore:      75,
      reason:         `Discordance CBS↔OCR — ${ocrMismatches.length} champ(s) non concordant(s) : ` +
                      ocrMismatches.filter(m => m.severity === "BLOCKING")
                        .map(m => `${m.field} (CBS:"${m.cbsValue}" / OCR:"${m.ocrValue}")`)
                        .join(", "),
      enrichmentData: { cbsRef, mismatches: ocrMismatches, ocrConfidence: ocrResult?.confidence },
      createdAt:      now,
      updatedAt:      now,
    });

    log.warn({ customerId: customer.id, mismatches: ocrMismatches }, "UC-4 : alerte discordance créée");
  }

  // ── 7. Score risque initial ────────────────────────────────────────────────
  let riskScore = 0;
  let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";

  if (screeningResult.status === "REVIEW") riskScore += 30;
  if (pepDetected)                         riskScore += 40;  // PEP = risque élevé par défaut
  if (payload.nationalite && payload.nationalite !== "MA") riskScore += 10;
  if (hasBlockingMismatch)                 riskScore += 35;
  if (docReasonCode === "REVIEW_DOCUMENT_EXPIRING_SOON") riskScore += 5;
  if (docReasonCode === "REVIEW_DOCUMENT_EXPIRED")       riskScore += 25;

  if      (riskScore >= 70) riskLevel = "CRITICAL";
  else if (riskScore >= 50) riskLevel = "HIGH";
  else if (riskScore >= 20) riskLevel = "MEDIUM";

  // ── 8. Décision finale ────────────────────────────────────────────────────
  let decision:   "APPROVED" | "IN_REVIEW" | "REJECTED" = "APPROVED";
  let reasonCode: CbsReasonCode = "APPROVED_CLEAR";
  let reason                    = "Screening CLEAR — client approuvé";

  if (hasBlockingMismatch) {
    decision   = "IN_REVIEW";
    reasonCode = "REVIEW_DOCUMENT_MISMATCH";
    reason     = `Discordance données CBS↔document : ${ocrMismatches.filter(m => m.severity === "BLOCKING").map(m => m.field).join(", ")}`;
  } else if (docReasonCode === "REVIEW_DOCUMENT_EXPIRED") {
    decision   = "IN_REVIEW";
    reasonCode = docReasonCode;
    reason     = docReason;
  } else if (pepDetected) {
    decision   = "IN_REVIEW";
    reasonCode = "REVIEW_PEP_DETECTED";
    reason     = `PEP détecté : ${pepEntity} (score ${pepMatchScore}) — EDD obligatoire avant approbation`;
  } else if (screeningResult.status === "REVIEW") {
    decision   = "IN_REVIEW";
    reasonCode = "REVIEW_SANCTIONS_PARTIAL";
    reason     = `Correspondance partielle screening (score ${screeningResult.sanctionsResult.matchScore}) — révision requise`;
  }

  // Finaliser le statut client
  const finalKycStatus = decision === "APPROVED" ? "APPROVED" : "IN_REVIEW";
  const nextReviewDate = decision === "APPROVED"
    ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()) : null;

  await db.update(customers)
    .set({
      kycStatus:     finalKycStatus,
      riskScore,
      riskLevel,
      sanctionStatus: screeningResult.status === "CLEAR" ? "CLEAR" : screeningResult.status,
      ...(nextReviewDate ? { nextReviewDate, lastReviewDate: now } : {}),
      updatedAt: now,
    })
    .where(eq(customers.id, customer.id));

  log.info({
    customerId: customer.id, decision, reasonCode, riskLevel, riskScore,
    ocrPerformed: !!ocrResult, hasBlockingMismatch,
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
    start, now, cbsRef,
    pep: {
      detected:      pepDetected,
      matchScore:    pepMatchScore,
      matchedEntity: pepEntity,
      requiresEdd:   pepDetected,
    },
    ocr: ocrResult ? {
      performed:  true,
      coherent:   ocrCoherent,
      mismatches: ocrMismatches,
      confidence: ocrResult.confidence,
    } : undefined,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createMinimalCustomer(payload: CbsOnboardingPayload, now: Date) {
  return insertCustomer({
    customerId:   `KYC-ERR-${nanoid(6).toUpperCase()}`,
    firstName:    payload.prenom || "INCONNU",
    lastName:     payload.nom    || "INCONNU",
    kycStatus:    "REJECTED",
    riskLevel:    "LOW",
    riskScore:    0,
    pepStatus:    false,
    customerType: "INDIVIDUAL",
    nicNumber:    payload.CIN || null,
  });
}

function buildResult(args: {
  decision:    "APPROVED" | "IN_REVIEW" | "REJECTED";
  reasonCode:  CbsReasonCode;
  reason:      string;
  customer:    { id: number; customerId: string; riskLevel: string; riskScore: number };
  screening:   { status: "CLEAR" | "MATCH" | "REVIEW"; matchScore: number; matchedEntity: string | null; listSource: string | null };
  riskScore:   number;
  riskLevel:   "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  start:       number;
  now:         Date;
  cbsRef:      string;
  pep?:        CbsOnboardingResult["pep"];
  ocr?:        CbsOnboardingResult["ocr"];
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
    ...(args.pep ? { pep: args.pep } : {}),
    ...(args.ocr ? { ocr: args.ocr } : {}),
    processedAt: args.now.toISOString(),
    durationMs:  Date.now() - args.start,
    cbsRef:      args.cbsRef,
  };
}
