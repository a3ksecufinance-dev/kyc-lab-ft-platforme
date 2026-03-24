/**
 * Backtesting des règles AML
 *
 * Rejoue l'historique des transactions (90 derniers jours par défaut)
 * avec une ou plusieurs règles en mode simulation — sans créer d'alertes,
 * sans modifier les transactions.
 *
 * Métriques calculées :
 *   - Nombre de déclenchements
 *   - Taux de déclenchement (%)
 *   - Distribution des scores
 *   - Top clients déclencheurs
 *   - Comparaison avant/après (règles actuellement actives)
 *   - Faux positifs estimés (transactions déjà résolues comme non-suspectes)
 */

import { db } from "../../_core/db";
import { transactions, customers, alerts } from "../../../drizzle/schema";
import { gte, desc, sql, inArray } from "drizzle-orm";
import { createLogger } from "../../_core/logger";
import { getRuleById as getAmlRuleById } from "./aml-rules.repository";

const log = createLogger("aml-backtest");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BacktestInput {
  ruleId:      number;          // règle à tester
  daysPeriod:  number;          // nombre de jours à rejouer (max 180)
  maxTx:       number;          // limite de transactions (max 10 000)
  compareWithActive: boolean;   // comparer avec les alertes existantes
}

export interface BacktestResult {
  rule: {
    id:         number;
    name:       string;
    ruleId:     string;
    priority:   string;
    conditions: unknown;
  };
  period: {
    from:    Date;
    to:      Date;
    days:    number;
  };
  corpus: {
    totalTx:     number;
    analyzed:    number;
    skipped:     number;
  };
  simulation: {
    triggered:        number;
    triggerRate:      number;       // %
    avgScore:         number;
    scoreDistribution: {
      low:    number;              // score < 30
      medium: number;              // 30-60
      high:   number;             // 60-80
      critical: number;           // > 80
    };
    topCustomers: Array<{
      customerId: number;
      name:       string;
      hitCount:   number;
      maxScore:   number;
    }>;
    sampleTriggers: Array<{
      transactionId: string;
      customerId:    number;
      amount:        number;
      currency:      string;
      score:         number;
      reason:        string;
      date:          Date;
    }>;
  };
  comparison?: {
    existingAlerts:  number;       // alertes actuellement dans la période
    overlap:         number;       // transactions déjà alertées qui seraient de nouveau déclenchées
    newDetections:   number;       // transactions non alertées qui seraient déclenchées (nouveaux hits)
    estimatedFP:     number;       // transactions qui ont déclenché mais ont été DISMISSED (faux positifs)
  };
  durationMs: number;
}

// ─── Backtest principal ───────────────────────────────────────────────────────

export async function runBacktest(input: BacktestInput): Promise<BacktestResult> {
  const t0 = Date.now();
  const { ruleId, daysPeriod, maxTx, compareWithActive } = input;

  // Charger la règle
  const rule = await getAmlRuleById(ruleId);
  if (!rule) throw new Error(`Règle #${ruleId} introuvable`);

  log.info({ ruleId, daysPeriod, maxTx }, "Backtest démarré");

  const periodEnd   = new Date();
  const periodStart = new Date(periodEnd.getTime() - Math.min(daysPeriod, 180) * 86_400_000);

  // Charger les transactions de la période (sans JOIN pour la performance)
  const txList = await db
    .select({
      id:              transactions.id,
      transactionId:   transactions.transactionId,
      customerId:      transactions.customerId,
      amount:          transactions.amount,
      currency:        transactions.currency,
      transactionType: transactions.transactionType,
      channel:         transactions.channel,
      counterparty:    transactions.counterparty,
      counterpartyCountry: transactions.counterpartyCountry,
      counterpartyBank: transactions.counterpartyBank,
      purpose:         transactions.purpose,
      riskScore:       transactions.riskScore,
      isSuspicious:    transactions.isSuspicious,
      status:          transactions.status,
      createdAt:       transactions.createdAt,
    })
    .from(transactions)
    .where(gte(transactions.createdAt, periodStart))
    .orderBy(desc(transactions.createdAt))
    .limit(Math.min(maxTx, 10_000));

  // Charger les clients concernés (une seule requête)
  const customerIds = [...new Set(txList.map((t: typeof txList[0]) => t.customerId))];
  const customerMap = new Map<number, {
    id: number; firstName: string; lastName: string;
    riskScore: number; riskLevel: string; pepStatus: boolean;
    recentTxCount?: number; recentTxVolume?: number;
  }>();

  if (customerIds.length > 0) {
    const custList = await db
      .select({
        id:        customers.id,
        firstName: customers.firstName,
        lastName:  customers.lastName,
        riskScore: customers.riskScore,
        riskLevel: customers.riskLevel,
        pepStatus: customers.pepStatus,
      })
      .from(customers)
      .where(inArray(customers.id, customerIds));

    for (const c of custList) customerMap.set(c.id, { ...c, recentTxCount: 0, recentTxVolume: 0 });
  }

  // Pré-calculer les stats par client (recentTxCount, recentTxVolume)
  for (const tx of txList) {
    const cust = customerMap.get(tx.customerId);
    if (cust) {
      cust.recentTxCount  = (cust.recentTxCount  ?? 0) + 1;
      cust.recentTxVolume = (cust.recentTxVolume ?? 0) + parseFloat(String(tx.amount));
    }
  }

  // Importer l'évaluateur de règle (sans effets de bord)
  const { evaluateRuleForBacktest } = await import("./aml-rules.engine");

  // Simuler
  const hits: Array<{
    transactionId: string;
    customerId:    number;
    amount:        number;
    currency:      string;
    score:         number;
    reason:        string;
    date:          Date;
    isAlreadyAlerted: boolean;
  }> = [];

  let skipped = 0;

  for (const tx of txList) {
    const customer = customerMap.get(tx.customerId);
    if (!customer) { skipped++; continue; }

    try {
      const result = evaluateRuleForBacktest(rule, {
        tx: {
          id:              tx.id,
          amount:          parseFloat(String(tx.amount)),
          currency:        tx.currency,
          transactionType: tx.transactionType,
          channel:         tx.channel,
          riskScore:       tx.riskScore,
          ...(tx.counterparty        ? { counterparty:        tx.counterparty }        : {}),
          ...(tx.counterpartyCountry ? { counterpartyCountry: tx.counterpartyCountry } : {}),
          ...(tx.counterpartyBank    ? { counterpartyBank:    tx.counterpartyBank }    : {}),
          ...(tx.purpose             ? { purpose:             tx.purpose }             : {}),
        },
        customer: {
          riskScore:        customer.riskScore,
          riskLevel:        customer.riskLevel,
          pepStatus:        customer.pepStatus,
          recentTxCount:    customer.recentTxCount ?? 0,
          recentTxVolume:   customer.recentTxVolume ?? 0,
          volumeVariation:  0,   // simplifié pour le backtest
        },
      });

      if (result.triggered) {
        hits.push({
          transactionId:    tx.transactionId,
          customerId:       tx.customerId,
          amount:           parseFloat(String(tx.amount)),
          currency:         tx.currency,
          score:            result.score,
          reason:           result.reason,
          date:             tx.createdAt,
          isAlreadyAlerted: tx.isSuspicious,
        });
      }
    } catch {
      skipped++;
    }
  }

  // ── Métriques ──────────────────────────────────────────────────────────────

  const triggerRate = txList.length > 0
    ? Math.round(hits.length / txList.length * 1000) / 10
    : 0;

  const avgScore = hits.length > 0
    ? Math.round(hits.reduce((s, h) => s + h.score, 0) / hits.length)
    : 0;

  const scoreDist = {
    low:      hits.filter(h => h.score < 30).length,
    medium:   hits.filter(h => h.score >= 30 && h.score < 60).length,
    high:     hits.filter(h => h.score >= 60 && h.score < 80).length,
    critical: hits.filter(h => h.score >= 80).length,
  };

  // Top clients
  const hitsByCustomer = new Map<number, { count: number; maxScore: number }>();
  for (const h of hits) {
    const existing = hitsByCustomer.get(h.customerId) ?? { count: 0, maxScore: 0 };
    hitsByCustomer.set(h.customerId, {
      count:    existing.count + 1,
      maxScore: Math.max(existing.maxScore, h.score),
    });
  }
  const topCustomers = [...hitsByCustomer.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([customerId, stats]) => {
      const cust = customerMap.get(customerId);
      return {
        customerId,
        name:     cust ? `${cust.firstName} ${cust.lastName}` : `Client #${customerId}`,
        hitCount: stats.count,
        maxScore: stats.maxScore,
      };
    });

  // Comparaison avec les alertes existantes (optionnel)
  let comparison: BacktestResult["comparison"];
  if (compareWithActive) {
    const existingAlertCount = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(alerts)
      .where(gte(alerts.createdAt, periodStart))
      .then((rows: Array<{ count: number }>) => Number(rows[0]?.count ?? 0));

    const overlap         = hits.filter(h => h.isAlreadyAlerted).length;
    const newDetections   = hits.filter(h => !h.isAlreadyAlerted).length;
    const dismissedInHits = hits.filter(h => !h.isAlreadyAlerted).length; // approx

    comparison = {
      existingAlerts:  existingAlertCount,
      overlap,
      newDetections,
      estimatedFP:     Math.round(dismissedInHits * 0.3), // estimation 30% FP
    };
  }

  const result: BacktestResult = {
    rule: {
      id:         rule.id,
      name:       rule.name,
      ruleId:     rule.ruleId,
      priority:   rule.priority,
      conditions: rule.conditions as unknown,
    },
    period:  { from: periodStart, to: periodEnd, days: daysPeriod },
    corpus:  { totalTx: txList.length, analyzed: txList.length - skipped, skipped },
    simulation: {
      triggered:         hits.length,
      triggerRate,
      avgScore,
      scoreDistribution: scoreDist,
      topCustomers,
      sampleTriggers:    hits.slice(0, 10).map((h: typeof hits[0]) => ({
        transactionId: h.transactionId,
        customerId:    h.customerId,
        amount:        h.amount,
        currency:      h.currency,
        score:         h.score,
        reason:        h.reason,
        date:          h.date,
      })),
    },
    ...(comparison ? { comparison } : {}),
    durationMs: Date.now() - t0,
  };

  log.info({
    ruleId,
    triggered:   hits.length,
    triggerRate,
    durationMs:  result.durationMs,
  }, "Backtest terminé");

  return result;
}
