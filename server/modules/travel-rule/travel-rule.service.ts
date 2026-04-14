/**
 * Service Travel Rule — FATF Recommendation 16
 *
 * Déclenchement automatique lors de tout transfert >= 10 000 MAD (≈ 1 000 USD)
 * entre deux PSP. Le message IVMS 101 est :
 *   1. Généré à partir des données client/transaction
 *   2. Validé (contrôle de complétude IVMS 101)
 *   3. Envoyé au VASP bénéficiaire (endpoint configurable)
 *   4. Stocké en Redis (5 ans) pour audit
 *
 * En production, l'envoi utilise l'un des protocoles suivants :
 *   - OpenVASP (open-source, peer-to-peer)
 *   - TRP Protocol (FATF-endorsed)
 *   - Notabene / Sygna Bridge (SaaS)
 *   - Endpoint direct REST (bilatéral avec partenaires BAM agréés)
 */

import { redis }          from "../../_core/redis";
import { createLogger }   from "../../_core/logger";
import { ENV }            from "../../_core/env";
import { db }             from "../../_core/db";
import { transactions, customers } from "../../../drizzle/schema";
import { eq }             from "drizzle-orm";
import {
  buildIvms101Message,
  buildNaturalPerson,
  buildLegalPerson,
  validateIvms101,
  isTravelRuleRequired,
  type Ivms101Message,
  type Ivms101ValidationResult,
} from "./travel-rule.ivms";

const log = createLogger("travel-rule");

const VASP_URL           = process.env["TRAVEL_RULE_VASP_URL"]    ?? "";
const VASP_API_KEY       = process.env["TRAVEL_RULE_VASP_API_KEY"] ?? "";
const REDIS_PREFIX       = "travel_rule:msg:";
const REDIS_TTL          = 5 * 365 * 86_400;  // 5 ans
const REDIS_STATUS_PREFIX = "travel_rule:status:";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TravelRuleRecord {
  messageId:     string;
  transactionId: number;
  transactionRef: string;
  amount:        number;
  currency:      string;
  status:        "PENDING" | "SENT" | "ACKNOWLEDGED" | "FAILED" | "SKIPPED";
  message:       Ivms101Message;
  validation:    Ivms101ValidationResult;
  sentAt?:       string;
  response?:     string;
  error?:        string;
  createdAt:     string;
}

// ─── VASP de l'établissement déclarant ───────────────────────────────────────

function getOwnVasp() {
  return buildLegalPerson({
    name:       ENV.INSTITUTION_NAME,
    country:    ENV.ORG_COUNTRY,
    city:       ENV.ORG_CITY,
    identifier: ENV.TRACFIN_ENTITY_ID,
  });
}

// ─── Générer + envoyer le message Travel Rule ─────────────────────────────────

export async function processTravelRule(transactionDbId: number): Promise<TravelRuleRecord | null> {
  // Charger la transaction + client
  const [tx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionDbId))
    .limit(1);
  if (!tx) return null;

  const amount = Number(tx.amount);
  if (!isTravelRuleRequired(amount, tx.currency ?? "MAD")) {
    log.debug({ txId: tx.transactionId, amount }, "Travel Rule non requise (<seuil)");
    return null;
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, tx.customerId))
    .limit(1);
  if (!customer) return null;

  // Construire les parties IVMS 101
  const originatorPerson = buildNaturalPerson({
    firstName:    customer.firstName,
    lastName:     customer.lastName,
    nationality:  customer.nationality ?? "MA",
    ...(customer.dateOfBirth ? { dateOfBirth: customer.dateOfBirth }    : {}),
    ...(customer.address     ? { address:     customer.address }         : {}),
    ...(customer.city        ? { city:        customer.city }            : {}),
    country:      customer.residenceCountry ?? "MA",
  });

  // Le bénéficiaire est la contrepartie — données minimales si PSP externe
  const beneficiaryName   = tx.counterparty ?? "UNKNOWN BENEFICIARY";
  const [bLastName = "", ...bFirstParts] = beneficiaryName.split(" ").reverse();
  const bFirstName  = bFirstParts.reverse().join(" ") || bLastName;
  const beneficiaryPerson = buildNaturalPerson({
    firstName: bFirstName || "N/A",
    lastName:  bLastName  || beneficiaryName,
    country:   tx.counterpartyCountry ?? "MA",
  });

  // VASP bénéficiaire — configurable, sinon générique "UNKNOWN PSP"
  const beneficiaryVasp = buildLegalPerson({
    name:    tx.counterparty ?? "PSP BENEFICIARY",
    country: tx.counterpartyCountry ?? "MA",
  });

  const message = buildIvms101Message({
    originator: {
      person:        originatorPerson,
      accountNumber: tx.walletId ? `WALLET-${tx.walletId}` : `ACCT-${tx.customerId}`,
      isNatural:     true,
    },
    beneficiary: {
      person:        beneficiaryPerson,
      accountNumber: tx.counterparty ?? "N/A",
      isNatural:     true,
    },
    originatingVasp: getOwnVasp(),
    beneficiaryVasp,
    amount,
    currency:      tx.currency ?? "MAD",
    transactionRef: tx.transactionId,
  });

  const validation = validateIvms101(message);

  const record: TravelRuleRecord = {
    messageId:      message.messageId,
    transactionId:  transactionDbId,
    transactionRef: tx.transactionId,
    amount,
    currency:       tx.currency ?? "MAD",
    status:         "PENDING",
    message,
    validation,
    createdAt:      new Date().toISOString(),
  };

  if (!validation.valid) {
    log.warn({ messageId: message.messageId, errors: validation.errors }, "IVMS 101 invalide — message en attente");
    record.status = "PENDING";
    await storeRecord(record);
    return record;
  }

  // Envoi vers le VASP bénéficiaire
  if (VASP_URL) {
    try {
      const res = await fetch(`${VASP_URL}/travel-rule/receive`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${VASP_API_KEY}`,
          "X-Message-Id":  message.messageId,
        },
        body:   JSON.stringify(message),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        record.status  = "ACKNOWLEDGED";
        record.sentAt  = new Date().toISOString();
        record.response = await res.text().catch(() => "");
        log.info({ messageId: message.messageId, txId: tx.transactionId }, "Travel Rule IVMS 101 envoyé et accusé");
      } else {
        record.status = "SENT";   // envoyé mais pas d'accusé immédiat
        record.sentAt = new Date().toISOString();
        record.error  = `HTTP ${res.status}`;
      }
    } catch (err) {
      record.status = "FAILED";
      record.error  = err instanceof Error ? err.message : String(err);
      log.error({ err, messageId: message.messageId }, "Erreur envoi Travel Rule");
    }
  } else {
    // Pas de VASP_URL configurée — stocker localement pour envoi manuel
    record.status = "PENDING";
    log.info({ messageId: message.messageId }, "Travel Rule générée — TRAVEL_RULE_VASP_URL non configuré (envoi manuel requis)");
  }

  await storeRecord(record);
  return record;
}

// ─── Stockage Redis ───────────────────────────────────────────────────────────

async function storeRecord(record: TravelRuleRecord): Promise<void> {
  try {
    await redis.setex(`${REDIS_PREFIX}${record.messageId}`, REDIS_TTL, JSON.stringify(record));
    await redis.setex(`${REDIS_STATUS_PREFIX}${record.transactionRef}`, REDIS_TTL, record.messageId);
  } catch (err) {
    log.error({ err }, "Erreur stockage Travel Rule Redis");
  }
}

// ─── Récupérer un message Travel Rule ────────────────────────────────────────

export async function getTravelRuleByTransactionRef(txRef: string): Promise<TravelRuleRecord | null> {
  const messageId = await redis.get(`${REDIS_STATUS_PREFIX}${txRef}`).catch(() => null);
  if (!messageId) return null;
  const data = await redis.get(`${REDIS_PREFIX}${messageId}`).catch(() => null);
  return data ? (JSON.parse(data) as TravelRuleRecord) : null;
}

export async function getTravelRuleById(messageId: string): Promise<TravelRuleRecord | null> {
  const data = await redis.get(`${REDIS_PREFIX}${messageId}`).catch(() => null);
  return data ? (JSON.parse(data) as TravelRuleRecord) : null;
}

// ─── Lister les messages Travel Rule en attente (status = PENDING/FAILED) ────

export async function getPendingTravelRules(): Promise<TravelRuleRecord[]> {
  const keys = await redis.keys(`${REDIS_PREFIX}*`).catch(() => [] as string[]);
  const records: TravelRuleRecord[] = [];
  for (const key of keys.slice(0, 200)) {
    const data = await redis.get(key).catch(() => null);
    if (!data) continue;
    const rec = JSON.parse(data) as TravelRuleRecord;
    if (rec.status === "PENDING" || rec.status === "FAILED") records.push(rec);
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── Statistiques Travel Rule ─────────────────────────────────────────────────

export async function getTravelRuleStats(): Promise<{
  total: number; sent: number; pending: number; failed: number; acknowledged: number;
}> {
  const keys = await redis.keys(`${REDIS_PREFIX}*`).catch(() => [] as string[]);
  const stats = { total: 0, sent: 0, pending: 0, failed: 0, acknowledged: 0 };
  for (const key of keys.slice(0, 500)) {
    const data = await redis.get(key).catch(() => null);
    if (!data) continue;
    const rec = JSON.parse(data) as TravelRuleRecord;
    stats.total++;
    if (rec.status === "SENT")         stats.sent++;
    else if (rec.status === "PENDING") stats.pending++;
    else if (rec.status === "FAILED")  stats.failed++;
    else if (rec.status === "ACKNOWLEDGED") stats.acknowledged++;
  }
  return stats;
}
