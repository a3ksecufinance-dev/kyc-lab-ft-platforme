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
import rateLimit                           from "express-rate-limit";
import { createLogger }                    from "../../_core/logger";
import { ENV }                             from "../../_core/env";
import * as ekyc                           from "./ekyc-session.service";
import type { CinMarocFields }             from "./ocr-cin-maroc.service";
import { getOcrQueue }                     from "./ocr.queue";
import { handleEkycSseStream }             from "./ekyc-events";

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

// ─── Rate limiters dédiés (endpoints publics, anti brute-force) ──────────────
//
// Le globalLimiter (200/min) protège de façon générale, mais /token/:token
// (magic link) et /sessions/:ref/images (upload OCR coûteux) méritent une
// limite ciblée : 32 caractères de token c'est fort, pas invincible sur des
// heures ; l'upload d'image bloque un worker OCR pour 5-15 s.
//
// Clé = IP client (respecte X-Forwarded-For grâce à trust proxy en amont).
// ─────────────────────────────────────────────────────────────────────────────

const tokenLimiter = rateLimit({
  windowMs: 60_000,
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: "Trop de tentatives sur ce lien — réessayez dans une minute" },
});

const imagesLimiter = rateLimit({
  windowMs: 60_000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: "Trop d'uploads — réessayez dans une minute" },
});

// ─── Router ───────────────────────────────────────────────────────────────────

export function createEkycRouter(): Router {
  const router = createRouter();

  // ═════════════════════════════════════════════════════════════════════════
  // GET /api/ekyc/events — flux SSE pour notifications temps réel agent
  //   Auth par API key en query string : EventSource ne supporte pas
  //   les headers custom. Le token reste dans l'URL — accepter pour un tool
  //   interne agent, à passer en cookie httpOnly pour un déploiement grand
  //   public.
  // ═════════════════════════════════════════════════════════════════════════
  router.get("/events", (req: Request, res: Response) => {
    if (!ENV.CBS_AUTH_DISABLED) {
      const key = (req.query["apiKey"] as string | undefined)
        ?? req.headers["x-cbs-api-key"] as string | undefined;
      if (!key || key !== ENV.CBS_ONBOARDING_API_KEY) {
        res.status(401).json({ success: false, error: "API key invalide" });
        return;
      }
    }
    handleEkycSseStream(req, res);
  });

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
  router.post("/sessions/:ref/images", imagesLimiter, async (req: Request, res: Response) => {
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
        success:          true,
        session:          sanitizeSession(result.session),
        extracted:        result.extracted,
        confidence:       result.confidence,
        quality:          result.quality,
        qualityWarning:   result.qualityWarning,
        matchScore:       result.matchScore,
        duplicate:        result.duplicate,
        screeningPreview: result.screeningPreview,
        newStatus:        result.session.status,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      log.error({ err, sessionRef: ref }, "Upload image échoué");
      const code = msg.includes("introuvable") ? 404 : msg.includes("expirée") || msg.includes("abandonnée") ? 410 : 500;
      res.status(code).json({ success: false, error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/ekyc/sessions/:ref/images/async — upload asynchrone
  //   L'OCR est enfilé sur BullMQ. Réponse immédiate avec jobId, le client
  //   poll GET /sessions/:ref/ocr-jobs/:jobId pour récupérer le résultat.
  // ═════════════════════════════════════════════════════════════════════════
  router.post("/sessions/:ref/images/async", imagesLimiter, async (req: Request, res: Response) => {
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
      // Valide l'existence + statut de la session avant d'enfiler (évite les
      // jobs orphelins et permet un 404/410 immédiat au lieu de "queued").
      await ekyc.requireValidSession(ref);
      const queue = getOcrQueue();
      const job = await queue.add("ocr", {
        sessionRef: ref,
        side:       body.side,
        imageBase64: body.base64,
        mimeType:   body.mimeType ?? "image/jpeg",
        ...(body.skipQualityGate ? { skipQualityGate: true } : {}),
      });
      res.status(202).json({
        success:    true,
        sessionRef: ref,
        jobId:      job.id,
        status:     "queued",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      const code = msg.includes("introuvable") ? 404 : msg.includes("expirée") || msg.includes("abandonnée") ? 410 : 500;
      res.status(code).json({ success: false, error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // GET /api/ekyc/sessions/:ref/ocr-jobs/:jobId — état + résultat OCR
  // ═════════════════════════════════════════════════════════════════════════
  router.get("/sessions/:ref/ocr-jobs/:jobId", async (req: Request, res: Response) => {
    const ref   = req.params["ref"];
    const jobId = req.params["jobId"];
    if (!ref || !jobId) { res.status(400).json({ success: false, error: "ref/jobId manquant" }); return; }
    if (!(await verifyApiKeyOrMagicToken(req, res, ref))) return;
    try {
      const queue = getOcrQueue();
      const job   = await queue.getJob(jobId);
      if (!job) { res.status(404).json({ success: false, error: "Job introuvable" }); return; }
      // Le job doit appartenir à la session demandée (défense en profondeur)
      if (job.data.sessionRef !== ref) {
        res.status(403).json({ success: false, error: "Job ne correspond pas à cette session" });
        return;
      }
      const state = await job.getState(); // waiting | active | completed | failed | delayed | ...
      res.json({
        success:      true,
        jobId:        job.id,
        state,
        progress:     job.progress,
        result:       job.returnvalue ?? null,
        failedReason: job.failedReason ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      res.status(500).json({ success: false, error: msg });
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
        success:          true,
        session:          sanitizeSession(result.session),
        extracted:        result.extracted,
        confidence:       result.confidence,
        quality:          result.quality,
        matchScore:       result.matchScore,
        duplicate:        result.duplicate,
        screeningPreview: result.screeningPreview,
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
  router.get("/token/:token", tokenLimiter, async (req: Request, res: Response) => {
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
  // POST /api/ekyc/token/:token/consents — enregistre les consentements 09-08
  // ═════════════════════════════════════════════════════════════════════════
  router.post("/token/:token/consents", tokenLimiter, async (req: Request, res: Response) => {
    const token = req.params["token"];
    if (!token) { res.status(400).json({ success: false, error: "token manquant" }); return; }
    try {
      const session = await ekyc.findSessionByMagicToken(token);
      if (!session) {
        res.status(404).json({ success: false, error: "Lien expiré ou invalide" });
        return;
      }
      const body = req.body as {
        biometric?:      boolean;
        screening?:      boolean;
        cbsSharing?:     boolean;
        retention?:      boolean;
        policyVersion?:  string;
      };
      const purposes: Partial<Record<ekyc.ConsentPurpose, boolean>> = {};
      if (typeof body.biometric  === "boolean") purposes.biometric  = body.biometric;
      if (typeof body.screening  === "boolean") purposes.screening  = body.screening;
      if (typeof body.cbsSharing === "boolean") purposes.cbsSharing = body.cbsSharing;
      if (typeof body.retention  === "boolean") purposes.retention  = body.retention;
      if (Object.keys(purposes).length === 0) {
        res.status(400).json({ success: false, error: "Aucune finalité fournie" });
        return;
      }
      const ipHeader = req.headers["x-forwarded-for"];
      const ip       = Array.isArray(ipHeader) ? ipHeader[0] : (ipHeader?.split(",")[0]?.trim() ?? req.ip);
      const ua       = req.headers["user-agent"];
      const updated = await ekyc.recordConsents(session.sessionRef, {
        purposes,
        ...(ip                       ? { ip }             : {}),
        ...(typeof ua === "string"   ? { userAgent: ua }  : {}),
        ...(body.policyVersion       ? { policyVersion: body.policyVersion } : {}),
      });
      res.json({ success: true, session: sanitizeSession(updated) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur interne";
      const code = msg.includes("introuvable") ? 404
                 : msg.includes("expirée") || msg.includes("abandonnée") ? 410
                 : 500;
      res.status(code).json({ success: false, error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/ekyc/token/:token/submit — client confirme, passe en AGENT_REVIEW
  // ═════════════════════════════════════════════════════════════════════════
  router.post("/token/:token/submit", tokenLimiter, async (req: Request, res: Response) => {
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
      const code = msg.includes("Statut invalide")     ? 409
                 : msg.includes("Consentements")       ? 428  // 428 Precondition Required
                 : msg.includes("introuvable")         ? 404
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
  consents: unknown;
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
    consents:       session.consents,
    retryCount:     session.retryCount,
    startedAt:      session.startedAt,
    expiresAt:      session.expiresAt,
    decidedAt:      session.decidedAt,
    abandonedAt:    session.abandonedAt,
  };
}
