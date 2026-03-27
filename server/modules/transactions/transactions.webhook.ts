/**
 * Webhook entrant transactions — ingestion depuis CBS (Core Banking System)
 *
 * Sécurité :
 *   - Signature HMAC-SHA256 dans l'en-tête X-Webhook-Signature
 *   - Format : sha256=<hex>
 *   - Clé de signature dans ENV.WEBHOOK_SECRET
 *   - Fenêtre de tolérance 5 minutes (timestamp dans le payload)
 *   - Déduplication par transactionId (idempotent)
 *
 * Format du payload JSON attendu :
 * {
 *   transactionId: string,       // ID unique côté CBS
 *   customerId: number,          // ID client dans notre système
 *   amount: string,              // "1234.56"
 *   currency: string,            // "EUR"
 *   transactionType: string,     // "TRANSFER" | "DEPOSIT" | ...
 *   channel?: string,
 *   counterparty?: string,
 *   counterpartyCountry?: string,
 *   counterpartyBank?: string,
 *   purpose?: string,
 *   transactionDate?: string,    // ISO 8601
 *   timestamp: number,           // Unix ms — pour validation fraîcheur
 * }
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { createTransaction } from "./transactions.service";
import { createLogger } from "../../_core/logger";
import { ENV } from "../../_core/env";
import { redis } from "../../_core/redis";

const log = createLogger("webhook-tx");

const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;  // 5 minutes
const DEDUP_TTL_SECONDS    = 86_400;          // 24h

// ─── Vérification signature HMAC ─────────────────────────────────────────────

function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = ENV.WEBHOOK_SECRET;
  if (!secret) {
    log.warn("WEBHOOK_SECRET non configuré — signature non vérifiée");
    return true;  // En dev sans secret configuré, laisser passer
  }

  const expected = "sha256=" + createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(expected, "utf8"),
    );
  } catch {
    return false;
  }
}

// ─── Types du payload CBS ─────────────────────────────────────────────────────

interface CbsTransactionPayload {
  transactionId:       string;
  customerId:          number;
  amount:              string;
  currency?:           string;
  transactionType:     "TRANSFER" | "DEPOSIT" | "WITHDRAWAL" | "PAYMENT" | "EXCHANGE" | "OTHER";
  channel?:            "ONLINE" | "MOBILE" | "BRANCH" | "ATM" | "API" | "WIRE" | "OTHER";
  counterparty?:       string;
  counterpartyCountry?: string;
  counterpartyBank?:   string;
  purpose?:            string;
  transactionDate?:    string;
  timestamp:           number;  // Unix ms
}

// "OTHER" n'est pas dans transactionTypeEnum → mapper vers "TRANSFER"
function mapTransactionType(
  t: CbsTransactionPayload["transactionType"]
): "TRANSFER" | "DEPOSIT" | "WITHDRAWAL" | "PAYMENT" | "EXCHANGE" {
  if (t === "OTHER") return "TRANSFER";
  return t;
}

// "WIRE" et "OTHER" ne sont pas dans channelEnum → mapper vers "API"
function mapChannel(
  c?: CbsTransactionPayload["channel"]
): "ONLINE" | "MOBILE" | "BRANCH" | "ATM" | "API" | undefined {
  if (!c || c === "WIRE" || c === "OTHER") return "API";
  return c;
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function handleTransactionWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers["x-webhook-signature"] as string | undefined;

  // Récupérer le body brut — robuste aux deux ordres de middleware
  const stored = (req as unknown as { rawBody?: Buffer }).rawBody;
  const rawBody: Buffer = Buffer.isBuffer(stored) && stored.length > 0
    ? stored
    : Buffer.isBuffer(req.body) && (req.body as Buffer).length > 0
      ? req.body as Buffer
      : Buffer.from("{}");

  // Parser le payload JSON
  let payload: CbsTransactionPayload;
  if (rawBody.toString() === "{}") {
    // Fallback : express.json() a déjà parsé → utiliser req.body directement
    if (req.body && typeof req.body === "object") {
      log.warn("Webhook: body déjà parsé par express.json() — HMAC non vérifiable");
      payload = req.body as CbsTransactionPayload;
    } else {
      res.status(400).json({ error: "Corps de la requête vide ou illisible" });
      return;
    }
  } else {
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as CbsTransactionPayload;
    } catch {
      res.status(400).json({ error: "JSON invalide" });
      return;
    }
  }

  // Vérifier la signature HMAC seulement si rawBody original disponible
  if (signature && Buffer.isBuffer(stored) && stored.length > 0) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      log.warn({ ip: req.ip }, "Signature webhook invalide");
      res.status(401).json({ error: "Signature invalide" });
      return;
    }
  }

  // 3. Vérifier la fraîcheur du timestamp (5 min max)
  if (payload.timestamp) {
    const age = Date.now() - payload.timestamp;
    if (age > WEBHOOK_TOLERANCE_MS || age < -WEBHOOK_TOLERANCE_MS) {
      log.warn({ age, transactionId: payload.transactionId }, "Webhook trop ancien ou futur");
      res.status(400).json({ error: "Timestamp hors tolérance (±5 min)" });
      return;
    }
  }

  // 4. Déduplication — idempotence
  const dedupKey = `webhook:dedup:${payload.transactionId}`;
  const alreadyProcessed = await redis.get(dedupKey).catch(() => null);
  if (alreadyProcessed) {
    log.info({ transactionId: payload.transactionId }, "Webhook dupliqué — ignoré");
    res.json({ success: true, duplicate: true });
    return;
  }

  // 5. Valider les champs obligatoires
  if (!payload.transactionId || !payload.customerId || !payload.amount || !payload.transactionType) {
    res.status(400).json({ error: "Champs obligatoires manquants: transactionId, customerId, amount, transactionType" });
    return;
  }

  // 6. Créer la transaction (déclenche AML + ML scoring)
  try {
    const tx = await createTransaction({
      customerId:          payload.customerId,
      amount:              payload.amount,
      currency:            payload.currency ?? "EUR",
      transactionType:     mapTransactionType(payload.transactionType),
      ...(payload.channel            ? { channel:            mapChannel(payload.channel) }  : {}),
      ...(payload.counterparty       ? { counterparty:       payload.counterparty }       : {}),
      ...(payload.counterpartyCountry ? { counterpartyCountry: payload.counterpartyCountry } : {}),
      ...(payload.counterpartyBank   ? { counterpartyBank:   payload.counterpartyBank }   : {}),
      ...(payload.purpose            ? { purpose:            payload.purpose }            : {}),
      ...(payload.transactionDate    ? { transactionDate:    new Date(payload.transactionDate) } : {}),
    });

    // Marquer comme traité (24h)
    await redis.setex(dedupKey, DEDUP_TTL_SECONDS, tx.transactionId);

    log.info({
      transactionId: tx.transactionId,
      customerId:    payload.customerId,
      amount:        payload.amount,
    }, "Transaction CBS ingérée via webhook");

    res.json({
      success:       true,
      transactionId: tx.transactionId,
      riskScore:     tx.riskScore,
      isSuspicious:  tx.isSuspicious,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur interne";
    log.error({ err, payload }, "Erreur traitement webhook transaction");
    res.status(500).json({ error: msg });
  }
}
