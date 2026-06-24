/**
 * CBS Router — endpoints REST pour l'intégration CBS
 *
 * POST /api/cbs/onboarding     — Entrée en relation (UC-1/2/3/4/5)
 * POST /api/cbs/reactivation   — Réactivation client bloqué (UC-8)
 * GET  /api/cbs/health         — Santé du service
 *
 * Auth : X-CBS-Api-Key (header) — désactivable via CBS_AUTH_DISABLED=true (dev)
 */

import type { Router, Request, Response } from "express";
import { Router as createRouter }          from "express";
import { createLogger }                    from "../../_core/logger";
import { ENV }                             from "../../_core/env";
import { processCbsOnboarding }            from "./cbs-onboarding.service";
import type { CbsOnboardingPayload }       from "./cbs-onboarding.service";
import { processCbsReactivation }          from "./cbs-reactivation.service";
import type { CbsReactivationPayload }     from "./cbs-reactivation.service";
import { nanoid }                          from "nanoid";
import { eq }                              from "drizzle-orm";
import { db }                              from "../../_core/db";
import { customers, documents }            from "../../../drizzle/schema";
import { runOcr }                          from "../documents/ocr.service";
import { screenCustomer }                  from "../screening/screening.service";
import { notifyCbs }                       from "./cbs-notify.service";

const log = createLogger("cbs-api");

// ─── Auth CBS ─────────────────────────────────────────────────────────────────

function verifyCbsAuth(req: Request, res: Response): boolean {
  if (ENV.CBS_AUTH_DISABLED) return true;
  const apiKey = req.headers["x-cbs-api-key"]
    ?? req.headers["authorization"]?.replace("Bearer ", "");
  if (!apiKey || apiKey !== ENV.CBS_ONBOARDING_API_KEY) {
    res.status(401).json({ success: false, error: "Clé API CBS invalide ou manquante" });
    return false;
  }
  return true;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createCbsOnboardingRouter(): Router {
  const router = createRouter();

  /**
   * POST /api/cbs/onboarding
   * UC-1 Happy Path, UC-2 Sanctions, UC-3 PEP, UC-4 OCR, UC-5 Doc expiré
   */
  router.post("/onboarding", async (req: Request, res: Response) => {
    if (!verifyCbsAuth(req, res)) return;

    const cbsRef = `CBS-${nanoid(8).toUpperCase()}`;
    const body   = req.body as Partial<CbsOnboardingPayload>;
    log.info({ cbsRef, code: body.code, cin: body.CIN }, "Réception onboarding CBS");

    try {
      const result = await processCbsOnboarding(body as CbsOnboardingPayload, cbsRef);
      log.info({ cbsRef, decision: result.decision, customerId: result.customerId, durationMs: result.durationMs }, "Réponse CBS envoyée");

      res.json({
        success:    result.decision !== "REJECTED",
        cbsRef,
        decision:   result.decision,
        reason:     result.reason,
        reasonCode: result.reasonCode,
        customer: {
          id:        result.customerId,
          ref:       result.customerRef,
          riskLevel: result.riskLevel,
          riskScore: result.riskScore,
        },
        screening:  result.screening,
        pep:        result.pep,
        ocr:        result.ocr ? { performed: result.ocr.performed, coherent: result.ocr.coherent, confidence: result.ocr.confidence, mismatchCount: result.ocr.mismatches.length } : undefined,
        processedAt: result.processedAt,
        durationMs:  result.durationMs,
      });

    } catch (err) {
      log.error({ cbsRef, err }, "Erreur onboarding CBS");
      res.status(500).json({
        success: false, cbsRef,
        error:      err instanceof Error ? err.message : "Erreur interne",
        decision:   "IN_REVIEW",
        reasonCode: "REVIEW_INTERNAL_ERROR",
      });
    }
  });

  /**
   * POST /api/cbs/reactivation
   * UC-8 — Client bloqué revient avec nouveau document
   */
  router.post("/reactivation", async (req: Request, res: Response) => {
    if (!verifyCbsAuth(req, res)) return;

    const cbsRef = `CBS-REACT-${nanoid(8).toUpperCase()}`;
    const body   = req.body as Partial<CbsReactivationPayload>;
    log.info({ cbsRef, cin: body.CIN }, "Réception réactivation CBS");

    if (!body.CIN || !body.newDocument?.expiryDate) {
      res.status(400).json({
        success: false,
        error:   "CIN et newDocument.expiryDate sont obligatoires",
      });
      return;
    }

    try {
      const result = await processCbsReactivation(body as CbsReactivationPayload, cbsRef);
      log.info({ cbsRef, decision: result.decision, customerId: result.customerId, sarWarning: result.sarWarning }, "Réactivation CBS terminée");

      res.json({
        success:        result.decision !== "REJECTED",
        cbsRef,
        decision:       result.decision,
        reason:         result.reason,
        reasonCode:     result.reasonCode,
        customer: {
          id:             result.customerId,
          ref:            result.customerRef,
          previousStatus: result.previousStatus,
          riskLevel:      result.riskLevel,
          riskScore:      result.riskScore,
        },
        screening:      result.screening,
        sarWarning:     result.sarWarning,
        processedAt:    result.processedAt,
        durationMs:     result.durationMs,
      });

    } catch (err) {
      log.error({ cbsRef, err }, "Erreur réactivation CBS");
      res.status(500).json({
        success: false, cbsRef,
        error:   err instanceof Error ? err.message : "Erreur interne",
      });
    }
  });

  /**
   * POST /api/cbs/document
   * CBS pousse un nouveau document pour un client existant (CIN identifié)
   * Scénario : renouvellement CIN, nouveau passeport, etc.
   */
  router.post("/document", async (req: Request, res: Response) => {
    if (!verifyCbsAuth(req, res)) return;

    const cbsRef = `CBS-DOC-${nanoid(8).toUpperCase()}`;
    const body   = req.body as {
      CIN:         string;
      document: {
        type:         string;
        expiryDate:   string;
        number?:      string;
        imageBase64?: string;
        mimeType?:    string;
      };
    };

    if (!body.CIN || !body.document?.expiryDate) {
      res.status(400).json({ success: false, error: "CIN et document.expiryDate obligatoires" });
      return;
    }

    const today = new Date().toISOString().split("T")[0]!;
    if (body.document.expiryDate < today) {
      res.status(400).json({ success: false, error: `Document déjà expiré (${body.document.expiryDate})` });
      return;
    }

    try {
      const now = new Date();

      // Trouver le client par CIN
      const cust = await db.select().from(customers)
        .where(eq(customers.nicNumber, body.CIN.toUpperCase())).limit(1).then(r => r[0]);

      if (!cust) {
        res.status(404).json({ success: false, error: `Aucun client avec CIN ${body.CIN}` });
        return;
      }

      log.info({ cbsRef, cin: body.CIN, custId: cust.id, docType: body.document.type }, "CBS document reçu");

      // OCR si image fournie
      let ocrData: Record<string, unknown> | null = null;
      let docNumber = body.document.number ?? body.CIN;
      let expiryDate = body.document.expiryDate;

      if (body.document.imageBase64) {
        try {
          const buf = Buffer.from(body.document.imageBase64, "base64");
          const ocr = await runOcr(buf, body.document.mimeType ?? "image/jpeg", body.document.type);
          ocrData = ocr as unknown as Record<string, unknown>;
          if (ocr.documentNumber) docNumber  = ocr.documentNumber;
          if (ocr.expiryDate)    expiryDate  = ocr.expiryDate;
          log.info({ custId: cust.id, confidence: ocr.confidence, hasMrz: !!ocr.mrz }, "OCR document CBS");
        } catch (ocrErr) {
          log.error({ ocrErr }, "OCR document CBS échoué — poursuite");
        }
      }

      // Enregistrer le document
      await db.insert(documents).values({
        customerId:     cust.id,
        documentType:   (body.document.type ?? "ID_CARD") as "ID_CARD" | "PASSPORT" | "DRIVING_LICENSE",
        documentNumber: docNumber,
        expiryDate,
        status:         "APPROVED",
        ekycStatus:     ocrData ? "PASS" : "PENDING",
        ocrData:        ocrData as null,
        ocrProcessedAt: ocrData ? now : null,
        createdAt:      now,
        updatedAt:      now,
      });

      // Re-screening sanctions
      const fullName = `${cust.lastName} ${cust.firstName}`.trim();
      const screening = await screenCustomer(cust.id, fullName);

      let newKycStatus: "APPROVED" | "IN_REVIEW" | "REJECTED" = "APPROVED";
      if (screening.status === "MATCH") newKycStatus = "REJECTED";
      else if (screening.status === "REVIEW") newKycStatus = "IN_REVIEW";

      const nextReview = newKycStatus === "APPROVED"
        ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()) : null;

      await db.update(customers)
        .set({
          kycStatus:     newKycStatus,
          sanctionStatus: screening.status === "CLEAR" ? "CLEAR" : screening.status,
          ...(nextReview ? { nextReviewDate: nextReview, lastReviewDate: now } : {}),
          updatedAt: now,
        })
        .where(eq(customers.id, cust.id));

      // Notifier CBS du résultat
      await notifyCbs({
        event:       newKycStatus === "APPROVED" ? "KYC_APPROVED" : "KYC_IN_REVIEW",
        customerId:  cust.id,
        customerRef: cust.customerId,
        cin:         cust.nicNumber,
        cbsRef:      cust.cbsRef,
        riskLevel:   cust.riskLevel,
        reason:      `Nouveau document ${body.document.type} validé (exp: ${expiryDate}) — ${newKycStatus}`,
        timestamp:   now.toISOString(),
      });

      log.info({ cbsRef, custId: cust.id, newKycStatus, screening: screening.status }, "Document CBS traité");

      res.json({
        success:    true,
        cbsRef,
        customerId: cust.id,
        customerRef: cust.customerId,
        kycStatus:  newKycStatus,
        document: { type: body.document.type, expiryDate, number: docNumber },
        screening:  { status: screening.status, matchScore: screening.sanctionsResult.matchScore },
        processedAt: now.toISOString(),
      });

    } catch (err) {
      log.error({ cbsRef, err }, "Erreur traitement document CBS");
      res.status(500).json({ success: false, cbsRef, error: err instanceof Error ? err.message : "Erreur interne" });
    }
  });

  /**
   * GET /api/cbs/health
   */
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status:    "ok",
      service:   "KYC-AML CBS Integration API",
      version:   "3.0",
      endpoints: [
        "POST /onboarding   — Entrée en relation (UC-1/2/3/4/5)",
        "POST /reactivation — Réactivation client bloqué (UC-8)",
        "POST /document     — Nouveau document pour client existant",
        "GET  /health       — Santé du service",
      ],
      timestamp: new Date().toISOString(),
      mode:      ENV.CBS_AUTH_DISABLED ? "development" : "production",
    });
  });

  return router;
}
