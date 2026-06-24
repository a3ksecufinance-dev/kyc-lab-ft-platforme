/**
 * CBS Réactivation Service — UC-8
 *
 * Client bloqué (kycStatus=REJECTED ou document EXPIRED) revient avec un
 * nouveau document. Pipeline :
 *  1. Vérifier que le client existe et est bien bloqué/en révision
 *  2. Re-screening sanctions complet (listes ont pu évoluer)
 *  3. Re-screening PEP
 *  4. OCR nouveau document (si image fournie)
 *  5. Vérifier expiration nouveau document
 *  6. Décision : APPROVED / IN_REVIEW / REJECTED
 *  7. Si APPROVED → compte réactivé + nextReviewDate dans 1 an
 *  8. Si le client était REJECTED pour sanctions → dossier SAR potentiel
 */

import { nanoid }       from "nanoid";
import { eq, desc }     from "drizzle-orm";
import { db }           from "../../_core/db";
import { createLogger } from "../../_core/logger";
import { customers, documents, alerts, screeningResults } from "../../../drizzle/schema";
import { screenCustomer, getSanctionLists } from "../screening/screening.service";
import { matchAgainstMultipleLists }        from "../screening/screening.matcher";
import { insertScreeningResult }            from "../screening/screening.repository";
import { runOcr }                           from "../documents/ocr.service";
import { ENV }                              from "../../_core/env";

const log = createLogger("cbs-reactivation");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CbsReactivationPayload {
  CIN:         string;           // CIN du client à réactiver
  cbsRef?:     string;           // nouvelle référence CBS
  newDocument: {
    type:         "ID_CARD" | "PASSPORT" | "DRIVING_LICENSE";
    expiryDate:   string;        // "YYYY-MM-DD" — obligatoire pour la réactivation
    number?:      string;
    imageBase64?: string;
    mimeType?:    string;
  };
}

export interface CbsReactivationResult {
  decision:        "APPROVED" | "IN_REVIEW" | "REJECTED";
  reason:          string;
  reasonCode:      string;
  customerId:      number;
  customerRef:     string;
  previousStatus:  string;
  riskLevel:       "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskScore:       number;
  screening: {
    sanctions: "CLEAR" | "MATCH" | "REVIEW";
    pep:       boolean;
  };
  sarWarning:      boolean;      // true si client était REJECTED sanctions — SAR à considérer
  processedAt:     string;
  durationMs:      number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export async function processCbsReactivation(
  payload: CbsReactivationPayload,
  cbsRef:  string,
): Promise<CbsReactivationResult> {
  const start = Date.now();
  const now   = new Date();

  log.info({ cbsRef, cin: payload.CIN }, "UC-8 : réactivation CBS reçue");

  // ── 1. Trouver le client par CIN ──────────────────────────────────────────
  const existing = await db.select().from(customers)
    .where(eq(customers.nicNumber, payload.CIN.toUpperCase()))
    .limit(1)
    .then(r => r[0]);

  if (!existing) {
    throw new Error(`Aucun client avec CIN ${payload.CIN} trouvé`);
  }

  const previousStatus = existing.kycStatus;
  log.info({ customerId: existing.id, previousStatus }, "Client trouvé pour réactivation");

  // ── 2. Vérifier la date d'expiration du nouveau document ─────────────────
  const today = new Date().toISOString().split("T")[0]!;
  if (payload.newDocument.expiryDate < today) {
    return {
      decision:       "REJECTED",
      reason:         `Nouveau document déjà expiré (${payload.newDocument.expiryDate}) — document valide requis`,
      reasonCode:     "REJECTED_NEW_DOCUMENT_EXPIRED",
      customerId:     existing.id,
      customerRef:    existing.customerId,
      previousStatus,
      riskLevel:      existing.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      riskScore:      existing.riskScore ?? 0,
      screening:      { sanctions: "CLEAR", pep: existing.pepStatus },
      sarWarning:     false,
      processedAt:    now.toISOString(),
      durationMs:     Date.now() - start,
    };
  }

  // ── 3. Re-screening sanctions complet ────────────────────────────────────
  const fullName       = `${existing.lastName} ${existing.firstName}`.trim();
  const screeningResult = await screenCustomer(existing.id, fullName);

  log.info({
    customerId:      existing.id,
    sanctionStatus:  screeningResult.status,
    score:           screeningResult.sanctionsResult.matchScore,
  }, "UC-8 : re-screening sanctions terminé");

  // MATCH sanctions → rejet + alerte SAR
  if (screeningResult.status === "MATCH") {
    // Client était-il actif malgré le blocage ? → SAR potentiel
    const hadActivity = previousStatus === "REJECTED";

    await db.insert(alerts).values({
      alertId:        `UC8-SANC-${nanoid(8).toUpperCase()}`,
      customerId:     existing.id,
      scenario:       "SANCTIONS_MATCH",
      alertType:      "SANCTIONS",
      priority:       "CRITICAL",
      status:         "OPEN",
      riskScore:      100,
      reason:         `Réactivation refusée — Correspondance sanctions : ` +
                      `${screeningResult.sanctionsResult.matchedEntity} ` +
                      `(${screeningResult.sanctionsResult.listSource}, score ${screeningResult.sanctionsResult.matchScore})` +
                      (hadActivity ? " — CLIENT PRÉCÉDEMMENT REJETÉ : SAR à considérer" : ""),
      enrichmentData: {
        cbsRef, cin: payload.CIN,
        previousStatus,
        matchedEntity: screeningResult.sanctionsResult.matchedEntity,
        listSource:    screeningResult.sanctionsResult.listSource,
        matchScore:    screeningResult.sanctionsResult.matchScore,
        sarRequired:   hadActivity,
      },
      createdAt: now, updatedAt: now,
    });

    await db.update(customers)
      .set({ kycStatus: "REJECTED", sanctionStatus: "MATCH", updatedAt: now })
      .where(eq(customers.id, existing.id));

    return {
      decision:       "REJECTED",
      reason:         `Re-screening : correspondance sanctions ${screeningResult.sanctionsResult.matchedEntity} — réactivation refusée`,
      reasonCode:     "REJECTED_SANCTIONS_REMATCH",
      customerId:     existing.id,
      customerRef:    existing.customerId,
      previousStatus,
      riskLevel:      "CRITICAL",
      riskScore:      100,
      screening:      { sanctions: "MATCH", pep: existing.pepStatus },
      sarWarning:     hadActivity,
      processedAt:    now.toISOString(),
      durationMs:     Date.now() - start,
    };
  }

  // ── 4. Re-screening PEP ────────────────────────────────────────────────────
  let pepDetected   = existing.pepStatus;
  let pepEntity:    string | null = null;

  try {
    const allEntities = await getSanctionLists();
    const pepEntities = allEntities.filter(e => e.listSource === "PEP");
    if (pepEntities.length > 0) {
      const { bestMatch } = matchAgainstMultipleLists(
        fullName, pepEntities, ENV.SCREENING_REVIEW_THRESHOLD
      );
      if (bestMatch.score >= ENV.SCREENING_REVIEW_THRESHOLD) {
        pepDetected = true;
        pepEntity   = bestMatch.matchedEntity ?? null;

        if (!existing.pepStatus) {
          await db.update(customers)
            .set({ pepStatus: true, customerType: "PEP", updatedAt: now })
            .where(eq(customers.id, existing.id));
          log.info({ customerId: existing.id, pepEntity }, "UC-8 : nouveau statut PEP détecté");
        }
      }
    }
  } catch (err) {
    log.error({ err }, "UC-8 : re-screening PEP échoué");
  }

  // ── 5. Enregistrer le nouveau document ────────────────────────────────────
  let ocrConfidence = 0;
  if (payload.newDocument.imageBase64) {
    try {
      const buf = Buffer.from(payload.newDocument.imageBase64, "base64");
      const ocr = await runOcr(buf, payload.newDocument.mimeType ?? "image/jpeg", payload.newDocument.type);
      ocrConfidence = ocr.confidence;

      await db.insert(documents).values({
        customerId:     existing.id,
        documentType:   payload.newDocument.type,
        documentNumber: payload.newDocument.number ?? payload.CIN,
        expiryDate:     payload.newDocument.expiryDate,
        status:         "APPROVED",
        ocrData:        ocr as unknown as null,
        ocrRawText:     ocr.rawText,
        ocrConfidence:  ocr.confidence,
        ocrProcessedAt: now,
        mrzData:        ocr.mrz as unknown as null ?? null,
        ekycStatus:     "PENDING",
        createdAt:      now,
        updatedAt:      now,
      });
    } catch (err) {
      log.error({ err }, "UC-8 : OCR nouveau document échoué");
      await db.insert(documents).values({
        customerId:     existing.id,
        documentType:   payload.newDocument.type,
        documentNumber: payload.newDocument.number ?? payload.CIN,
        expiryDate:     payload.newDocument.expiryDate,
        status:         "APPROVED",
        ekycStatus:     "PENDING",
        createdAt:      now,
        updatedAt:      now,
      });
    }
  } else {
    await db.insert(documents).values({
      customerId:     existing.id,
      documentType:   payload.newDocument.type,
      documentNumber: payload.newDocument.number ?? payload.CIN,
      expiryDate:     payload.newDocument.expiryDate,
      status:         "APPROVED",
      ekycStatus:     "PENDING",
      createdAt:      now,
      updatedAt:      now,
    });
  }

  // ── 6. Calcul risque et décision ─────────────────────────────────────────
  let riskScore = existing.riskScore ?? 0;
  let riskLevel = existing.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  // Réajustement : document OK enlève le malus d'expiration
  riskScore = Math.max(0, riskScore - 25);
  if (pepDetected) riskScore = Math.max(riskScore, 40);
  if (screeningResult.status === "REVIEW") riskScore = Math.max(riskScore, 30);

  if      (riskScore >= 70) riskLevel = "CRITICAL";
  else if (riskScore >= 50) riskLevel = "HIGH";
  else if (riskScore >= 20) riskLevel = "MEDIUM";
  else                      riskLevel = "LOW";

  const decision: "APPROVED" | "IN_REVIEW" = pepDetected || screeningResult.status === "REVIEW"
    ? "IN_REVIEW" : "APPROVED";

  const nextReviewDate = decision === "APPROVED"
    ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()) : null;

  await db.update(customers)
    .set({
      kycStatus:     decision === "APPROVED" ? "APPROVED" : "IN_REVIEW",
      riskScore,
      riskLevel,
      sanctionStatus: screeningResult.status === "CLEAR" ? "CLEAR" : screeningResult.status,
      ...(nextReviewDate ? { nextReviewDate, lastReviewDate: now } : {}),
      updatedAt: now,
    })
    .where(eq(customers.id, existing.id));

  // Alerte de réactivation pour traçabilité
  await db.insert(alerts).values({
    alertId:        `UC8-REACT-${nanoid(8).toUpperCase()}`,
    customerId:     existing.id,
    scenario:       "KYC_REACTIVATION",
    alertType:      "PATTERN",
    priority:       decision === "APPROVED" ? "LOW" : "MEDIUM",
    status:         decision === "APPROVED" ? "CLOSED" : "OPEN",
    riskScore:      riskScore,
    reason:         `Réactivation client — statut précédent : ${previousStatus} → ${decision}. ` +
                    `Nouveau document : ${payload.newDocument.type} (exp. ${payload.newDocument.expiryDate})`,
    enrichmentData: {
      cbsRef, cin: payload.CIN, previousStatus, decision,
      newDocType:    payload.newDocument.type,
      newDocExpiry:  payload.newDocument.expiryDate,
      pepDetected,   pepEntity,
      sarWarning:    previousStatus === "REJECTED" && decision === "APPROVED",
    },
    createdAt: now, updatedAt: now,
  });

  const sarWarning = previousStatus === "REJECTED" && decision === "APPROVED";
  if (sarWarning) {
    log.warn({ customerId: existing.id }, "UC-8 : client précédemment REJECTED réactivé — SAR à évaluer");
  }

  log.info({
    customerId: existing.id,
    decision,
    previousStatus,
    riskLevel,
    riskScore,
    pepDetected,
    durationMs: Date.now() - start,
  }, "UC-8 : réactivation terminée");

  return {
    decision,
    reason:         decision === "APPROVED"
      ? `Réactivation approuvée — nouveau document valide, screening CLEAR`
      : pepDetected
        ? `Réactivation en révision — statut PEP (EDD obligatoire)`
        : `Réactivation en révision — correspondance partielle sanctions`,
    reasonCode:     decision === "APPROVED" ? "APPROVED_REACTIVATION" : "REVIEW_REACTIVATION",
    customerId:     existing.id,
    customerRef:    existing.customerId,
    previousStatus,
    riskLevel,
    riskScore,
    screening:      { sanctions: screeningResult.status, pep: pepDetected },
    sarWarning,
    processedAt:    now.toISOString(),
    durationMs:     Date.now() - start,
  };
}
