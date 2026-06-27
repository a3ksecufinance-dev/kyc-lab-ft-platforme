/**
 * CBS Router — endpoints REST pour l'intégration CBS
 *
 * POST /api/cbs/onboarding     — Entrée en relation classique (UC-1/2/3/4/5)
 * POST /api/cbs/ocr            — OCR CIN marocaine recto+verso → JSON structuré
 * POST /api/cbs/confirm        — Confirmation/modification données OCR → création client
 * POST /api/cbs/document       — Nouveau document pour client existant
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
import { ocrCinMaroc, validateCbsVsOcr, verifyModifiedFields } from "../documents/ocr-cin-maroc.service";
import type { CinMarocFields }             from "../documents/ocr-cin-maroc.service";
import { nanoid }                          from "nanoid";
import { eq }                              from "drizzle-orm";
import { db }                              from "../../_core/db";
import { customers, documents, alerts }    from "../../../drizzle/schema";
import { insertCustomer }                  from "../customers/customers.repository";
import { runOcr }                          from "../documents/ocr.service";
import { screenCustomer }                  from "../screening/screening.service";
import { notifyCbs }                       from "./cbs-notify.service";
import { redis }                           from "../../_core/redis";

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
   * POST /api/cbs/face-match
   * Comparaison selfie vs photo CIN (heuristique basique côté serveur)
   * Le client peut faire une comparaison plus précise avec face-api.js en local.
   *
   * Note : sans modèle ML embarqué côté serveur, on retourne un score neutre.
   * Le vrai face match est fait côté client avec face-api.js (modèles WASM).
   */
  router.post("/face-match", async (req: Request, res: Response) => {
    if (!verifyCbsAuth(req, res)) return;

    const body = req.body as { cin_recto?: string; selfie?: string; clientScore?: number };

    if (!body.cin_recto || !body.selfie) {
      res.status(400).json({ matched: false, score: 0, message: "cin_recto et selfie requis" });
      return;
    }

    // Si le client a déjà calculé un score avec face-api.js, on le valide et le retourne
    if (typeof body.clientScore === "number") {
      const score = Math.max(0, Math.min(100, Math.round(body.clientScore)));
      res.json({
        matched: score >= 65,
        score,
        message: score >= 80 ? "Correspondance forte"
               : score >= 65 ? "Correspondance acceptable"
               : "Correspondance faible — révision requise",
        source: "client-face-api",
      });
      return;
    }

    // Pas de score client → vérification basique de taille/présence d'image
    const rectoSize  = Buffer.from(body.cin_recto, "base64").length;
    const selfieSize = Buffer.from(body.selfie,   "base64").length;

    if (rectoSize < 1024 || selfieSize < 1024) {
      res.json({ matched: false, score: 0, message: "Images trop petites pour analyse" });
      return;
    }

    // Réponse neutre — face match doit être validé manuellement ou avec face-api côté client
    res.json({
      matched: false,
      score: 0,
      message: "Vérification biométrique en mode révision manuelle",
      source: "server-pending-review",
    });
  });

  /**
   * POST /api/cbs/ocr
   * Étape 1 — CBS envoie CIN Recto + Verso (base64)
   * Retourne JSON structuré + validation CBS vs OCR
   * Session stockée 30 min dans Redis (cbsRef)
   */
  router.post("/ocr", async (req: Request, res: Response) => {
    if (!verifyCbsAuth(req, res)) return;

    const cbsRef = `OCR-${nanoid(10).toUpperCase()}`;
    const body = req.body as {
      cin_recto:   string;
      cin_verso:   string;
      mimeType?:   string;
      cbs_fields?: Partial<CinMarocFields>;
    };

    if (!body.cin_recto || !body.cin_verso) {
      res.status(400).json({ success: false, error: "cin_recto et cin_verso obligatoires (base64)" });
      return;
    }

    log.info({ cbsRef }, "OCR CIN marocaine reçu");

    try {
      const rectoBuffer = Buffer.from(body.cin_recto, "base64");
      const versoBuffer = Buffer.from(body.cin_verso, "base64");
      const mimeType    = body.mimeType ?? "image/jpeg";

      const ocrResult = await ocrCinMaroc(rectoBuffer, versoBuffer, mimeType);

      // Validation CBS vs OCR si cbs_fields fournis
      const validation = body.cbs_fields
        ? validateCbsVsOcr(body.cbs_fields, ocrResult.merged)
        : null;

      // Stocker session OCR dans Redis (30 min)
      await redis.setex(
        `cbs:ocr:${cbsRef}`,
        1800,
        JSON.stringify({ ocrResult, cbsFields: body.cbs_fields ?? {} })
      );

      log.info({
        cbsRef,
        mrzValid:   ocrResult.mrzValid,
        confidence: ocrResult.confidence.overall,
        validFields: validation?.valid.length ?? "N/A",
      }, "OCR CIN terminé");

      res.json({
        success: true,
        cbsRef,
        extracted: ocrResult.merged,
        confidence: ocrResult.confidence,
        mrzValid:   ocrResult.mrzValid,
        ...(validation ? {
          validation: {
            score:    validation.score,
            valid:    validation.valid,
            missing:  validation.missing,
            mismatch: validation.mismatch,
            status:   validation.score >= 80 ? "CONFORME"
                    : validation.score >= 50 ? "PARTIEL"
                    : "DIVERGENT",
          }
        } : {}),
        // Champs manquants dans l'OCR (à compléter par l'agent)
        fieldsToReview: Object.entries(ocrResult.merged)
          .filter(([, v]) => !v)
          .map(([k]) => k),
        processedAt: new Date().toISOString(),
        // Session expire dans 30 min
        expiresAt: new Date(Date.now() + 1800_000).toISOString(),
      });

    } catch (err) {
      log.error({ cbsRef, err }, "Erreur OCR CIN");
      res.status(500).json({ success: false, cbsRef, error: err instanceof Error ? err.message : "Erreur OCR" });
    }
  });

  /**
   * POST /api/cbs/confirm
   * Étape 2 — Agent CBS confirme ou modifie les données OCR
   * Crée le client sur LabFT + screening + KYC initial
   */
  router.post("/confirm", async (req: Request, res: Response) => {
    if (!verifyCbsAuth(req, res)) return;

    const body = req.body as {
      cbsRef:          string;
      fields:          CinMarocFields;
      modified:        boolean;
      modifiedFields?: string[];
      cbsId?:          string;    // référence Basikon
      code?:           string;    // "entree" | "matcash"
    };

    if (!body.cbsRef || !body.fields) {
      res.status(400).json({ success: false, error: "cbsRef et fields obligatoires" });
      return;
    }

    log.info({ cbsRef: body.cbsRef, modified: body.modified }, "Confirmation CBS reçue");

    try {
      // Récupérer session OCR
      const sessionRaw = await redis.get(`cbs:ocr:${body.cbsRef}`);
      if (!sessionRaw) {
        res.status(404).json({ success: false, error: `Session OCR ${body.cbsRef} expirée ou introuvable (TTL 30min)` });
        return;
      }
      const session = JSON.parse(sessionRaw) as { ocrResult: Awaited<ReturnType<typeof ocrCinMaroc>>; cbsFields: Partial<CinMarocFields> };

      // Vérification champs modifiés vs OCR
      let modifCheck: ReturnType<typeof verifyModifiedFields> = [];
      if (body.modified && body.modifiedFields?.length) {
        modifCheck = verifyModifiedFields(body.modifiedFields, body.fields, session.ocrResult);
        const incoherent = modifCheck.filter(c => !c.coherent);
        if (incoherent.length > 0) {
          log.warn({ cbsRef: body.cbsRef, incoherent }, "Champs modifiés incohérents avec OCR");
          // On continue quand même mais on signale dans la réponse
        }
      }

      const now = new Date();
      const f   = body.fields;

      // Vérification doublon CIN
      if (f.cin) {
        const existing = await db.select({ id: customers.id, customerId: customers.customerId })
          .from(customers).where(eq(customers.nicNumber, f.cin.toUpperCase())).limit(1);
        if (existing.length > 0) {
          res.json({
            success: false,
            cbsRef: body.cbsRef,
            error:  `Client CIN ${f.cin} déjà enregistré (${existing[0]!.customerId})`,
            existingCustomerRef: existing[0]!.customerId,
          });
          return;
        }
      }

      // Création client LabFT
      const customerRef = `KYC-${nanoid(8).toUpperCase()}`;
      const customer = await insertCustomer({
        customerId:   customerRef,
        firstName:    f.prenom ?? "",
        lastName:     (f.nom ?? "").toUpperCase(),
        dateOfBirth:  f.dateNaissance ?? null,
        nationality:  "MA",
        customerType: "INDIVIDUAL",
        kycStatus:    "PENDING",
        riskLevel:    "LOW",
        riskScore:    0,
        pepStatus:    false,
        nicNumber:    f.cin?.toUpperCase() ?? null,
        birthCity:    f.lieuNaissance ?? null,
        address:      f.adresse ?? null,
        city:         f.ville ?? null,
        cbsRef:       body.cbsId ?? body.cbsRef,
      });

      // Enregistrer le document CIN avec données OCR
      await db.insert(documents).values({
        customerId:     customer.id,
        documentType:   "ID_CARD",
        documentNumber: f.cin ?? null,
        expiryDate:     f.dateExpiration ?? null,
        status:         "APPROVED",
        ocrData:        session.ocrResult.merged as unknown as null,
        ocrRawText:     `RECTO:\n${session.ocrResult.rawRecto}\n\nVERSO:\n${session.ocrResult.rawVerso}`,
        ocrConfidence:  session.ocrResult.confidence.overall,
        ocrProcessedAt: now,
        ekycStatus:     "PENDING",
        createdAt:      now,
        updatedAt:      now,
      });

      // Screening sanctions
      const fullName        = `${f.nom ?? ""} ${f.prenom ?? ""}`.trim();
      const screeningResult = await screenCustomer(customer.id, fullName);

      // Mise à jour statut selon screening
      let finalKycStatus: "PENDING" | "IN_REVIEW" | "REJECTED" = "PENDING";
      if (screeningResult.status === "MATCH") finalKycStatus = "REJECTED";
      else if (screeningResult.status === "REVIEW") finalKycStatus = "IN_REVIEW";

      await db.update(customers)
        .set({ kycStatus: finalKycStatus, sanctionStatus: screeningResult.status === "CLEAR" ? "CLEAR" : screeningResult.status, updatedAt: now })
        .where(eq(customers.id, customer.id));

      // Alerte si sanctions MATCH
      if (screeningResult.status === "MATCH") {
        await db.insert(alerts).values({
          alertId:    `CBS-SANC-${nanoid(8).toUpperCase()}`,
          customerId: customer.id,
          scenario:   "SANCTIONS_MATCH",
          alertType:  "SANCTIONS",
          priority:   "CRITICAL",
          status:     "OPEN",
          riskScore:  100,
          reason:     `CBS confirm — correspondance sanctions : ${screeningResult.sanctionsResult.matchedEntity} (${screeningResult.sanctionsResult.listSource})`,
          createdAt:  now,
          updatedAt:  now,
        });
      }

      // Notification CBS
      await notifyCbs({
        event:       finalKycStatus === "PENDING" ? "KYC_APPROVED" : finalKycStatus === "REJECTED" ? "KYC_REJECTED" : "KYC_IN_REVIEW",
        customerId:  customer.id,
        customerRef: customer.customerId,
        cin:         f.cin ?? null,
        cbsRef:      body.cbsId ?? body.cbsRef,
        riskLevel:   "LOW",
        reason:      `Entrée en relation via OCR CIN — ${finalKycStatus}`,
        timestamp:   now.toISOString(),
      });

      // Supprimer la session OCR
      await redis.del(`cbs:ocr:${body.cbsRef}`);

      log.info({ cbsRef: body.cbsRef, customerId: customer.id, kycStatus: finalKycStatus, screening: screeningResult.status }, "Confirmation CBS — client créé");

      res.json({
        success:      true,
        cbsRef:       body.cbsRef,
        customerId:   customer.id,
        customerRef:  customer.customerId,
        kycStatus:    finalKycStatus,
        screening: {
          status:        screeningResult.status,
          matchScore:    screeningResult.sanctionsResult.matchScore,
          matchedEntity: screeningResult.sanctionsResult.matchedEntity,
        },
        // Rapport modifications si agent a modifié
        ...(body.modified && modifCheck.length > 0 ? {
          modificationReport: modifCheck,
          incoherentFields:   modifCheck.filter(c => !c.coherent).map(c => c.field),
        } : {}),
        processedAt: now.toISOString(),
      });

    } catch (err) {
      log.error({ cbsRef: body.cbsRef, err }, "Erreur confirmation CBS");
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Erreur interne" });
    }
  });

  /**
   * GET /api/cbs/health
   */
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status:    "ok",
      service:   "KYC-AML CBS Integration API",
      version:   "4.1",
      endpoints: [
        "POST /onboarding   — Entrée en relation classique (UC-1/2/3/4/5)",
        "POST /ocr          — OCR CIN marocaine recto+verso → JSON structuré",
        "POST /confirm      — Confirmation/modif données OCR → création client",
        "POST /face-match   — Comparaison selfie vs CIN photo",
        "POST /document     — Nouveau document pour client existant",
        "POST /reactivation — Réactivation client bloqué (UC-8)",
        "GET  /health       — Santé du service",
      ],
      timestamp: new Date().toISOString(),
      mode:      ENV.CBS_AUTH_DISABLED ? "development" : "production",
    });
  });

  return router;
}
