/**
 * eKYC Router — Nouvelle API session-driven v5.1
 *
 * Endpoints exposés sous /api/ekyc :
 *  POST   /sessions                   — Créer session brouillon
 *  PATCH  /sessions/:ref               — Update partiel (champs, cbs_fields)
 *  POST   /sessions/:ref/images       — Upload progressif recto/verso
 *  POST   /sessions/:ref/retry-ocr    — Relancer OCR avec nouvelle image
 *  POST   /sessions/:ref/finalize     — Créer client final (transition DECIDED)
 *  POST   /sessions/:ref/magic-link   — Générer URL self-service client
 *  GET    /sessions/:ref              — Détail session
 *  GET    /sessions                    — Liste des sessions (agent courant)
 *  DELETE /sessions/:ref              — Marquer ABANDONED
 *  GET    /history                     — Recherche client existant par CIN
 *  GET    /token/:token                — Accès self-service via magic link
 *
 * Auth :
 *  - CBS_API : X-CBS-Api-Key (comme /api/cbs/*)
 *  - Web/agent : JWT Bearer via /trpc auth (à venir en Phase 2)
 *  - Magic link : token dans URL (pas de JWT)
 */

import type { Router, Request, Response } from "express";
import { Router as createRouter }          from "express";
import { createLogger }                    from "../../_core/logger";
import { ENV }                             from "../../_core/env";
import * as ekyc                           from "./ekyc-session.service";
import type { CinMarocFields }             from "./ocr-cin-maroc.service";

const log = createLogger("ekyc-api");

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Simple pour la Phase 1 : X-CBS-Api-Key (comme /api/cbs/*). En Phase 2, on
// intégrera l'auth JWT pour les agents web.

function verifyApiKey(req: Request, res: Response): boolean {
  if (ENV.CBS_AUTH_DISABLED) return true;
  const apiKey = req.headers["x-cbs-api-key"]
    ?? req.headers["authorization"]?.replace("Bearer ", "");
  if (!apiKey || apiKey !== ENV.CBS_ONBOARDING_API_KEY) {
    res.status(401).json({ success: false, error: "API key invalide" });
    return false;
  }
  return true;
}

/**
 * Accepte SOIT une API key (agent/CBS) SOIT un magic-token valide pour cette
 * session (client self-service via `/kyc/:token`).
 * Renvoie `true` si autorisé, écrit une réponse 401/403 sinon.
 */
async function verifyApiKeyOrMagicToken(
  req: Request, res: Response, sessionRef: string,
): Promise<boolean> {
  // 1. API key (agent / CBS) — accès complet
  if (ENV.CBS_AUTH_DISABLED) return true;
  const apiKey = req.headers["x-cbs-api-key"]
    ?? req.headers["authorization"]?.replace("Bearer ", "");
  if (apiKey && apiKey === ENV.CBS_ONBOARDING_API_KEY) return true;

  // 2. Magic token — accès limité à la session concernée
  const magicToken = req.headers["x-magic-token"];
  if (typeof magicToken === "string" && magicToken.length > 0) {
    const tokenSession = await ekyc.findSessionByMagicToken(magicToken);
    if (tokenSession && tokenSession.sessionRef === sessionRef) return true;
    res.status(403).json({ success: false, error: "Token ne correspond pas à cette session" });
    return false;
  }
  res.status(401).json({ success: false, error: "Auth manquante" });
  return false;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createEkycRouter(): Router {
  const router = createRouter();

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/ekyc/sessions — créer session brouillon
  // ═════════════════════════════════════════════════════════════════════════
  router.post("/sessions", async (req: Request, res: Response) => {
    if (!verifyApiKey(req, res)) return;
    const body = req.body as {
      channel?:      "CBS_API" | "DIGITAL_WEB" | "AGENT_OFFICE" | "MOBILE_APP";
      agentUserId?:  number;
      cbs_id?:       string;
      cbs_code?:     string;
      cbs_fields?:   Partial<CinMarocFields>;
    };
    try {
      const session = await ekyc.createSession({
        channel:       body.channel ?? "CBS_API",
        ...(body.agentUserId != null ? { agentUserId: body.agentUserId } : {}),
        ...(body.cbs_id     != null ? { cbsRef:      body.cbs_id }       : {}),
        ...(body.cbs_code   != null ? { cbsCode:     body.cbs_code }     : {}),
        ...(body.cbs_fields != null ? { cbsFields:   body.cbs_fields }   : {}),
      });
      res.status(201).json({
        success:    true,
        sessionRef: session.sessionRef,
        status:     session.status,
        channel:    session.channel,
        expiresAt:  session.expiresAt,
        startedAt:  session.startedAt,
      });
    } catch (err) {
      log.error({ err }, "Erreur création session");
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Erreur interne" });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // GET /api/ekyc/sessions/:ref — détail
  // ═════════════════════════════════════════════════════════════════════════
  router.get("/sessions/:ref", async (req: Request, res: Response) => {
    if (!verifyApiKey(req, res)) return;
    const ref = req.params["ref"];
    if (!ref) { res.status(400).json({ success: false, error: "ref manquant" }); return; }
    const session = await ekyc.findSessionByRef(ref);
    if (!session) { res.status(404).json({ success: false, error: `Session ${ref} introuvable` }); return; }
    res.json({ success: true, session: sanitizeSession(session) });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // GET /api/ekyc/sessions — liste (filtrable)
  // ═════════════════════════════════════════════════════════════════════════
  router.get("/sessions", async (req: Request, res: Response) => {
    if (!verifyApiKey(req, res)) return;
    const status  = req.query["status"]  as string | undefined;
    const channel = req.query["channel"] as string | undefined;
    const agentId = req.query["agentUserId"] ? parseInt(req.query["agentUserId"] as string, 10) : undefined;
    const limit   = req.query["limit"] ? Math.min(parseInt(req.query["limit"] as string, 10), 100) : 50;

    const sessions = await ekyc.listSessions({
      ...(agentId != null ? { agentUserId: agentId } : {}),
      ...(channel      ? { channel: channel as never } : {}),
      ...(status       ? { status:  status  as never } : {}),
      limit,
    });
    res.json({ success: true, count: sessions.length, sessions: sessions.map(sanitizeSession) });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PATCH /api/ekyc/sessions/:ref — update partiel
  // ═════════════════════════════════════════════════════════════════════════
  router.patch("/sessions/:ref", async (req: Request, res: Response) => {
    if (!verifyApiKey(req, res)) return;
    const ref = req.params["ref"];
    if (!ref) { res.status(400).json({ success: false, error: "ref manquant" }); return; }
    try {
      const body = req.body as { fields?: Partial<CinMarocFields>; cbs_fields?: Partial<CinMarocFields> };
      const patchPayload: { fields?: Partial<CinMarocFields>; cbsFields?: Partial<CinMarocFields> } = {};
      if (body.fields)     patchPayload.fields    = body.fields;
      if (body.cbs_fields) patchPayload.cbsFields = body.cbs_fields;
      const updated = await ekyc.patchSession(ref, patchPayload);
      res.json({ success: true, session: sanitizeSession(updated) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      const code = msg.includes("introuvable") ? 404 : msg.includes("expirée") || msg.includes("abandonnée") ? 410 : 500;
      res.status(code).json({ success: false, error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/ekyc/sessions/:ref/images — upload progressif
  // ═════════════════════════════════════════════════════════════════════════
  router.post("/sessions/:ref/images", async (req: Request, res: Response) => {
    const ref = req.params["ref"];
    if (!ref) { res.status(400).json({ success: false, error: "ref manquant" }); return; }
    if (!(await verifyApiKeyOrMagicToken(req, res, ref))) return;
    const body = req.body as {
      side?:     "recto" | "verso";
      base64?:   string;
      mimeType?: string;
      skipQualityGate?: boolean;
    };
    if (!body.side || !body.base64) {
      res.status(400).json({ success: false, error: "side et base64 obligatoires" });
      return;
    }
    try {
      const result = await ekyc.uploadImage({
        sessionRef: ref,
        side:       body.side,
        buffer:     Buffer.from(body.base64, "base64"),
        mimeType:   body.mimeType ?? "image/jpeg",
        ...(body.skipQualityGate ? { skipQualityGate: true } : {}),
      });
      res.json({
        success:        true,
        session:        sanitizeSession(result.session),
        extracted:      result.extracted,
        confidence:     result.confidence,
        quality:        result.quality,
        qualityWarning: result.qualityWarning,
        matchScore:     result.matchScore,
        duplicate:      result.duplicate,
        newStatus:      result.session.status,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      log.error({ err, sessionRef: ref }, "Upload image échoué");
      const code = msg.includes("introuvable") ? 404 : msg.includes("expirée") || msg.includes("abandonnée") ? 410 : 500;
      res.status(code).json({ success: false, error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/ekyc/sessions/:ref/retry-ocr — retry avec nouvelle image
  // ═════════════════════════════════════════════════════════════════════════
  router.post("/sessions/:ref/retry-ocr", async (req: Request, res: Response) => {
    const ref = req.params["ref"];
    if (!ref) { res.status(400).json({ success: false, error: "ref manquant" }); return; }
    if (!(await verifyApiKeyOrMagicToken(req, res, ref))) return;
    const body = req.body as { side?: "recto" | "verso"; base64?: string; mimeType?: string };
    if (!body.side || !body.base64) {
      res.status(400).json({ success: false, error: "side et base64 obligatoires" });
      return;
    }
    try {
      const result = await ekyc.retryOcr(ref, Buffer.from(body.base64, "base64"), body.side, body.mimeType ?? "image/jpeg");
      res.json({
        success:    true,
        session:    sanitizeSession(result.session),
        extracted:  result.extracted,
        confidence: result.confidence,
        quality:    result.quality,
        matchScore: result.matchScore,
        duplicate:  result.duplicate,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      log.error({ err, sessionRef: ref }, "Retry OCR échoué");
      const code = msg.includes("Limite") ? 429 : msg.includes("introuvable") ? 404 : 500;
      res.status(code).json({ success: false, error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/ekyc/sessions/:ref/finalize — création client final
  // ═════════════════════════════════════════════════════════════════════════
  router.post("/sessions/:ref/finalize", async (req: Request, res: Response) => {
    if (!verifyApiKey(req, res)) return;
    const ref = req.params["ref"];
    if (!ref) { res.status(400).json({ success: false, error: "ref manquant" }); return; }
    const body = req.body as {
      fields?:          CinMarocFields;
      modified?:        boolean;
      modifiedFields?:  string[];
    };
    if (!body.fields) { res.status(400).json({ success: false, error: "fields obligatoire" }); return; }
    try {
      const result = await ekyc.finalizeSession({
        sessionRef:      ref,
        fields:          body.fields,
        modified:        body.modified ?? false,
        ...(body.modifiedFields ? { modifiedFields: body.modifiedFields } : {}),
      });
      res.json({
        success:            true,
        sessionRef:         result.session.sessionRef,
        customerId:         result.customerId,
        customerRef:        result.customerRef,
        kycStatus:          result.kycStatus,
        screening:          result.screening,
        modificationReport: result.modificationReport,
        processedAt:        result.session.decidedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      log.error({ err, sessionRef: ref }, "Finalize échoué");
      const code = msg.includes("déjà enregistré") ? 409
                 : msg.includes("déjà décidée") ? 409
                 : msg.includes("introuvable") ? 404
                 : msg.includes("expirée") || msg.includes("abandonnée") ? 410
                 : 500;
      res.status(code).json({ success: false, error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/ekyc/sessions/:ref/magic-link — self-service client
  // ═════════════════════════════════════════════════════════════════════════
  router.post("/sessions/:ref/magic-link", async (req: Request, res: Response) => {
    if (!verifyApiKey(req, res)) return;
    const ref = req.params["ref"];
    if (!ref) { res.status(400).json({ success: false, error: "ref manquant" }); return; }
    const body = req.body as { validityMinutes?: number };
    try {
      const result = await ekyc.generateMagicLink(ref, body.validityMinutes ?? 30);
      res.json({
        success:   true,
        token:     result.token,
        url:       result.url,
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      res.status(msg.includes("introuvable") ? 404 : 500).json({ success: false, error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // GET /api/ekyc/token/:token — accès self-service (pas d'auth API key)
  // ═════════════════════════════════════════════════════════════════════════
  router.get("/token/:token", async (req: Request, res: Response) => {
    const token = req.params["token"];
    if (!token) { res.status(400).json({ success: false, error: "token manquant" }); return; }
    try {
      const session = await ekyc.findSessionByMagicToken(token);
      if (!session) {
        res.status(404).json({ success: false, error: "Lien expiré ou invalide" });
        return;
      }
      res.json({ success: true, session: sanitizeSession(session) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      res.status(500).json({ success: false, error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/ekyc/token/:token/submit — client confirme, passe en AGENT_REVIEW
  // ═════════════════════════════════════════════════════════════════════════
  router.post("/token/:token/submit", async (req: Request, res: Response) => {
    const token = req.params["token"];
    if (!token) { res.status(400).json({ success: false, error: "token manquant" }); return; }
    try {
      const session = await ekyc.findSessionByMagicToken(token);
      if (!session) {
        res.status(404).json({ success: false, error: "Lien expiré ou invalide" });
        return;
      }
      const updated = await ekyc.submitForAgentReview(session.sessionRef);
      res.json({ success: true, session: sanitizeSession(updated) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      const code = msg.includes("Statut invalide") ? 409
                 : msg.includes("introuvable")     ? 404
                 : msg.includes("expirée") || msg.includes("abandonnée") ? 410
                 : 500;
      res.status(code).json({ success: false, error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // DELETE /api/ekyc/sessions/:ref — abandonner
  // ═════════════════════════════════════════════════════════════════════════
  router.delete("/sessions/:ref", async (req: Request, res: Response) => {
    if (!verifyApiKey(req, res)) return;
    const ref = req.params["ref"];
    if (!ref) { res.status(400).json({ success: false, error: "ref manquant" }); return; }
    const reason = req.query["reason"] as string | undefined;
    await ekyc.abandonSession(ref, reason);
    res.json({ success: true, abandoned: true });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // GET /api/ekyc/history?cin=XXX — recherche doublon anticipé
  // ═════════════════════════════════════════════════════════════════════════
  router.get("/history", async (req: Request, res: Response) => {
    if (!verifyApiKey(req, res)) return;
    const cin = (req.query["cin"] as string | undefined)?.toUpperCase();
    if (!cin) { res.status(400).json({ success: false, error: "cin manquant" }); return; }
    const result = await ekyc.findExistingCustomerByCin(cin);
    res.json({ success: true, cin, ...result });
  });

  return router;
}

// ─── Sanitize : masquer les champs sensibles pour les réponses API ───────────

function sanitizeSession(session: {
  id: number;
  sessionRef: string;
  channel: string;
  status: string;
  cbsRef: string | null;
  cbsCode: string | null;
  candidateFields: unknown;
  cbsFields: unknown;
  decisionResult: unknown;
  customerId: number | null;
  agentUserId: number | null;
  rectoUploaded: boolean;
  versoUploaded: boolean;
  rectoConfidence: number | null;
  versoConfidence: number | null;
  qualityChecks: unknown;
  modifiedFields: unknown;
  retryCount: number;
  startedAt: Date;
  expiresAt: Date;
  decidedAt: Date | null;
  abandonedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  // Ne pas exposer magicToken, rectoOcrData/versoOcrData bruts
  return {
    sessionRef:     session.sessionRef,
    channel:        session.channel,
    status:         session.status,
    cbsRef:         session.cbsRef,
    cbsCode:        session.cbsCode,
    candidateFields: session.candidateFields,
    cbsFields:      session.cbsFields,
    decisionResult: session.decisionResult,
    customerId:     session.customerId,
    agentUserId:    session.agentUserId,
    rectoUploaded:  session.rectoUploaded,
    versoUploaded:  session.versoUploaded,
    rectoConfidence: session.rectoConfidence,
    versoConfidence: session.versoConfidence,
    qualityChecks:  session.qualityChecks,
    modifiedFields: session.modifiedFields,
    retryCount:     session.retryCount,
    startedAt:      session.startedAt,
    expiresAt:      session.expiresAt,
    decidedAt:      session.decidedAt,
    abandonedAt:    session.abandonedAt,
  };
}
