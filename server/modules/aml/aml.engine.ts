import { ENV } from "../../_core/env";
import { createLogger } from "../../_core/logger";
import { nanoid } from "nanoid";
import {
  findRecentByCustomer,
  getVolumeStats,
  updateTransaction,
  insertAlert,
} from "../transactions/transactions.repository";
import { notifyCriticalAlert } from "../../_core/mailer";
import { amlAlertsTotal, amlTransactionsAnalyzed } from "../../_core/metrics";
import type { Transaction, Customer } from "../../../drizzle/schema";

const log = createLogger("aml-engine");

// ─── Notification asynchrone alertes critiques ────────────────────────────────

async function notifyCriticalAlertAsync(
  alertId: string,
  customerName: string,
  scenario: string,
  riskScore: number,
): Promise<void> {
  try {
    // Récupérer les emails des superviseurs + compliance officers
    const { db } = await import("../../_core/db");
    const { users } = await import("../../../drizzle/schema");
    const { inArray, eq, and } = await import("drizzle-orm");

    const recipients = await db
      .select({ email: users.email })
      .from(users)
      .where(
        and(
          inArray(users.role, ["supervisor", "compliance_officer", "admin"]),
          eq(users.isActive, true),
        )
      );

    const emails = recipients.map((r: { email: string }) => r.email).filter(Boolean);
    if (!emails.length) return;

    await notifyCriticalAlert({
      to:           emails,
      alertId,
      customerName,
      scenario,
      riskScore,
      alertUrl:     `${ENV.APP_URL}/alerts`,
    });
  } catch (err) {
    log.warn({ err, alertId }, "Erreur notification alerte critique");
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AmlRuleResult {
  triggered: boolean;
  rule: AmlRuleName;
  score: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
  details: Record<string, unknown>;
}

export type AmlRuleName =
  | "THRESHOLD_EXCEEDED"
  | "STRUCTURING"
  | "HIGH_FREQUENCY"
  | "VOLUME_SPIKE"
  | "HIGH_RISK_COUNTRY"
  | "PEP_TRANSACTION"
  | "SANCTION_COUNTERPARTY"
  | "ROUND_AMOUNT"
  | "UNUSUAL_CHANNEL";

// ─── Pays à risque élevé (FATF blacklist + greylists + pays sous sanctions) ──
// Source : FATF public statement + EU high-risk third countries
const HIGH_RISK_COUNTRIES = new Set([
  "KP", // Corée du Nord
  "IR", // Iran
  "MM", // Myanmar
  "BY", // Biélorussie
  "RU", // Russie (sanctions EU/OFAC)
  "SY", // Syrie
  "YE", // Yémen
  "AF", // Afghanistan
  "LY", // Libye
  "SO", // Somalie
  "SS", // Soudan du Sud
  "CF", // Centrafrique
  "CD", // Congo (RDC)
  "HT", // Haïti
  "CU", // Cuba
  "VE", // Venezuela
  "PK", // Pakistan (greylisted FATF)
  "NG", // Nigéria (greylisted FATF)
  "ZA", // Afrique du Sud (greylisted FATF)
]);

// ─── Règles AML ───────────────────────────────────────────────────────────────

/**
 * RÈGLE 1 — THRESHOLD_EXCEEDED
 * Transaction unique dépassant le seuil réglementaire (TRACFIN : 10 000€)
 */
function ruleThresholdExceeded(tx: Transaction): AmlRuleResult {
  const amount = Number(tx.amount);
  const threshold = ENV.AML_THRESHOLD_SINGLE_TX;
  const triggered = amount >= threshold;

  return {
    triggered,
    rule: "THRESHOLD_EXCEEDED",
    score: triggered ? (amount >= threshold * 2 ? 80 : 60) : 0,
    priority: amount >= threshold * 2 ? "CRITICAL" : "HIGH",
    reason: `Montant ${amount} ${tx.currency} dépasse le seuil réglementaire de ${threshold}€`,
    details: { amount, threshold, currency: tx.currency },
  };
}

/**
 * RÈGLE 2 — STRUCTURING (Smurfing)
 * Plusieurs transactions sous le seuil dans une fenêtre de temps
 * somme > seuil → fragmentation délibérée
 */
async function ruleStructuring(tx: Transaction): Promise<AmlRuleResult> {
  const windowHours = ENV.AML_STRUCTURING_WINDOW_HOURS;
  const singleThreshold = ENV.AML_THRESHOLD_SINGLE_TX;
  const structuringThreshold = ENV.AML_THRESHOLD_STRUCTURING;

  const since = new Date(tx.transactionDate.getTime() - windowHours * 60 * 60 * 1000);
  const recent = await findRecentByCustomer(tx.customerId, since);

  // Transactions sous le seuil unique (potentiel structuring)
  const underThreshold = recent.filter(
    (t) => Number(t.amount) < singleThreshold && Number(t.amount) >= structuringThreshold && t.id !== tx.id
  );

  const totalAmount = underThreshold.reduce((sum, t) => sum + Number(t.amount), 0) + Number(tx.amount);
  const triggered = underThreshold.length >= 2 && totalAmount >= singleThreshold;

  return {
    triggered,
    rule: "STRUCTURING",
    score: triggered ? 75 : 0,
    priority: "HIGH",
    reason: `Fragmentation possible : ${underThreshold.length + 1} transactions totalisant ${totalAmount.toFixed(2)}€ sur ${windowHours}h`,
    details: {
      transactionCount: underThreshold.length + 1,
      totalAmount,
      windowHours,
      txIds: underThreshold.map((t) => t.transactionId),
    },
  };
}

/**
 * RÈGLE 3 — HIGH_FREQUENCY
 * Trop de transactions dans une courte fenêtre de temps
 */
async function ruleHighFrequency(tx: Transaction): Promise<AmlRuleResult> {
  const threshold = ENV.AML_FREQUENCY_THRESHOLD;
  const since = new Date(tx.transactionDate.getTime() - 24 * 60 * 60 * 1000);
  const recent = await findRecentByCustomer(tx.customerId, since);

  const count = recent.filter((t) => t.id !== tx.id).length + 1;
  const triggered = count >= threshold;

  return {
    triggered,
    rule: "HIGH_FREQUENCY",
    score: triggered ? Math.min(40 + (count - threshold) * 5, 70) : 0,
    priority: count >= threshold * 2 ? "HIGH" : "MEDIUM",
    reason: `${count} transactions en 24h — seuil : ${threshold}`,
    details: { count, threshold, windowHours: 24 },
  };
}

/**
 * RÈGLE 4 — VOLUME_SPIKE
 * Volume soudainement bien supérieur à la moyenne historique
 */
async function ruleVolumeSpike(tx: Transaction): Promise<AmlRuleResult> {
  const variationThreshold = ENV.AML_VOLUME_VARIATION_THRESHOLD / 100; // ex: 300% → 3.0

  // Volume des 30 derniers jours
  const monthAgo = new Date(tx.transactionDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { totalAmount: monthlyVolume, count } = await getVolumeStats(tx.customerId, monthAgo);

  if (count < 3) {
    // Pas assez d'historique pour détecter une anomalie
    return { triggered: false, rule: "VOLUME_SPIKE", score: 0, priority: "LOW", reason: "", details: {} };
  }

  const avgDaily = monthlyVolume / 30;
  const todayAmount = Number(tx.amount);
  const variation = avgDaily > 0 ? todayAmount / avgDaily : 0;
  const triggered = variation >= variationThreshold;

  return {
    triggered,
    rule: "VOLUME_SPIKE",
    score: triggered ? Math.min(30 + variation * 5, 60) : 0,
    priority: "MEDIUM",
    reason: `Volume ${todayAmount}€ représente ${(variation * 100).toFixed(0)}% de la moyenne journalière (${avgDaily.toFixed(2)}€)`,
    details: { todayAmount, avgDaily, variation: variation * 100, threshold: variationThreshold * 100 },
  };
}

/**
 * RÈGLE 5 — HIGH_RISK_COUNTRY
 * Contrepartie dans un pays à risque élevé (liste FATF)
 */
function ruleHighRiskCountry(tx: Transaction): AmlRuleResult {
  const country = tx.counterpartyCountry;
  const triggered = !!country && HIGH_RISK_COUNTRIES.has(country);

  return {
    triggered,
    rule: "HIGH_RISK_COUNTRY",
    score: triggered ? 70 : 0,
    priority: "HIGH",
    reason: `Contrepartie dans un pays à risque élevé : ${country}`,
    details: { country },
  };
}

/**
 * RÈGLE 6 — PEP_TRANSACTION
 * Transaction impliquant un client PEP → surveillance renforcée
 */
function rulePepTransaction(tx: Transaction, customer: Customer): AmlRuleResult {
  const triggered = customer.pepStatus || customer.customerType === "PEP";

  return {
    triggered,
    rule: "PEP_TRANSACTION",
    score: triggered ? 50 : 0,
    priority: "HIGH",
    reason: `Transaction d'un client PEP — montant : ${tx.amount} ${tx.currency}`,
    details: { amount: tx.amount, pepStatus: customer.pepStatus, customerType: customer.customerType },
  };
}

/**
 * RÈGLE 7 — ROUND_AMOUNT
 * Montants ronds souvent associés à des transactions fictives
 */
function ruleRoundAmount(tx: Transaction): AmlRuleResult {
  const amount = Number(tx.amount);
  // Montant rond : divisible par 1000 et supérieur à 5000
  const triggered = amount >= 5000 && amount % 1000 === 0;

  return {
    triggered,
    rule: "ROUND_AMOUNT",
    score: triggered ? 20 : 0,
    priority: "LOW",
    reason: `Montant rond suspect : ${amount} ${tx.currency}`,
    details: { amount },
  };
}

/**
 * RÈGLE 8 — UNUSUAL_CHANNEL
 * Canal inhabituel combiné à un montant élevé
 */
function ruleUnusualChannel(tx: Transaction): AmlRuleResult {
  const amount = Number(tx.amount);
  const threshold = ENV.AML_THRESHOLD_SINGLE_TX * 0.5; // 50% du seuil
  // Transactions importantes via ATM ou API sont inhabituelles
  const triggered = (tx.channel === "ATM" || tx.channel === "API") && amount >= threshold;

  return {
    triggered,
    rule: "UNUSUAL_CHANNEL",
    score: triggered ? 30 : 0,
    priority: "MEDIUM",
    reason: `Montant élevé (${amount}€) via canal ${tx.channel}`,
    details: { amount, channel: tx.channel, threshold },
  };
}

// ─── Orchestrateur principal ─────────────────────────────────────────────────

/**
 * Exécute toutes les règles AML sur une transaction.
 * Crée les alertes pour chaque règle déclenchée.
 * Met à jour le riskScore et isSuspicious sur la transaction.
 *
 * Appelé de manière asynchrone après createTransaction — ne bloque pas la réponse.
 */
export async function runAmlRules(
  tx: Transaction,
  customer: Customer
): Promise<AmlRuleResult[]> {
  try {
    // Exécuter les règles synchrones + asynchrones en parallèle
    const results = await Promise.all([
      Promise.resolve(ruleThresholdExceeded(tx)),
      ruleStructuring(tx),
      ruleHighFrequency(tx),
      ruleVolumeSpike(tx),
      Promise.resolve(ruleHighRiskCountry(tx)),
      Promise.resolve(rulePepTransaction(tx, customer)),
      Promise.resolve(ruleRoundAmount(tx)),
      Promise.resolve(ruleUnusualChannel(tx)),
    ]);

    const triggered = results.filter((r) => r.triggered);

    if (triggered.length === 0) {
      // Aucune règle déclenchée → marquer COMPLETED proprement
      await updateTransaction(tx.id, { status: "COMPLETED", riskScore: 0 });
      return [];
    }

    // Calculer le score global (plafond 100)
    const totalScore = Math.min(
      triggered.reduce((sum, r) => sum + r.score, 0),
      100
    );

    // Déterminer la priorité maximale
    const priorityOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    const maxPriority = triggered.reduce((max, r) => {
      return priorityOrder[r.priority] > priorityOrder[max] ? r.priority : max;
    }, "LOW" as AmlRuleResult["priority"]);

    // Stocker les règles déclenchées sur la transaction (audit trail)
    const riskRules = triggered.map((r) => ({
      rule: r.rule,
      score: r.score,
      reason: r.reason,
    }));

    // Mettre à jour la transaction
    await updateTransaction(tx.id, {
      status: "FLAGGED",
      isSuspicious: true,
      riskScore: totalScore,
      riskRules: riskRules as unknown as null, // jsonb field
      flagReason: triggered.map((r) => r.rule).join(", "),
    });

    // Créer une alerte unique consolidant toutes les règles déclenchées
    const alertType = triggered.some((r) => r.rule === "STRUCTURING" || r.rule === "HIGH_FREQUENCY")
      ? "PATTERN"
      : triggered.some((r) => r.rule === "THRESHOLD_EXCEEDED" || r.rule === "VOLUME_SPIKE")
        ? "THRESHOLD"
        : triggered.some((r) => r.rule === "HIGH_RISK_COUNTRY")
          ? "FRAUD"
          : "VELOCITY";

    const scenarioLabel = triggered.map((r) => r.rule).join(" + ");

    const newAlert = await insertAlert({
      alertId: `ALT-${nanoid(8).toUpperCase()}`,
      customerId: tx.customerId,
      transactionId: tx.id,
      scenario: scenarioLabel,
      alertType,
      priority: maxPriority,
      status: "OPEN",
      riskScore: totalScore,
      reason: triggered.map((r) => r.reason).join(" | "),
      enrichmentData: {
        triggeredRules: triggered.map((r) => ({
          rule: r.rule,
          score: r.score,
          details: r.details,
        })),
        customer: {
          customerId: customer.customerId,
          riskLevel: customer.riskLevel,
          pepStatus: customer.pepStatus,
        },
      } as unknown as null,
    });

    // Notifier par email pour les alertes CRITICAL
    if (maxPriority === "CRITICAL") {
      void notifyCriticalAlertAsync(
        newAlert.alertId,
        `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || `Client #${tx.customerId}`,
        scenarioLabel,
        totalScore,
      );
    }

    // Métriques Prometheus
    amlAlertsTotal.labels(maxPriority).inc();
    amlTransactionsAnalyzed.inc();

    log.info(
      { txId: tx.transactionId, rules: triggered.map((r) => r.rule), score: totalScore },
      "Alerte AML créée"
    );

    return triggered;
  } catch (err) {
    log.error({ err, txId: tx.transactionId }, "Erreur moteur AML");
    return [];
  }
}
