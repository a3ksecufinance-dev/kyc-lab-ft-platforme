/**
 * Moteur AML Dynamique v2
 *
 * Évalue les règles stockées en base de données plutôt que codées en dur.
 * Chaque règle définit ses conditions en JSON :
 *
 * Opérateurs simples :
 *   { "field": "amount",  "op": ">=", "value": 10000 }
 *   { "field": "channel", "op": "in", "value": ["ATM","API"] }
 *   { "field": "counterpartyCountry", "op": "in", "value": ["KP","IR","RU"] }
 *
 * Opérateurs composés :
 *   { "logic": "AND", "rules": [ ...conditions ] }
 *   { "logic": "OR",  "rules": [ ...conditions ] }
 *
 * Opérateurs agrégés (nécessitent contexte étendu) :
 *   { "field": "recentTxCount",    "op": ">=", "value": 10 }
 *   { "field": "recentTxVolume",   "op": ">=", "value": 50000 }
 *   { "field": "volumeVariation",  "op": ">=", "value": 300 }
 */

import { createLogger } from "../../_core/logger";
import {
  findRecentByCustomer,
  getVolumeStats,
  insertAlert,
  updateTransaction,
} from "../transactions/transactions.repository";
import { getAllExecutableRules, insertExecution } from "./aml-rules.repository";
import type { AmlRule } from "../../../drizzle/schema";
import type { Transaction, Customer } from "../../../drizzle/schema";
import { nanoid } from "nanoid";

const log = createLogger("aml-rules-engine");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DynamicRuleResult {
  triggered: boolean;
  rule: AmlRule;
  score: number;
  reason: string;
  details: Record<string, unknown>;
  isTesting: boolean;  // vrai si rule.status === 'TESTING' → pas d'alerte
}

// Contexte enrichi passé à chaque évaluation de règle
interface EvalContext {
  tx: Transaction;
  customer: Customer;
  // Données agrégées chargées une seule fois pour toutes les règles
  recentTxCount: number;
  recentTxVolume: number;
  volumeVariation: number;  // % par rapport à la moyenne journalière
}

// ─── Évaluation des conditions JSON ──────────────────────────────────────────

type Condition =
  | { field: string; op: ">=" | "<=" | ">" | "<" | "==" | "!=" | "in" | "not_in"; value: unknown }
  | { logic: "AND" | "OR"; rules: Condition[] };

function getFieldValue(field: string, ctx: EvalContext): unknown {
  const { tx, customer } = ctx;
  switch (field) {
    // Transaction
    case "amount":               return Number(tx.amount);
    case "currency":             return tx.currency;
    case "channel":              return tx.channel;
    case "transactionType":      return tx.transactionType;
    case "counterpartyCountry":  return tx.counterpartyCountry;
    case "counterpartyBank":     return tx.counterpartyBank;
    // Customer
    case "customerType":         return customer.customerType;
    case "pepStatus":            return customer.pepStatus;
    case "riskLevel":            return customer.riskLevel;
    case "riskScore":            return customer.riskScore;
    case "kycStatus":            return customer.kycStatus;
    case "residenceCountry":     return customer.residenceCountry;
    case "nationality":          return customer.nationality;
    // Agrégés
    case "recentTxCount":        return ctx.recentTxCount;
    case "recentTxVolume":       return ctx.recentTxVolume;
    case "volumeVariation":      return ctx.volumeVariation;
    // Champs dérivés
    case "amountIsRound":        return Number(tx.amount) >= 5000 && Number(tx.amount) % 1000 === 0;
    case "isHighAmount":         return Number(tx.amount) >= 10000;
    default:
      log.warn({ field }, "Champ inconnu dans l'évaluation AML");
      return undefined;
  }
}

function evaluateCondition(cond: Condition, ctx: EvalContext): boolean {
  // Condition composée
  if ("logic" in cond) {
    if (cond.logic === "AND") return cond.rules.every((r) => evaluateCondition(r, ctx));
    if (cond.logic === "OR")  return cond.rules.some((r)  => evaluateCondition(r, ctx));
    return false;
  }

  const fieldVal = getFieldValue(cond.field, ctx);
  const threshold = cond.value;

  switch (cond.op) {
    case ">=":      return Number(fieldVal) >= Number(threshold);
    case "<=":      return Number(fieldVal) <= Number(threshold);
    case ">":       return Number(fieldVal) >  Number(threshold);
    case "<":       return Number(fieldVal) <  Number(threshold);
    case "==":      return fieldVal === threshold;
    case "!=":      return fieldVal !== threshold;
    case "in":      return Array.isArray(threshold) && threshold.includes(fieldVal);
    case "not_in":  return Array.isArray(threshold) && !threshold.includes(fieldVal);
    default:        return false;
  }
}

// ─── Chargement du contexte agrégé ───────────────────────────────────────────

async function buildContext(tx: Transaction, customer: Customer): Promise<EvalContext> {
  const windowH = 24;
  const since = new Date(tx.transactionDate.getTime() - windowH * 60 * 60 * 1000);
  const monthAgo = new Date(tx.transactionDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [recent, monthlyStats] = await Promise.all([
    findRecentByCustomer(tx.customerId, since),
    getVolumeStats(tx.customerId, monthAgo),
  ]);

  const recentTxCount  = recent.filter((t) => t.id !== tx.id).length + 1;
  const recentTxVolume = recent.reduce((s, t) => s + Number(t.amount), 0) + Number(tx.amount);

  const avgDaily       = monthlyStats.count >= 3 ? monthlyStats.totalAmount / 30 : 0;
  const volumeVariation = avgDaily > 0 ? Math.round((Number(tx.amount) / avgDaily) * 100) : 0;

  return { tx, customer, recentTxCount, recentTxVolume, volumeVariation };
}

// ─── Évaluation d'une règle ───────────────────────────────────────────────────

function evaluateRule(rule: AmlRule, ctx: EvalContext): DynamicRuleResult {
  // eslint-disable-next-line no-useless-assignment
  let triggered = false;
  let details: Record<string, unknown> = {};

  try {
    const conditions = rule.conditions as Condition;
    triggered = evaluateCondition(conditions, ctx);

    details = {
      amount:          Number(ctx.tx.amount),
      recentTxCount:   ctx.recentTxCount,
      recentTxVolume:  ctx.recentTxVolume,
      volumeVariation: ctx.volumeVariation,
      channel:         ctx.tx.channel,
      counterpartyCountry: ctx.tx.counterpartyCountry,
    };
  } catch (err) {
    log.error({ err, ruleId: rule.ruleId }, "Erreur évaluation règle AML");
    triggered = false;
  }

  return {
    triggered,
    rule,
    score:     triggered ? rule.baseScore : 0,
    reason:    triggered ? (rule.description ?? rule.name) : "",
    details,
    isTesting: rule.status === "TESTING",
  };
}

// ─── Orchestrateur principal ──────────────────────────────────────────────────

/**
 * Version publique de evaluateRule pour le backtesting.
 * Accepte un contexte simplifié sans nécessiter les objets Transaction/Customer complets.
 */
export function evaluateRuleForBacktest(
  rule: AmlRule,
  ctx: {
    tx: {
      id: number; amount: number; currency: string;
      transactionType: string; channel: string;
      counterparty?: string; counterpartyCountry?: string;
      counterpartyBank?: string; purpose?: string; riskScore: number;
    };
    customer: {
      riskScore: number; riskLevel: string; pepStatus: boolean;
      recentTxCount: number; recentTxVolume: number; volumeVariation: number;
    };
  }
): DynamicRuleResult {
  // Adapter le contexte simplifié au format EvalContext interne
  const evalCtx: EvalContext = {
    tx: ctx.tx as unknown as Transaction,
    customer: ctx.customer as unknown as Customer,
    recentTxCount:   ctx.customer.recentTxCount,
    recentTxVolume:  ctx.customer.recentTxVolume,
    volumeVariation: ctx.customer.volumeVariation,
  };
  return evaluateRule(rule, evalCtx);
}

export async function runDynamicAmlRules(
  tx: Transaction,
  customer: Customer
): Promise<DynamicRuleResult[]> {
  const t0 = Date.now();

  try {
    // Charger règles actives + testing
    const rules = await getAllExecutableRules();
    const executableRules = rules.filter(
      (r) => r.status === "ACTIVE" || r.status === "TESTING"
    );

    if (executableRules.length === 0) {
      log.warn("Aucune règle AML active — moteur dynamique ignoré");
      return [];
    }

    // Construire le contexte une seule fois (évite N requêtes)
    const ctx = await buildContext(tx, customer);

    // Évaluer toutes les règles
    const results = executableRules.map((rule) => evaluateRule(rule, ctx));
    const triggered = results.filter((r) => r.triggered);

    // Persister les exécutions (async, ne bloque pas)
    Promise.all(
      results.map((r) =>
        insertExecution({
          ruleId:        r.rule.id,
          transactionId: tx.id,
          customerId:    tx.customerId,
          triggered:     r.triggered,
          score:         r.score,
          details:       r.details,
          executionMs:   Date.now() - t0,
        })
      )
    ).catch((err) => log.error({ err }, "Erreur persistance exécutions AML"));

    // Règles déclenchées en mode réel (pas TESTING)
    const realTriggered = triggered.filter((r) => !r.isTesting);

    if (realTriggered.length === 0) {
      await updateTransaction(tx.id, { status: "COMPLETED", riskScore: 0 });
      return triggered; // retourner TESTING aussi pour monitoring
    }

    // Score global plafonné à 100
    const totalScore = Math.min(
      realTriggered.reduce((s, r) => s + r.score, 0),
      100
    );

    // Priorité maximale
    const priorityOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
    type Prio = keyof typeof priorityOrder;
    const maxPriority = realTriggered.reduce<Prio>(
      (max, r) => {
        const p = (r.rule.priority as Prio) in priorityOrder
          ? (r.rule.priority as Prio)
          : "LOW";
        return priorityOrder[p] > priorityOrder[max] ? p : max;
      },
      "LOW"
    );

    // Mettre à jour la transaction
    await updateTransaction(tx.id, {
      status:       "FLAGGED",
      isSuspicious: true,
      riskScore:    totalScore,
      flagReason:   realTriggered.map((r) => r.rule.name).join(", "),
      riskRules: realTriggered.map((r) => ({
        rule:  r.rule.ruleId,
        score: r.score,
        reason: r.reason,
      })) as unknown as null,
    });

    // Créer une alerte consolidée
    const alertType = realTriggered[0]?.rule.alertType ?? "THRESHOLD";
    await insertAlert({
      alertId:     `ALT-${nanoid(8).toUpperCase()}`,
      customerId:  tx.customerId,
      transactionId: tx.id,
      scenario:    realTriggered.map((r) => r.rule.name).join(" + "),
      alertType:   alertType as "PEP" | "THRESHOLD" | "PATTERN" | "VELOCITY" | "SANCTIONS" | "FRAUD" | "NETWORK",
      priority:    maxPriority,
      status:      "OPEN",
      riskScore:   totalScore,
      reason:      realTriggered.map((r) => r.reason).join(" | "),
      enrichmentData: {
        triggeredRules: realTriggered.map((r) => ({
          ruleId: r.rule.ruleId,
          name:   r.rule.name,
          score:  r.score,
          details: r.details,
        })),
        customer: {
          customerId: customer.customerId,
          riskLevel:  customer.riskLevel,
          pepStatus:  customer.pepStatus,
        },
        engineVersion: "dynamic-v2",
        executionMs: Date.now() - t0,
      } as unknown as null,
    });

    log.info(
      {
        txId:   tx.transactionId,
        rules:  realTriggered.map((r) => r.rule.ruleId),
        score:  totalScore,
        ms:     Date.now() - t0,
      },
      "Alerte AML dynamique créée"
    );

    return triggered;
  } catch (err) {
    log.error({ err, txId: tx.transactionId }, "Erreur moteur AML dynamique");
    return [];
  }
}

// ─── Seed des règles par défaut ───────────────────────────────────────────────
// Appelé lors du premier démarrage si la table est vide

export const DEFAULT_AML_RULES: Array<{
  name: string;
  description: string;
  category: "THRESHOLD" | "FREQUENCY" | "PATTERN" | "GEOGRAPHY" | "COUNTERPARTY" | "VELOCITY" | "CUSTOMER";
  status: "ACTIVE" | "INACTIVE" | "TESTING";
  conditions: Condition;
  baseScore: number;
  priority: string;
  alertType: string;
  thresholdValue?: string;
  windowMinutes?: number;
  countThreshold?: number;
}> = [
  {
    name: "Seuil réglementaire (10 000€)",
    description: "Transaction unique dépassant le seuil TRACFIN de 10 000€",
    category: "THRESHOLD",
    status: "ACTIVE",
    conditions: { field: "amount", op: ">=", value: 10000 },
    baseScore: 70,
    priority: "HIGH",
    alertType: "THRESHOLD",
    thresholdValue: "10000",
  },
  {
    name: "Seuil critique (20 000€)",
    description: "Transaction dépassant 20 000€ — priorité critique",
    category: "THRESHOLD",
    status: "ACTIVE",
    conditions: { field: "amount", op: ">=", value: 20000 },
    baseScore: 85,
    priority: "CRITICAL",
    alertType: "THRESHOLD",
    thresholdValue: "20000",
  },
  {
    name: "Pays à risque FATF",
    description: "Contrepartie dans un pays sous sanctions ou liste FATF noire",
    category: "GEOGRAPHY",
    status: "ACTIVE",
    conditions: {
      field: "counterpartyCountry",
      op: "in",
      value: ["KP", "IR", "MM", "BY", "RU", "SY", "YE", "AF", "LY", "SO", "CU", "VE"],
    },
    baseScore: 75,
    priority: "HIGH",
    alertType: "SANCTIONS",
  },
  {
    name: "Client PEP",
    description: "Transaction d'un client Personne Politiquement Exposée",
    category: "CUSTOMER",
    status: "ACTIVE",
    conditions: { field: "pepStatus", op: "==", value: true },
    baseScore: 55,
    priority: "HIGH",
    alertType: "PEP",
  },
  {
    name: "Haute fréquence (10 tx/24h)",
    description: "Plus de 10 transactions en 24 heures",
    category: "FREQUENCY",
    status: "ACTIVE",
    conditions: { field: "recentTxCount", op: ">=", value: 10 },
    baseScore: 50,
    priority: "MEDIUM",
    alertType: "VELOCITY",
    windowMinutes: 1440,
    countThreshold: 10,
  },
  {
    name: "Pic de volume (300% moyenne)",
    description: "Volume journalier 3x supérieur à la moyenne sur 30 jours",
    category: "VELOCITY",
    status: "ACTIVE",
    conditions: { field: "volumeVariation", op: ">=", value: 300 },
    baseScore: 45,
    priority: "MEDIUM",
    alertType: "VELOCITY",
  },
  {
    name: "Montant rond suspect",
    description: "Montant rond ≥ 5 000€ — indicateur de transactions fictives",
    category: "PATTERN",
    status: "ACTIVE",
    conditions: { field: "amountIsRound", op: "==", value: true },
    baseScore: 20,
    priority: "LOW",
    alertType: "PATTERN",
  },
  {
    name: "Canal inhabituel (ATM/API) + montant élevé",
    description: "Montant ≥ 5 000€ via canal ATM ou API",
    category: "PATTERN",
    status: "ACTIVE",
    conditions: {
      logic: "AND",
      rules: [
        { field: "channel",  op: "in",  value: ["ATM", "API"] },
        { field: "amount",   op: ">=",  value: 5000 },
      ],
    },
    baseScore: 35,
    priority: "MEDIUM",
    alertType: "PATTERN",
    thresholdValue: "5000",
  },
  {
    name: "Structuring potentiel — volume 24h",
    description: "Volume cumulé > 10 000€ sur 24h via plusieurs transactions",
    category: "PATTERN",
    status: "ACTIVE",
    conditions: {
      logic: "AND",
      rules: [
        { field: "recentTxVolume", op: ">=", value: 10000 },
        { field: "recentTxCount",  op: ">=", value: 3 },
      ],
    },
    baseScore: 70,
    priority: "HIGH",
    alertType: "PATTERN",
    windowMinutes: 1440,
  },
  {
    name: "PEP + montant élevé (combiné)",
    description: "Client PEP avec transaction ≥ 5 000€ — surveillance renforcée",
    category: "CUSTOMER",
    status: "ACTIVE",
    conditions: {
      logic: "AND",
      rules: [
        { field: "pepStatus", op: "==", value: true },
        { field: "amount",    op: ">=", value: 5000 },
      ],
    },
    baseScore: 80,
    priority: "CRITICAL",
    alertType: "PEP",
    thresholdValue: "5000",
  },
];
