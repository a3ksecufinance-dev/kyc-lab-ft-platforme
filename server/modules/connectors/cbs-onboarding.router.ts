/**
 * CBS Onboarding Router — endpoint REST pour l'intégration CBS
 *
 * POST /api/cbs/onboarding
 *   Corps : format API Reset CBS
 *   Auth  : X-CBS-Api-Key (header) ou CBS_API_KEY en staging/live
 *           CBS_AUTH_DISABLED=true en mode développement (désactive l'auth)
 *
 * Retourne une décision synchrone en < 3s.
 */

import type { Router, Request, Response } from "express";
import { Router as createRouter }          from "express";
import { createLogger }                    from "../../_core/logger";
import { ENV }                             from "../../_core/env";
import { processCbsOnboarding }            from "./cbs-onboarding.service";
import type { CbsOnboardingPayload }       from "./cbs-onboarding.service";
import { nanoid }                          from "nanoid";

const log = createLogger("cbs-onboarding-api");

// ─── Auth CBS ─────────────────────────────────────────────────────────────────

function verifyCbsAuth(req: Request, res: Response): boolean {
  if (ENV.CBS_AUTH_DISABLED) return true;

  const apiKey = req.headers["x-cbs-api-key"] ?? req.headers["authorization"]?.replace("Bearer ", "");
  if (!apiKey || apiKey !== ENV.CBS_ONBOARDING_API_KEY) {
    res.status(401).json({
      success: false,
      error:   "Clé API CBS invalide ou manquante (header X-CBS-Api-Key requis)",
    });
    return false;
  }
  return true;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createCbsOnboardingRouter(): Router {
  const router = createRouter();

  /**
   * POST /api/cbs/onboarding
   * Entrée en relation depuis le CBS — décision synchrone
   */
  router.post("/onboarding", async (req: Request, res: Response) => {
    if (!verifyCbsAuth(req, res)) return;

    const cbsRef = `CBS-${nanoid(8).toUpperCase()}`;
    const body   = req.body as Partial<CbsOnboardingPayload>;

    log.info({ cbsRef, code: body.code, cin: body.CIN }, "Réception onboarding CBS");

    try {
      const result = await processCbsOnboarding(body as CbsOnboardingPayload, cbsRef);

      const httpStatus = result.decision === "REJECTED" ? 200 : 200;

      log.info({
        cbsRef,
        decision:   result.decision,
        customerId: result.customerId,
        durationMs: result.durationMs,
      }, "Réponse CBS envoyée");

      res.status(httpStatus).json({
        success:     result.decision !== "REJECTED",
        cbsRef,
        decision:    result.decision,
        reason:      result.reason,
        reasonCode:  result.reasonCode,
        customer: {
          id:        result.customerId,
          ref:       result.customerRef,
          riskLevel: result.riskLevel,
          riskScore: result.riskScore,
        },
        screening: result.screening,
        processedAt: result.processedAt,
        durationMs:  result.durationMs,
      });

    } catch (err) {
      log.error({ cbsRef, err }, "Erreur traitement onboarding CBS");
      res.status(500).json({
        success:    false,
        cbsRef,
        error:      err instanceof Error ? err.message : "Erreur interne",
        decision:   "IN_REVIEW",
        reasonCode: "REVIEW_INTERNAL_ERROR",
      });
    }
  });

  /**
   * GET /api/cbs/health
   * Vérification connectivité CBS ↔ KYC-AML
   */
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status:    "ok",
      service:   "KYC-AML CBS Onboarding API",
      version:   "1.0",
      timestamp: new Date().toISOString(),
      mode:      ENV.CBS_AUTH_DISABLED ? "development" : "production",
    });
  });

  return router;
}
