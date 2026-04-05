/**
 * Webhooks Mobile Money — Orange Money, Wave, CIH Mobile
 *
 * Activé uniquement si mobileConnectors=true (PAYMENT_INSTITUTION).
 * Montés dans _core/index.ts AVANT express.json() pour garder le raw body.
 *
 * Sécurité :
 *   - Signature HMAC-SHA256 (en-tête X-Webhook-Signature, format sha256=<hex>)
 *   - Fenêtre de tolérance 5 min sur le champ `timestamp` du payload
 *   - Déduplication 24h via Redis (clé webhook:mobile:dedup:<externalRef>)
 *
 * Chaque provider a un format payload légèrement différent ; ce module
 * normalise tout vers le format `createTransaction` interne.
 *
 * Routes :
 *   POST /webhooks/mobile/orange   — Orange Money Maroc
 *   POST /webhooks/mobile/wave     — Wave (Afrique de l'Ouest)
 *   POST /webhooks/mobile/cih      — CIH Mobile Banking
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response }       from "express";
import { createTransaction }            from "../transactions/transactions.service";
import { getInstitutionFlags }          from "../../_core/institution";
import { createLogger }                 from "../../_core/logger";
import { ENV }                          from "../../_core/env";
import { redis }                        from "../../_core/redis";

const log = createLogger("webhook-mobile");

const TOLERANCE_MS      = 5 * 60 * 1000;
const DEDUP_TTL_SECONDS = 86_400;

// ─── Signature ────────────────────────────────────────────────────────────────

function verifySignature(rawBody: Buffer, header: string | undefined): boolean {
  const secret = ENV.WEBHOOK_SECRET;
  if (!secret) {
    log.warn("WEBHOOK_SECRET non configuré — signature non vérifiée");
    return true;
  }
  if (!header) return false;

  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(header, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

// ─── Helper : extraire rawBody ────────────────────────────────────────────────

function getRawBody(req: Request): Buffer {
  const stored = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (Buffer.isBuffer(stored) && stored.length > 0) return stored;
  if (Buffer.isBuffer(req.body) && (req.body as Buffer).length > 0) return req.body as Buffer;
  return Buffer.from("{}");
}

// ─── Guard — flag mobileConnectors ───────────────────────────────────────────

function guardFlag(res: Response): boolean {
  if (!getInstitutionFlags().mobileConnectors) {
    res.status(403).json({ error: "Connecteurs mobiles non activés pour cette institution" });
    return false;
  }
  return true;
}

// ─── Déduplication ────────────────────────────────────────────────────────────

async function isDuplicate(provider: string, externalRef: string): Promise<boolean> {
  const key = `webhook:mobile:dedup:${provider}:${externalRef}`;
  const exists = await redis.get(key).catch(() => null);
  if (exists) return true;
  await redis.setex(key, DEDUP_TTL_SECONDS, "1").catch(() => null);
  return false;
}

// ─── Normalisation Orange Money ───────────────────────────────────────────────

interface OrangeMoneyPayload {
  transactionRef:  string;
  clientId:        number;
  amount:          string;
  currency?:       string;
  operationType:   "CASH_IN" | "CASH_OUT" | "TRANSFER" | "PAYMENT";
  msisdn?:         string;
  counterparty?:   string;
  timestamp:       number;
}

async function handleOrangeMoney(req: Request, res: Response): Promise<void> {
  if (!guardFlag(res)) return;

  const rawBody  = getRawBody(req);
  const sigHeader = req.headers["x-webhook-signature"] as string | undefined;

  let payload: OrangeMoneyPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as OrangeMoneyPayload;
  } catch {
    res.status(400).json({ error: "JSON invalide" }); return;
  }

  if (sigHeader && !verifySignature(rawBody, sigHeader)) {
    log.warn({ ip: req.ip }, "[Orange] Signature invalide");
    res.status(401).json({ error: "Signature invalide" }); return;
  }

  if (payload.timestamp) {
    const age = Date.now() - payload.timestamp;
    if (Math.abs(age) > TOLERANCE_MS) {
      res.status(400).json({ error: "Timestamp hors tolérance (±5 min)" }); return;
    }
  }

  if (!payload.transactionRef || !payload.clientId || !payload.amount) {
    res.status(400).json({ error: "Champs obligatoires manquants" }); return;
  }

  if (await isDuplicate("orange", payload.transactionRef)) {
    res.json({ success: true, duplicate: true }); return;
  }

  const txTypeMap: Record<OrangeMoneyPayload["operationType"], "AGENT_CASH_IN" | "AGENT_CASH_OUT" | "P2P_TRANSFER" | "MERCHANT_PAYMENT"> = {
    CASH_IN:  "AGENT_CASH_IN",
    CASH_OUT: "AGENT_CASH_OUT",
    TRANSFER: "P2P_TRANSFER",
    PAYMENT:  "MERCHANT_PAYMENT",
  };

  try {
    const tx = await createTransaction({
      customerId:      payload.clientId,
      amount:          payload.amount,
      currency:        payload.currency ?? "MAD",
      transactionType: txTypeMap[payload.operationType] ?? "MOBILE_MONEY_IN",
      channel:         "MOBILE",
      ...(payload.counterparty ? { counterparty: payload.counterparty } : {}),
      ...(payload.msisdn        ? { counterparty: payload.msisdn }       : {}),
    });

    log.info({ ref: payload.transactionRef, txId: tx.transactionId }, "[Orange] Transaction ingérée");
    res.json({ success: true, transactionId: tx.transactionId, riskScore: tx.riskScore });

  } catch (err) {
    log.error({ err, ref: payload.transactionRef }, "[Orange] Erreur traitement");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erreur interne" });
  }
}

// ─── Normalisation Wave ───────────────────────────────────────────────────────

interface WavePayload {
  id:            string;
  customer_id:   number;
  amount:        string;
  currency?:     string;
  type:          "send" | "receive" | "payment";
  recipient?:    string;
  ts:            number;  // Unix seconds
}

async function handleWave(req: Request, res: Response): Promise<void> {
  if (!guardFlag(res)) return;

  const rawBody   = getRawBody(req);
  const sigHeader = req.headers["x-webhook-signature"] as string | undefined;

  let payload: WavePayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as WavePayload;
  } catch {
    res.status(400).json({ error: "JSON invalide" }); return;
  }

  if (sigHeader && !verifySignature(rawBody, sigHeader)) {
    log.warn({ ip: req.ip }, "[Wave] Signature invalide");
    res.status(401).json({ error: "Signature invalide" }); return;
  }

  if (payload.ts) {
    const age = Date.now() - payload.ts * 1000;
    if (Math.abs(age) > TOLERANCE_MS) {
      res.status(400).json({ error: "Timestamp hors tolérance" }); return;
    }
  }

  if (!payload.id || !payload.customer_id || !payload.amount) {
    res.status(400).json({ error: "Champs obligatoires manquants" }); return;
  }

  if (await isDuplicate("wave", payload.id)) {
    res.json({ success: true, duplicate: true }); return;
  }

  const typeMap: Record<WavePayload["type"], "MOBILE_MONEY_OUT" | "MOBILE_MONEY_IN" | "MERCHANT_PAYMENT"> = {
    send:    "MOBILE_MONEY_OUT",
    receive: "MOBILE_MONEY_IN",
    payment: "MERCHANT_PAYMENT",
  };

  try {
    const tx = await createTransaction({
      customerId:      payload.customer_id,
      amount:          payload.amount,
      currency:        payload.currency ?? "XOF",
      transactionType: typeMap[payload.type] ?? "MOBILE_MONEY_IN",
      channel:         "MOBILE",
      ...(payload.recipient ? { counterparty: payload.recipient } : {}),
    });

    log.info({ ref: payload.id, txId: tx.transactionId }, "[Wave] Transaction ingérée");
    res.json({ success: true, transactionId: tx.transactionId, riskScore: tx.riskScore });

  } catch (err) {
    log.error({ err, ref: payload.id }, "[Wave] Erreur traitement");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erreur interne" });
  }
}

// ─── Normalisation CIH Mobile ─────────────────────────────────────────────────

interface CihMobilePayload {
  refOperacion:    string;
  idCliente:       number;
  montant:         string;
  devise?:         string;
  typeOperation:   "VIREMENT" | "PAIEMENT" | "RECHARGE" | "RETRAIT";
  beneficiaire?:   string;
  timestamp:       number;
}

async function handleCihMobile(req: Request, res: Response): Promise<void> {
  if (!guardFlag(res)) return;

  const rawBody   = getRawBody(req);
  const sigHeader = req.headers["x-webhook-signature"] as string | undefined;

  let payload: CihMobilePayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as CihMobilePayload;
  } catch {
    res.status(400).json({ error: "JSON invalide" }); return;
  }

  if (sigHeader && !verifySignature(rawBody, sigHeader)) {
    log.warn({ ip: req.ip }, "[CIH] Signature invalide");
    res.status(401).json({ error: "Signature invalide" }); return;
  }

  if (payload.timestamp) {
    const age = Date.now() - payload.timestamp;
    if (Math.abs(age) > TOLERANCE_MS) {
      res.status(400).json({ error: "Timestamp hors tolérance" }); return;
    }
  }

  if (!payload.refOperacion || !payload.idCliente || !payload.montant) {
    res.status(400).json({ error: "Champs obligatoires manquants" }); return;
  }

  if (await isDuplicate("cih", payload.refOperacion)) {
    res.json({ success: true, duplicate: true }); return;
  }

  const typeMap: Record<CihMobilePayload["typeOperation"], "P2P_TRANSFER" | "BILL_PAYMENT" | "MOBILE_MONEY_IN" | "AGENT_CASH_OUT"> = {
    VIREMENT: "P2P_TRANSFER",
    PAIEMENT: "BILL_PAYMENT",
    RECHARGE: "MOBILE_MONEY_IN",
    RETRAIT:  "AGENT_CASH_OUT",
  };

  try {
    const tx = await createTransaction({
      customerId:      payload.idCliente,
      amount:          payload.montant,
      currency:        payload.devise ?? "MAD",
      transactionType: typeMap[payload.typeOperation] ?? "MOBILE_MONEY_IN",
      channel:         "MOBILE",
      ...(payload.beneficiaire ? { counterparty: payload.beneficiaire } : {}),
    });

    log.info({ ref: payload.refOperacion, txId: tx.transactionId }, "[CIH] Transaction ingérée");
    res.json({ success: true, transactionId: tx.transactionId, riskScore: tx.riskScore });

  } catch (err) {
    log.error({ err, ref: payload.refOperacion }, "[CIH] Erreur traitement");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erreur interne" });
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { handleOrangeMoney, handleWave, handleCihMobile };
