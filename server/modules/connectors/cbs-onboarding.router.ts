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
   * GET /api/cbs/health
   */
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status:    "ok",
      service:   "KYC-AML CBS Integration API",
      version:   "2.0",
      endpoints: ["POST /onboarding", "POST /reactivation", "GET /health"],
      timestamp: new Date().toISOString(),
      mode:      ENV.CBS_AUTH_DISABLED ? "development" : "production",
    });
  });

  return router;
}
