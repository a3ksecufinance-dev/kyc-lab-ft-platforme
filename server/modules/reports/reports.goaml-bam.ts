/**
 * Connecteur GoAML BAM — Transmission réelle vers Bank Al-Maghrib
 *
 * Protocole BAM GoAML v5 :
 *  1. OAuth2 client_credentials → access_token (TTL 3600s, mis en cache Redis)
 *  2. POST multipart/form-data  /api/v1/str/upload  — XML + métadonnées
 *  3. Réponse : { upload_id, status: "RECEIVED" | "PROCESSING" | "VALIDATED" | "REJECTED" }
 *  4. Polling GET /api/v1/str/{upload_id}/status jusqu'à VALIDATED/REJECTED (max 5 min)
 *  5. Retry automatique 3 tentatives avec backoff exponentiel (5s → 15s → 45s)
 *  6. Dead-letter queue Redis si 3 échecs → alerte compliance CRITICAL en DB
 *
 * Numérotation séquentielle réglementaire (ANRF) :
 *  Format : {ENTITY_CODE}-{YEAR}-{TYPE}-{SEQ:06d}
 *  Exemple : "EST-2026-STR-000042"
 *  Séquence via Redis INCR (atomique, multi-instance safe)
 *
 * Variables d'environnement requises :
 *  GOAML_BAM_URL           — URL de base GoAML BAM  (ex: https://goaml.bam.ma)
 *  GOAML_BAM_CLIENT_ID     — Client ID OAuth2
 *  GOAML_BAM_CLIENT_SECRET — Client Secret OAuth2
 *  GOAML_BAM_ENTITY_CODE   — Code entité déclarante (ex: "EST")
 */

import { redis }         from "../../_core/redis";
import { createLogger }  from "../../_core/logger";
import { db }            from "../../_core/db";
import { alerts }        from "../../../drizzle/schema";
import { nanoid }        from "nanoid";

const log = createLogger("goaml-bam");

const BAM_URL           = process.env["GOAML_BAM_URL"]           ?? "";
const BAM_CLIENT_ID     = process.env["GOAML_BAM_CLIENT_ID"]     ?? "";
const BAM_CLIENT_SECRET = process.env["GOAML_BAM_CLIENT_SECRET"] ?? "";
const BAM_ENTITY_CODE   = process.env["GOAML_BAM_ENTITY_CODE"]   ?? "EST";

const TOKEN_KEY    = "goaml:bam:token";
const SEQ_PREFIX   = "goaml:bam:seq";
const DLQ_KEY      = "goaml:bam:dlq";
const RETRY_PREFIX = "goaml:bam:retry:";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BamTransmissionResult {
  success:       boolean;
  bamRef:        string | null;    // REF séquentiel: EST-2026-STR-000042
  uploadId:      string | null;    // ID côté BAM GoAML
  status:        "VALIDATED" | "RECEIVED" | "PROCESSING" | "REJECTED" | "ERROR";
  sentAt:        Date;
  validatedAt:   Date | null;
  attempts:      number;
  errorMessage?: string;
  xmlChecksum:   string;
}

interface DlqEntry {
  bamRef:     string;
  reportId:   string;
  checksum:   string;
  xml:        string;
  enqueuedAt: string;
  attempts:   number;
  lastError:  string;
}

// ─── OAuth2 Token BAM ─────────────────────────────────────────────────────────

interface CachedToken { access_token: string; expires_at: number }

async function getBamToken(): Promise<string> {
  const cached = await redis.get(TOKEN_KEY).catch(() => null);
  if (cached) {
    const t = JSON.parse(cached) as CachedToken;
    if (t.expires_at > Date.now() + 60_000) return t.access_token;
  }

  if (!BAM_URL || !BAM_CLIENT_ID || !BAM_CLIENT_SECRET) {
    throw new Error(
      "GOAML_BAM_URL / GOAML_BAM_CLIENT_ID / GOAML_BAM_CLIENT_SECRET requis pour le mode GOAML_BAM",
    );
  }

  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     BAM_CLIENT_ID,
    client_secret: BAM_CLIENT_SECRET,
    scope:         "goaml:str:write goaml:str:read",
  });

  const res = await fetch(`${BAM_URL}/auth/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`BAM OAuth2 erreur HTTP ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  const token: CachedToken = {
    access_token: data.access_token,
    expires_at:   Date.now() + data.expires_in * 1_000,
  };

  await redis.setex(TOKEN_KEY, data.expires_in - 60, JSON.stringify(token));
  log.info("Token OAuth2 BAM obtenu et mis en cache");
  return token.access_token;
}

// ─── Numérotation séquentielle (REF ANRF) ─────────────────────────────────────

async function nextBamRef(type: "STR" | "CTR"): Promise<string> {
  const year = new Date().getFullYear();
  const key  = `${SEQ_PREFIX}:${year}:${type}`;
  const seq  = await redis.incr(key);
  // TTL 2 ans — survit aux renouvellements annuels
  await redis.expire(key, 2 * 365 * 86_400);
  return `${BAM_ENTITY_CODE}-${year}-${type}-${String(seq).padStart(6, "0")}`;
}

// ─── Upload multipart vers BAM GoAML ──────────────────────────────────────────

async function uploadToBam(
  xml:      string,
  bamRef:   string,
  checksum: string,
  token:    string,
): Promise<{ upload_id: string; status: string }> {
  const form = new FormData();
  form.append("file",      new Blob([xml], { type: "application/xml" }), `${bamRef}.xml`);
  form.append("ref",       bamRef);
  form.append("checksum",  checksum);
  form.append("entity_id", BAM_ENTITY_CODE);

  const res = await fetch(`${BAM_URL}/api/v1/str/upload`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body:    form,
    signal:  AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`BAM upload HTTP ${res.status}: ${err.slice(0, 200)}`);
  }

  return res.json() as Promise<{ upload_id: string; status: string }>;
}

// ─── Polling d'acknowledgment ─────────────────────────────────────────────────

async function pollBamStatus(
  uploadId: string,
  token:    string,
  maxWaitMs = 300_000,
): Promise<"VALIDATED" | "REJECTED" | "PROCESSING"> {
  const deadline = Date.now() + maxWaitMs;
  let   interval = 5_000;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    interval = Math.min(interval * 1.5, 30_000);  // cap à 30s

    try {
      const res = await fetch(`${BAM_URL}/api/v1/str/${uploadId}/status`, {
        headers: { "Authorization": `Bearer ${token}` },
        signal:  AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = await res.json() as { status: string };
        if (data.status === "VALIDATED") return "VALIDATED";
        if (data.status === "REJECTED")  return "REJECTED";
      }
    } catch (err) {
      log.warn({ err, uploadId }, "Polling BAM — erreur réseau, retry");
    }
  }

  return "PROCESSING";  // timeout → considéré en cours de traitement
}

// ─── Dead-letter queue + alerte compliance ────────────────────────────────────

async function sendToDeadLetter(entry: DlqEntry): Promise<void> {
  await redis.lpush(DLQ_KEY, JSON.stringify(entry));
  await redis.ltrim(DLQ_KEY, 0, 99);  // garder les 100 derniers échecs

  log.error({
    bamRef:   entry.bamRef,
    attempts: entry.attempts,
    error:    entry.lastError,
  }, "STR/CTR en dead-letter — intervention manuelle requise");

  // Alerte CRITICAL en base pour le tableau de bord compliance
  try {
    await db.insert(alerts).values({
      alertId:   `ALT-${nanoid(8).toUpperCase()}`,
      alertType: "SYSTEM",
      priority:  "CRITICAL",
      status:    "OPEN",
      reason:    `Échec transmission GoAML BAM après ${entry.attempts} tentatives — REF: ${entry.bamRef} | ${entry.lastError.slice(0, 200)}`,
      riskScore: 100,
      createdAt: new Date(),
    } as never);
    log.info({ bamRef: entry.bamRef }, "Alerte compliance GoAML créée en DB");
  } catch (dbErr) {
    log.error({ dbErr }, "Impossible de créer l'alerte compliance GoAML");
  }
}

// ─── Transmission principale avec retry ───────────────────────────────────────

export async function transmitBamStr(
  reportId:   string,
  xml:        string,
  checksum:   string,
  reportType: "STR" | "CTR" = "STR",
): Promise<BamTransmissionResult> {
  if (!BAM_URL) {
    throw new Error("GOAML_BAM_URL non configuré — impossible d'utiliser le mode GOAML_BAM");
  }

  const bamRef      = await nextBamRef(reportType);
  const maxAttempts = 3;
  let   attempts    = 0;
  let   lastError   = "";
  let   uploadId: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;

    try {
      const token  = await getBamToken();
      const upload = await uploadToBam(xml, bamRef, checksum, token);
      uploadId     = upload.upload_id;

      log.info({ bamRef, uploadId, attempt }, "XML STR téléchargé vers BAM GoAML");

      const finalStatus = await pollBamStatus(uploadId, token);

      await redis.del(`${RETRY_PREFIX}${reportId}`).catch(() => undefined);

      const result: BamTransmissionResult = {
        success:     finalStatus === "VALIDATED",
        bamRef,
        uploadId,
        status:      finalStatus,
        sentAt:      new Date(),
        validatedAt: finalStatus === "VALIDATED" ? new Date() : null,
        attempts,
        xmlChecksum: checksum,
      };

      log.info({ bamRef, uploadId, status: finalStatus, attempts }, "Transmission GoAML BAM terminée");
      return result;

    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log.warn({ attempt, maxAttempts, bamRef, error: lastError }, "Tentative GoAML BAM échouée");

      if (attempt < maxAttempts) {
        const backoff = 5_000 * Math.pow(3, attempt - 1);  // 5s, 15s, 45s
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }

  // 3 tentatives épuisées → dead-letter
  await sendToDeadLetter({ bamRef, reportId, checksum, xml, enqueuedAt: new Date().toISOString(), attempts, lastError });

  return {
    success:      false,
    bamRef,
    uploadId,
    status:       "ERROR",
    sentAt:       new Date(),
    validatedAt:  null,
    attempts,
    errorMessage: lastError,
    xmlChecksum:  checksum,
  };
}

// ─── Dead-letter queue — consultation et retraitement ─────────────────────────

export async function getBamDeadLetterQueue(): Promise<DlqEntry[]> {
  try {
    const items = await redis.lrange(DLQ_KEY, 0, 49);
    return items.map(s => JSON.parse(s) as DlqEntry);
  } catch { return []; }
}

export async function retryBamDeadLetter(index: number): Promise<BamTransmissionResult> {
  const items = await redis.lrange(DLQ_KEY, index, index);
  if (!items[0]) throw new Error(`Aucun élément DLQ à l'index ${index}`);
  const entry = JSON.parse(items[0]) as DlqEntry;
  await redis.lrem(DLQ_KEY, 1, items[0]);
  log.info({ bamRef: entry.bamRef, index }, "Retraitement DLQ GoAML BAM");
  return transmitBamStr(entry.reportId, entry.xml, entry.checksum);
}

// ─── Vérification de disponibilité du service BAM ─────────────────────────────

export async function checkBamConnectivity(): Promise<{
  configured: boolean;
  reachable:  boolean;
  tokenOk:    boolean;
  error?:     string;
}> {
  if (!BAM_URL || !BAM_CLIENT_ID || !BAM_CLIENT_SECRET) {
    return { configured: false, reachable: false, tokenOk: false, error: "Variables GOAML_BAM_* non configurées" };
  }

  try {
    const healthRes = await fetch(`${BAM_URL}/health`, { signal: AbortSignal.timeout(5_000) });
    const reachable = healthRes.ok || healthRes.status < 500;

    let tokenOk = false;
    let tokenErr: string | undefined;
    try {
      await getBamToken();
      tokenOk = true;
    } catch (e) {
      tokenErr = e instanceof Error ? e.message : String(e);
    }

    return { configured: true, reachable, tokenOk, ...(tokenErr ? { error: tokenErr } : {}) };
  } catch (err) {
    return { configured: true, reachable: false, tokenOk: false, error: err instanceof Error ? err.message : String(err) };
  }
}
