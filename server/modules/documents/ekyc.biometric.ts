/**
 * Module de vérification biométrique — Liveness + Facial Match
 *
 * Complète le module eKYC document par la vérification du vivant :
 *   Liveness  : détection anti-spoofing (photo/vidéo replay)
 *   Facial    : correspondance selfie ↔ photo document
 *
 * Providers :
 *   onfido  → facial_similarity_photo report (certifié IDSP UK DIATF)
 *   sumsub  → SELFIE idDoc + review liveness (grade BSFI/FATF)
 *   local   → estimation heuristique — REVIEW systématique sans modèle ML
 *
 * Usage :
 *   // Après runEkyc() qui a créé l'applicantId chez le provider :
 *   const liveness = await verifyLiveness(selfieBuffer, docPhotoBuffer, applicantId);
 *   if (liveness.status === "FAIL") → refus onboarding immédiat
 *   if (liveness.status === "REVIEW") → file révision manuelle
 */

import crypto        from "node:crypto";
import { createLogger } from "../../_core/logger";
import { ENV }          from "../../_core/env";

const ML_SERVICE_URL = ENV.ML_SERVICE_URL;
const ML_API_KEY     = ENV.ML_INTERNAL_API_KEY;
const FACE_TIMEOUT   = 30_000; // 30 s (InsightFace CPU peut être lent à froid)

const log = createLogger("ekyc-biometric");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BiometricCheck {
  id:       string;
  label:    string;
  status:   "PASS" | "FAIL" | "SKIP" | "WARN";
  score:    number;     // 0-100
  blocking: boolean;
  detail?:  string;
}

export interface LivenessResult {
  status:        "PASS" | "REVIEW" | "FAIL";
  score:         number;        // score facial match 0-100
  livenessScore: number;        // score de vivacité 0-100
  checks:        BiometricCheck[];
  provider:      string;
  processedAt:   Date;
  facialMatchId?: string;       // ID check Onfido / applicant SumSub
}

// ─── Helpers Onfido ───────────────────────────────────────────────────────────

function onfidoAuthHeader(token: string): Record<string, string> {
  return { "Authorization": `Token token=${token}` };
}

interface OnfidoFacialReport {
  name:       string;
  result:     "clear" | "consider" | null;
  status:     string;
  breakdown?: {
    liveness_photo?:  { result: string };
    face_comparison?: { result: string };
  };
}

interface OnfidoCheck {
  id:      string;
  status:  string;
  result:  string | null;
  reports?: OnfidoFacialReport[];
}

// ─── Provider Onfido — facial_similarity_photo ────────────────────────────────

async function runOnfidoLiveness(
  selfieBuffer:   Buffer,
  docPhotoBuffer: Buffer | undefined,
  applicantId:    string,
): Promise<LivenessResult> {
  const token   = ENV.ONFIDO_API_TOKEN;
  if (!token) throw new Error("ONFIDO_API_TOKEN non configuré");
  const base    = ENV.ONFIDO_BASE_URL ?? "https://api.eu.onfido.com/v3.6";
  const authHdr = onfidoAuthHeader(token);

  // 1. Upload selfie comme live_photo
  const selfieForm = new FormData();
  selfieForm.append("applicant_id", applicantId);
  selfieForm.append(
    "file",
    new Blob([new Uint8Array(selfieBuffer)], { type: "image/jpeg" }),
    "selfie.jpg",
  );
  const selfieRes = await fetch(`${base}/live_photos`, {
    method:  "POST",
    headers: authHdr,
    body:    selfieForm,
    signal:  AbortSignal.timeout(20_000),
  });
  if (!selfieRes.ok) {
    const err = await selfieRes.text().catch(() => "");
    throw new Error(`Onfido upload selfie: ${selfieRes.status} — ${err}`);
  }
  const selfie = await selfieRes.json() as { id: string };

  // 2. Upload photo document (optionnel — améliore le score facial)
  let docPhotoId: string | undefined;
  if (docPhotoBuffer) {
    const docForm = new FormData();
    docForm.append("applicant_id", applicantId);
    docForm.append("type",         "national_identity_card");
    docForm.append("side",         "front");
    docForm.append(
      "file",
      new Blob([new Uint8Array(docPhotoBuffer)], { type: "image/jpeg" }),
      "doc_photo.jpg",
    );
    const docRes = await fetch(`${base}/documents`, {
      method:  "POST",
      headers: authHdr,
      body:    docForm,
      signal:  AbortSignal.timeout(20_000),
    });
    if (docRes.ok) {
      const doc = await docRes.json() as { id: string };
      docPhotoId = doc.id;
    }
  }

  // 3. Créer le check facial_similarity_photo (+ document si dispo)
  const reportNames = ["facial_similarity_photo", ...(docPhotoId ? ["document"] : [])];

  const checkBody = JSON.stringify({
    applicant_id:  applicantId,
    report_names:  reportNames,
    live_photo_ids: [selfie.id],
    ...(docPhotoId ? { document_ids: [docPhotoId] } : {}),
  });
  const checkRes = await fetch(`${base}/checks`, {
    method:  "POST",
    headers: { ...authHdr, "Content-Type": "application/json" },
    body:    checkBody,
    signal:  AbortSignal.timeout(20_000),
  });
  if (!checkRes.ok) {
    const err = await checkRes.text().catch(() => "");
    throw new Error(`Onfido facial check: ${checkRes.status} — ${err}`);
  }
  let check = await checkRes.json() as OnfidoCheck;

  // 4. Polling max 90s
  if (check.status !== "complete") {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && check.status !== "complete") {
      await new Promise(r => setTimeout(r, 4_000));
      const poll = await fetch(`${base}/checks/${check.id}`, {
        headers: authHdr,
        signal:  AbortSignal.timeout(10_000),
      });
      if (poll.ok) check = await poll.json() as OnfidoCheck;
    }
  }

  // 5. Mapper le résultat
  const faceReport = check.reports?.find(r => r.name === "facial_similarity_photo");
  const livenessOk = faceReport?.breakdown?.liveness_photo?.result === "clear";
  const faceOk     = faceReport?.breakdown?.face_comparison?.result === "clear";

  let status: LivenessResult["status"];
  let score:  number;

  if (check.status !== "complete") {
    status = "REVIEW"; score = 50;
  } else if (check.result === "clear") {
    status = "PASS";   score = 95;
  } else if (check.result === "consider") {
    status = "REVIEW"; score = 45;
  } else {
    status = "FAIL";   score = 5;
  }

  return {
    status,
    score,
    livenessScore: livenessOk ? 95 : 60,
    checks: [
      {
        id:       "facial_match",
        label:    "Correspondance faciale selfie ↔ document",
        status:   faceOk ? "PASS" : status === "REVIEW" ? "WARN" : "FAIL",
        score,
        blocking: status === "FAIL",
        detail:   `Onfido check ${check.id} — result: ${check.result ?? "pending"} | face: ${faceReport?.result ?? "n/a"}`,
      },
      {
        id:       "liveness",
        label:    "Détection de vivacité",
        status:   livenessOk ? "PASS" : "WARN",
        score:    livenessOk ? 95 : 60,
        blocking: false,
        detail:   livenessOk ? "Vivacité confirmée (liveness_photo: clear)" : "Liveness non confirmée",
      },
    ],
    provider:      "onfido",
    processedAt:   new Date(),
    facialMatchId: check.id,
  };
}

// ─── Provider Sum Sub — SELFIE + face liveness ────────────────────────────────

function sumsubSign(
  secret: string, method: string, path: string, body: string | Buffer,
): { ts: string; sig: string } {
  const ts  = Math.floor(Date.now() / 1000).toString();
  const msg = Buffer.concat([
    Buffer.from(ts + method.toUpperCase() + path),
    Buffer.isBuffer(body) ? body : Buffer.from(body),
  ]);
  const sig = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  return { ts, sig };
}

function sumsubHeaders(
  token:  string,
  secret: string,
  method: string,
  path:   string,
  body:   string | Buffer,
  extra?: Record<string, string>,
): Record<string, string> {
  const { ts, sig } = sumsubSign(secret, method, path, body);
  return { "X-App-Token": token, "X-App-Access-Ts": ts, "X-App-Access-Sig": sig, ...extra };
}

interface SumsubStatus {
  id:           string;
  reviewStatus: string;
  reviewResult?: { reviewAnswer: "GREEN" | "RED" | "YELLOW"; label?: string; reviewRejectType?: string };
}

async function runSumsubLiveness(
  selfieBuffer: Buffer,
  applicantId:  string,
): Promise<LivenessResult> {
  const appToken  = ENV.SUMSUB_APP_TOKEN;
  const secretKey = ENV.SUMSUB_SECRET_KEY;
  if (!appToken || !secretKey) throw new Error("SUMSUB_APP_TOKEN / SUMSUB_SECRET_KEY requis");

  const BASE = "https://api.sumsub.com";

  // 1. Upload selfie comme SELFIE idDoc
  const selfieDocPath  = `/resources/applicants/${applicantId}/info/idDoc`;
  const selfieMetaBlob = new Blob(
    [JSON.stringify({ idDocType: "SELFIE" })],
    { type: "application/json" },
  );
  const selfieForm = new FormData();
  selfieForm.append("metadata", selfieMetaBlob, "meta.json");
  selfieForm.append(
    "content",
    new Blob([new Uint8Array(selfieBuffer)], { type: "image/jpeg" }),
    "selfie.jpg",
  );
  const selfieRes = await fetch(`${BASE}${selfieDocPath}`, {
    method:  "POST",
    headers: sumsubHeaders(appToken, secretKey, "POST", selfieDocPath, ""),
    body:    selfieForm,
    signal:  AbortSignal.timeout(20_000),
  });
  if (!selfieRes.ok) {
    const err = await selfieRes.text().catch(() => "");
    throw new Error(`SumSub upload selfie: ${selfieRes.status} — ${err}`);
  }

  // 2. Déclencher la révision liveness
  const reviewPath = `/resources/applicants/${applicantId}/status/pending`;
  await fetch(`${BASE}${reviewPath}`, {
    method:  "POST",
    headers: sumsubHeaders(appToken, secretKey, "POST", reviewPath, ""),
    signal:  AbortSignal.timeout(10_000),
  });

  // 3. Polling max 90s
  const statusPath = `/resources/applicants/${applicantId}/status`;
  let apStatus: SumsubStatus = { id: applicantId, reviewStatus: "pending" };
  const deadline   = Date.now() + 90_000;

  while (Date.now() < deadline && apStatus.reviewStatus !== "completed") {
    await new Promise(r => setTimeout(r, 4_000));
    const poll = await fetch(`${BASE}${statusPath}`, {
      headers: sumsubHeaders(appToken, secretKey, "GET", statusPath, ""),
      signal:  AbortSignal.timeout(10_000),
    });
    if (poll.ok) apStatus = await poll.json() as SumsubStatus;
  }

  // 4. Mapper le résultat
  const review = apStatus.reviewResult;
  let status: LivenessResult["status"];
  let score:  number;

  if (apStatus.reviewStatus !== "completed" || !review) {
    status = "REVIEW"; score = 50;
  } else if (review.reviewAnswer === "GREEN") {
    status = "PASS";   score = 95;
  } else if (review.reviewAnswer === "YELLOW") {
    status = "REVIEW"; score = 45;
  } else {
    status = "FAIL";   score = 5;
  }

  return {
    status,
    score,
    livenessScore: score,
    checks: [{
      id:       "sumsub_liveness",
      label:    "Vérification biométrique Sum Sub (liveness + selfie)",
      status:   status === "PASS" ? "PASS" : status === "REVIEW" ? "WARN" : "FAIL",
      score,
      blocking: status === "FAIL",
      detail:   `SumSub applicant ${applicantId} — answer: ${review?.reviewAnswer ?? "pending"}` +
                (review?.label ? ` | label: ${review.label}` : "") +
                (review?.reviewRejectType ? ` | reject: ${review.reviewRejectType}` : ""),
    }],
    provider:      "sumsub",
    processedAt:   new Date(),
    facialMatchId: applicantId,
  };
}

// ─── Provider local — InsightFace via ML service (ArcFace, 100% local) ────────

interface MlFaceCompareResponse {
  status:          "PASS" | "REVIEW" | "FAIL";
  similarity:      number;
  liveness_score:  number;
  detail:          string;
  selfie_detected: boolean;
  doc_detected:    boolean;
  model_ready:     boolean;
}

async function runLocalLiveness(
  selfieBuffer:   Buffer,
  docPhotoBuffer: Buffer | undefined,
): Promise<LivenessResult> {
  const sizeMb = selfieBuffer.length / (1024 * 1024);

  // Contrôle préalable : taille minimale du selfie
  const sizeCheck: BiometricCheck = {
    id:       "selfie_size",
    label:    "Taille image selfie",
    status:   sizeMb >= 0.05 ? "PASS" : "WARN",
    score:    sizeMb >= 0.05 ? 80 : 30,
    blocking: false,
    detail:   `${(sizeMb * 1024).toFixed(0)} KB — ${sizeMb >= 0.05 ? "résolution OK" : "image trop petite (<50 KB)"}`,
  };

  // Appel au service ML Python (InsightFace/ArcFace — local, sans provider externe)
  try {
    const selfieB64 = selfieBuffer.toString("base64");
    const docB64    = docPhotoBuffer ? docPhotoBuffer.toString("base64") : undefined;

    const body = JSON.stringify({
      selfie_b64:    selfieB64,
      doc_photo_b64: docB64 ?? null,
    });

    const res = await fetch(`${ML_SERVICE_URL}/face/compare`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key":    ML_API_KEY,
      },
      body,
      signal: AbortSignal.timeout(FACE_TIMEOUT),
    });

    if (!res.ok) {
      throw new Error(`ML service HTTP ${res.status}`);
    }

    const data = await res.json() as MlFaceCompareResponse;

    const faceCheck: BiometricCheck = {
      id:       "insightface_match",
      label:    "Correspondance faciale selfie ↔ document (InsightFace/ArcFace)",
      status:   data.status === "PASS" ? "PASS" : data.status === "FAIL" ? "FAIL" : "WARN",
      score:    data.liveness_score,
      blocking: data.status === "FAIL",
      detail:   data.detail +
                (data.similarity > 0 ? ` | similarité: ${(data.similarity * 100).toFixed(1)}%` : "") +
                (!data.model_ready ? " | modèle en chargement" : ""),
    };

    return {
      status:        data.status,
      score:         data.liveness_score,
      livenessScore: data.liveness_score,
      checks:        [sizeCheck, faceCheck],
      provider:      "local-insightface",
      processedAt:   new Date(),
    };

  } catch (err) {
    // Fallback : ML service indisponible → REVIEW, ne pas bloquer l'onboarding
    const errMsg = err instanceof Error ? err.name === "TimeoutError"
      ? "ML service timeout (30s) — IndightFace chargement lent (normal au 1er démarrage)"
      : err.message
      : String(err);

    log.warn({ err: errMsg }, "ML face service indisponible — fallback REVIEW");

    const hash  = crypto.createHash("sha256").update(selfieBuffer).digest("hex");
    const score = 55 + (parseInt(hash.slice(0, 4), 16) % 10); // 55-64 → toujours REVIEW

    return {
      status:        "REVIEW",
      score,
      livenessScore: score,
      checks: [
        sizeCheck,
        {
          id:       "insightface_unavailable",
          label:    "Comparaison faciale (InsightFace)",
          status:   "WARN",
          score,
          blocking: false,
          detail:   `Service ML indisponible (${errMsg.slice(0, 150)}) — révision manuelle requise`,
        },
      ],
      provider:    "local-fallback",
      processedAt: new Date(),
    };
  }
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Vérification biométrique complète (liveness + correspondance faciale)
 *
 * @param selfieBuffer   Image selfie JPG/PNG (>50 KB recommandé)
 * @param docPhotoBuffer Photo extraite du document (optionnel — améliore le score)
 * @param applicantId    ID applicant créé lors du runEkyc() (requis pour onfido/sumsub)
 * @param provider       Override du provider (défaut : ENV.EKYC_PROVIDER)
 */
export async function verifyLiveness(
  selfieBuffer:   Buffer,
  docPhotoBuffer: Buffer | undefined,
  applicantId:    string,
  provider        = ENV.EKYC_PROVIDER as string,
): Promise<LivenessResult> {
  log.info({ provider, selfieSize: selfieBuffer.length }, "Démarrage vérification biométrique");

  let result: LivenessResult;
  try {
    switch (provider) {
      case "onfido":
        result = await runOnfidoLiveness(selfieBuffer, docPhotoBuffer, applicantId);
        break;
      case "sumsub":
        result = await runSumsubLiveness(selfieBuffer, applicantId);
        break;
      default:
        result = await runLocalLiveness(selfieBuffer, docPhotoBuffer);
    }
  } catch (err) {
    log.error({ err, provider }, "Erreur vérification biométrique — fallback REVIEW");
    const errMsg = err instanceof Error ? err.message : String(err);
    // Fallback : ne pas bloquer l'onboarding sur erreur technique → REVIEW manuel
    result = {
      status:        "REVIEW",
      score:         0,
      livenessScore: 0,
      checks: [{
        id:       "biometric_error",
        label:    "Erreur vérification biométrique",
        status:   "WARN",
        score:    0,
        blocking: false,
        detail:   `Erreur technique (${errMsg.slice(0, 200)}) — révision manuelle requise`,
      }],
      provider:    provider,
      processedAt: new Date(),
    };
  }

  log.info({
    provider,
    status:        result.status,
    score:         result.score,
    livenessScore: result.livenessScore,
  }, "Vérification biométrique terminée");

  return result;
}
