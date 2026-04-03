/**
 * Sprint 6 — Localisation MENA
 * Fichier : server/modules/aml/aml.engine.ts (REMPLACE l'existant)
 *
 * Nouveautés vs version actuelle :
 *  Règle 9  — HAWALA_PATTERN  : flux cash agence + fréquence + non-résident
 *  Règle 10 — MENA_STRUCTURING : fragmentations spécifiques aux pays MENA
 *  Règle 11 — CASH_INTENSIVE  : dépôts/retraits cash répétés (typique hawala)
 *
 * Toutes les règles existantes (1-8) sont inchangées.
 */

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
  | "UNUSUAL_CHANNEL"
  | "HAWALA_PATTERN"      // Sprint 6 — nouveau
  | "MENA_STRUCTURING"    // Sprint 6 — nouveau
  | "CASH_INTENSIVE";     // Sprint 6 — nouveau

// ─── Pays à risque élevé (inchangé) ──────────────────────────────────────────

const HIGH_RISK_COUNTRIES = new Set([
  "KP","IR","MM","BY","RU","SY","YE","AF","LY","SO",
  "SS","CF","CD","HT","CU","VE","PK","NG","ZA",
]);

// Pays sous embargo total → priorité CRITICAL (OFAC/ONU Tier 1)
const CRITICAL_RISK_COUNTRIES = new Set(["KP","IR","CU","SY"]);

// ─── Pays MENA (Sprint 6) ─────────────────────────────────────────────────────
// Pays où les systèmes hawala sont répandus selon MENAFATF / BAM

const MENA_COUNTRIES = new Set([
  "MA","DZ","TN","LY","EG","SD","SO","DJ","ER",  // Afrique du Nord + Corne
  "SA","AE","QA","KW","BH","OM","YE","JO","IQ",  // Golfe + Levant
  "LB","SY","PS","TR","PK","AF","IR",             // Moyen-Orient étendu
  "MR","ML","NE","SN","GM","GW","GN","SL",        // Afrique de l'Ouest (hawala)
]);

// ─── Canaux cash (Sprint 6) ───────────────────────────────────────────────────

const CASH_CHANNELS = new Set(["BRANCH", "ATM"]);

// ─── Règles 1-8 (inchangées) ─────────────────────────────────────────────────

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

async function ruleStructuring(tx: Transaction): Promise<AmlRuleResult> {
  const windowHours = ENV.AML_STRUCTURING_WINDOW_HOURS;
  const singleThreshold = ENV.AML_THRESHOLD_SINGLE_TX;
  const structuringThreshold = ENV.AML_THRESHOLD_STRUCTURING;
  const since = new Date(tx.transactionDate.getTime() - windowHours * 60 * 60 * 1000);
  const recent = await findRecentByCustomer(tx.customerId, since);
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
    details: { transactionCount: underThreshold.length + 1, totalAmount, windowHours, txIds: underThreshold.map((t) => t.transactionId) },
  };
}

async function ruleHighFrequency(tx: Transaction): Promise<AmlRuleResult> {
  const threshold = ENV.AML_FREQUENCY_THRESHOLD;
  const since = new Date(tx.transactionDate.getTime() - 24 * 60 * 60 * 1000);
  const recent = await findRecentByCustomer(tx.customerId, since);
  const count = recent.filter((t) => t.id !== tx.id).length;
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

async function ruleVolumeSpike(tx: Transaction): Promise<AmlRuleResult> {
  const variationThreshold = ENV.AML_VOLUME_VARIATION_THRESHOLD / 100;
  const monthAgo = new Date(tx.transactionDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { totalAmount: monthlyVolume, count } = await getVolumeStats(tx.customerId, monthAgo);
  if (count < 3) return { triggered: false, rule: "VOLUME_SPIKE", score: 0, priority: "LOW", reason: "", details: {} };
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

function ruleHighRiskCountry(tx: Transaction): AmlRuleResult {
  const country = tx.counterpartyCountry;
  const triggered = !!country && HIGH_RISK_COUNTRIES.has(country);
  const isCritical = triggered && CRITICAL_RISK_COUNTRIES.has(country!);
  return {
    triggered,
    rule: "HIGH_RISK_COUNTRY",
    score: triggered ? (isCritical ? 90 : 70) : 0,
    priority: isCritical ? "CRITICAL" : "HIGH",
    reason: `Contrepartie dans un pays à risque élevé : ${country}`,
    details: { country },
  };
}

function rulePepTransaction(tx: Transaction, customer: Customer): AmlRuleResult {
  const triggered = customer.pepStatus || customer.customerType === "PEP";
  return {
    triggered,
    rule: "PEP_TRANSACTION",
    score: triggered ? (Number(tx.amount) >= ENV.AML_THRESHOLD_SINGLE_TX ? 75 : 50) : 0,
    priority: "HIGH",
    reason: `Transaction d'un client PEP — montant : ${tx.amount} ${tx.currency}`,
    details: { amount: tx.amount, pepStatus: customer.pepStatus, customerType: customer.customerType },
  };
}

function ruleRoundAmount(tx: Transaction): AmlRuleResult {
  const amount = Number(tx.amount);
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

function ruleUnusualChannel(tx: Transaction): AmlRuleResult {
  const amount = Number(tx.amount);
  const threshold = ENV.AML_THRESHOLD_SINGLE_TX * 0.5;
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

// ─── Règle 9 — HAWALA_PATTERN (Sprint 6) ─────────────────────────────────────
/**
 * Détecte les patterns hawala (système de transfert informel) :
 * - Flux cash (BRANCH/ATM) répétés
 * - Fréquence élevée sur courte période
 * - Client non-résident ou pays de résidence MENA
 * - Contrepartie dans un pays MENA
 *
 * Source réglementaire : BAM Circulaire 5/W/2023 · MENAFATF Rapport hawala 2024
 */
async function ruleHawalaPattern(tx: Transaction, customer: Customer): Promise<AmlRuleResult> {
  const hawalaCashChannel = CASH_CHANNELS.has(tx.channel);
  const counterpartyMena  = !!tx.counterpartyCountry && MENA_COUNTRIES.has(tx.counterpartyCountry);
  const customerMena      = !!customer.residenceCountry && MENA_COUNTRIES.has(customer.residenceCountry);
  const isNonResident     = customer.residenceCountry !== "MA"; // Ajuster selon le pays de référence

  // Compter transactions cash récentes (48h)
  const since48h = new Date(tx.transactionDate.getTime() - 48 * 60 * 60 * 1000);
  const recent48h = await findRecentByCustomer(tx.customerId, since48h);
  const cashTxCount = recent48h.filter(
    t => t.id !== tx.id && (t.channel === "BRANCH" || t.channel === "ATM")
  ).length + (hawalaCashChannel ? 1 : 0);

  // Conditions hawala :
  // 1. Canal cash + contrepartie MENA + fréquence ≥ 3 en 48h
  // 2. Canal cash + non-résident + montant significatif
  const hawalaCond1 = hawalaCashChannel && counterpartyMena && cashTxCount >= 3;
  const hawalaCond2 = hawalaCashChannel && isNonResident && customerMena && Number(tx.amount) >= 2000;
  const triggered   = hawalaCond1 || hawalaCond2;

  const score = triggered
    ? (hawalaCond1 && hawalaCond2 ? 80 : 60)
    : 0;

  return {
    triggered,
    rule: "HAWALA_PATTERN",
    score,
    priority: score >= 60 ? "HIGH" : "MEDIUM",
    reason: triggered
      ? `Pattern hawala détecté : canal ${tx.channel} + ${cashTxCount} tx cash 48h + contrepartie MENA (${tx.counterpartyCountry ?? "?"})`
      : "",
    details: {
      channel: tx.channel,
      cashTxCount48h: cashTxCount,
      counterpartyCountry: tx.counterpartyCountry,
      residenceCountry: customer.residenceCountry,
      isNonResident,
      hawalaCond1,
      hawalaCond2,
    },
  };
}

// ─── Règle 10 — MENA_STRUCTURING (Sprint 6) ──────────────────────────────────
/**
 * Structuring spécifique aux marchés MENA :
 * - Transactions juste sous le seuil BAM (9 500–9 999 MAD)
 * - Multiples virements vers le même pays MENA
 * - Pattern typique de blanchiment via transferts familiaux fictifs
 *
 * Source : BAM Circulaire 5/W/2023 · Typologies UTRF Maroc 2024
 */
async function ruleMenaStructuring(tx: Transaction): Promise<AmlRuleResult> {
  const amount = Number(tx.amount);
  const threshold = ENV.AML_THRESHOLD_SINGLE_TX;

  // Zone grise BAM : entre 85% et 99% du seuil
  const inGrayZone = amount >= threshold * 0.85 && amount < threshold;

  if (!inGrayZone || !tx.counterpartyCountry) {
    return { triggered: false, rule: "MENA_STRUCTURING", score: 0, priority: "LOW", reason: "", details: {} };
  }

  const isMenaCounterparty = MENA_COUNTRIES.has(tx.counterpartyCountry);
  if (!isMenaCounterparty) {
    return { triggered: false, rule: "MENA_STRUCTURING", score: 0, priority: "LOW", reason: "", details: {} };
  }

  // Vérifier si d'autres transactions similaires existent vers le même pays (7j)
  const since7d = new Date(tx.transactionDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recent7d = await findRecentByCustomer(tx.customerId, since7d);
  const similarTx = recent7d.filter(
    t => t.id !== tx.id
      && Number(t.amount) >= threshold * 0.85
      && Number(t.amount) < threshold
      && t.counterpartyCountry === tx.counterpartyCountry
  );

  const triggered = true; // gray zone + MENA counterparty est suffisant

  return {
    triggered,
    rule: "MENA_STRUCTURING",
    score: triggered ? Math.min(50 + similarTx.length * 10, 75) : 0,
    priority: "HIGH",
    reason: triggered
      ? `Structuring MENA : ${similarTx.length + 1} transactions ${amount.toFixed(0)}–${threshold.toFixed(0)} vers ${tx.counterpartyCountry} en 7j`
      : "",
    details: {
      amount,
      threshold,
      grayZonePct: Math.round((amount / threshold) * 100),
      counterpartyCountry: tx.counterpartyCountry,
      similarCount: similarTx.length,
    },
  };
}

// ─── Règle 11 — CASH_INTENSIVE (Sprint 6) ────────────────────────────────────
/**
 * Activité cash intensive — indicateur de blanchiment de stade 1 (placement)
 * - Nombreux dépôts/retraits cash en agence
 * - Montants variables mais réguliers
 * - Incompatible avec le profil déclaré du client
 *
 * Source : FATF Rec.20 · BAM liste indicateurs typologiques
 */
async function ruleCashIntensive(tx: Transaction, customer: Customer): Promise<AmlRuleResult> {
  const isCashTx = tx.channel === "BRANCH" || tx.channel === "ATM";
  if (!isCashTx) {
    return { triggered: false, rule: "CASH_INTENSIVE", score: 0, priority: "LOW", reason: "", details: {} };
  }

  // Analyser les 30 derniers jours
  const since30d = new Date(tx.transactionDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recent = await findRecentByCustomer(tx.customerId, since30d);
  const cashTx = recent.filter(t => t.channel === "BRANCH" || t.channel === "ATM");
  const cashTotal = cashTx.reduce((s, t) => s + Number(t.amount), 0) + Number(tx.amount);

  // Seuils : ≥10 tx cash/mois OU total cash ≥ 3× seuil réglementaire
  const highFreq   = cashTx.length + 1 >= 10;
  const highVolume = cashTotal >= ENV.AML_THRESHOLD_SINGLE_TX * 3;

  // Aggravant si le client est LOW_RISK ou APPROVED → profil incohérent
  const profileInconsistent = customer.riskLevel === "LOW" && (highFreq || highVolume);

  const triggered = (highFreq || highVolume) && (
    // Critère MENA : client résidant dans un pays hawala = tolérance zéro
    (customer.residenceCountry && MENA_COUNTRIES.has(customer.residenceCountry))
    || profileInconsistent
  );

  const score = triggered
    ? Math.min(30 + (highFreq ? 15 : 0) + (highVolume ? 15 : 0) + (profileInconsistent ? 10 : 0), 60)
    : 0;

  return {
    triggered: !!triggered,
    rule: "CASH_INTENSIVE",
    score,
    priority: score >= 50 ? "MEDIUM" : "LOW",
    reason: triggered
      ? `Activité cash intensive : ${cashTx.length + 1} tx / ${cashTotal.toFixed(0)}€ en 30j (profil : ${customer.riskLevel})`
      : "",
    details: {
      cashTxCount: cashTx.length + 1,
      cashTotal,
      highFreq,
      highVolume,
      profileInconsistent,
      riskLevel: customer.riskLevel,
      residenceCountry: customer.residenceCountry,
    },
  };
}

// ─── Orchestrateur principal ─────────────────────────────────────────────────

export async function runAmlRules(
  tx: Transaction,
  customer: Customer
): Promise<AmlRuleResult[]> {
  try {
    const results = await Promise.all([
      // Règles 1-8 (inchangées)
      Promise.resolve(ruleThresholdExceeded(tx)),
      ruleStructuring(tx),
      ruleHighFrequency(tx),
      ruleVolumeSpike(tx),
      Promise.resolve(ruleHighRiskCountry(tx)),
      Promise.resolve(rulePepTransaction(tx, customer)),
      Promise.resolve(ruleRoundAmount(tx)),
      Promise.resolve(ruleUnusualChannel(tx)),
      // Règles Sprint 6 — MENA
      ruleHawalaPattern(tx, customer),
      ruleMenaStructuring(tx),
      ruleCashIntensive(tx, customer),
    ]);

    const triggered = results.filter((r) => r.triggered);

    if (triggered.length === 0) {
      await updateTransaction(tx.id, { status: "COMPLETED", riskScore: 0 });
      return results;
    }

    const totalScore = Math.min(
      triggered.reduce((sum, r) => sum + r.score, 0),
      100
    );

    const priorityOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    const maxPriority = triggered.reduce((max, r) => {
      return priorityOrder[r.priority] > priorityOrder[max] ? r.priority : max;
    }, "LOW" as AmlRuleResult["priority"]);

    const riskRules = triggered.map((r) => ({
      rule: r.rule, score: r.score, reason: r.reason,
    }));

    await updateTransaction(tx.id, {
      status: "FLAGGED",
      isSuspicious: true,
      riskScore: totalScore,
      riskRules: riskRules as unknown as null,
      flagReason: triggered.map((r) => r.rule).join(", "),
    });

    // Déterminer le type d'alerte (enrichi Sprint 6)
    const alertType = triggered.some(r => r.rule === "HAWALA_PATTERN" || r.rule === "MENA_STRUCTURING")
      ? "PATTERN"
      : triggered.some(r => r.rule === "STRUCTURING" || r.rule === "HIGH_FREQUENCY" || r.rule === "CASH_INTENSIVE")
        ? "PATTERN"
        : triggered.some(r => r.rule === "THRESHOLD_EXCEEDED" || r.rule === "VOLUME_SPIKE")
          ? "THRESHOLD"
          : triggered.some(r => r.rule === "HIGH_RISK_COUNTRY")
            ? "FRAUD"
            : "VELOCITY";

    const scenarioLabel = triggered.map((r) => r.rule).join(" + ");

    const newAlert = await insertAlert({
      alertId:       `ALT-${nanoid(8).toUpperCase()}`,
      customerId:    tx.customerId,
      transactionId: tx.id,
      scenario:      scenarioLabel,
      alertType,
      priority:      maxPriority,
      status:        "OPEN",
      riskScore:     totalScore,
      reason:        triggered.map((r) => r.reason).join(" | "),
      enrichmentData: {
        triggeredRules: triggered.map((r) => ({ rule: r.rule, score: r.score, details: r.details })),
        customer: {
          customerId:      customer.customerId,
          riskLevel:       customer.riskLevel,
          pepStatus:       customer.pepStatus,
          residenceCountry: customer.residenceCountry,  // Sprint 6 — ajouté
        },
        sprint6_mena: triggered.some(r =>                // Sprint 6 — tag MENA
          ["HAWALA_PATTERN","MENA_STRUCTURING","CASH_INTENSIVE"].includes(r.rule)
        ),
      } as unknown as null,
    });

    if (maxPriority === "CRITICAL") {
      void notifyCriticalAlertAsync(
        newAlert.alertId,
        `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || `Client #${tx.customerId}`,
        scenarioLabel,
        totalScore,
      );
    }

    amlAlertsTotal.labels(maxPriority).inc();
    amlTransactionsAnalyzed.inc();

    log.info(
      { txId: tx.transactionId, rules: triggered.map((r) => r.rule), score: totalScore },
      "Alerte AML créée"
    );

    return results;
  } catch (err) {
    log.error({ err, txId: tx.transactionId }, "Erreur moteur AML");
    return [];
  }
}
