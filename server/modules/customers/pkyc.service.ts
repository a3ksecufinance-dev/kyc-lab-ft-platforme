/**
 * Perpetual KYC (pKYC) — Score de dérive comportementale nuitière
 *
 * Compare la fenêtre récente (7j par défaut) vs la baseline (30j précédents)
 * pour chaque client actif. Si le score de dérive dépasse le seuil configuré,
 * déclenche automatiquement :
 *   - Une mise à jour de nextReviewDate sur le client
 *   - Une alerte de type PATTERN avec scénario "PKYC_DRIFT"
 *   - Un snapshot dans la table pkyc_snapshots
 */

import { eq, desc, gte, lte, and, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db }           from "../../_core/db";
import { createLogger } from "../../_core/logger";
import { ENV }          from "../../_core/env";
import {
  customers, transactions, alerts, pkycSnapshots,
  type Customer,
} from "../../../drizzle/schema";

const log = createLogger("pkyc");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DriftFactors {
  volumeDrift:      number;   // 0-100 : variation du volume total
  frequencyDrift:   number;   // 0-100 : variation du nombre de transactions
  geoDrift:         number;   // 0-100 : nouveaux pays de contrepartie
  amountSpike:      number;   // 0-100 : pic sur transaction unique
  newCounterparties: number;  // 0-100 : part de nouvelles contreparties
  newCountries:     string[]; // pays apparus dans la fenêtre récente
}

export interface DriftResult {
  customerId:  number;
  driftScore:  number;
  factors:     DriftFactors;
  reviewTriggered: boolean;
}

// ─── Calcul du score de dérive ────────────────────────────────────────────────

export async function computeCustomerDrift(
  customerId: number,
  now:        Date,
  baselineDays = ENV.PKYC_BASELINE_DAYS,
  windowDays   = ENV.PKYC_WINDOW_DAYS,
): Promise<{ driftScore: number; factors: DriftFactors }> {

  const windowEnd   = now;
  const windowStart = new Date(now.getTime() - windowDays   * 86_400_000);
  const baselineEnd = windowStart;
  const baselineStart = new Date(windowStart.getTime() - baselineDays * 86_400_000);

  const [recentTxs, baselineTxs] = await Promise.all([
    db.select().from(transactions).where(and(
      eq(transactions.customerId, customerId),
      gte(transactions.transactionDate, windowStart),
      lte(transactions.transactionDate, windowEnd),
    )),
    db.select().from(transactions).where(and(
      eq(transactions.customerId, customerId),
      gte(transactions.transactionDate, baselineStart),
      lte(transactions.transactionDate, baselineEnd),
    )),
  ]);

  // ── Volumes — normalise la baseline sur la même durée que la fenêtre récente
  const recentVol   = recentTxs.reduce((s, t) => s + parseFloat(t.amount), 0);
  const baselineVol = (baselineTxs.reduce((s, t) => s + parseFloat(t.amount), 0)
    / baselineDays) * windowDays;

  let volumeDrift = 0;
  if (baselineVol > 1) {
    volumeDrift = Math.min(100, Math.abs((recentVol - baselineVol) / baselineVol) * 100);
  } else if (recentVol > 0) {
    volumeDrift = 60; // activité là où il n'y en avait pas
  }

  // ── Fréquence
  const recentCount   = recentTxs.length;
  const baselineCount = (baselineTxs.length / baselineDays) * windowDays;

  let frequencyDrift = 0;
  if (baselineCount > 0.1) {
    frequencyDrift = Math.min(100, Math.abs((recentCount - baselineCount) / baselineCount) * 100);
  } else if (recentCount > 0) {
    frequencyDrift = 60;
  }

  // ── Dérive géographique — nouveaux pays de contrepartie
  const baselineCountries = new Set(
    baselineTxs.map(t => t.counterpartyCountry).filter((c): c is string => !!c)
  );
  const recentCountriesSet = new Set(
    recentTxs.map(t => t.counterpartyCountry).filter((c): c is string => !!c)
  );
  const newCountries: string[] = [];
  for (const c of recentCountriesSet) {
    if (!baselineCountries.has(c)) newCountries.push(c);
  }
  const geoDrift = Math.min(100, newCountries.length * 30);

  // ── Pic de montant — max récent vs max baseline
  const baselineMax = baselineTxs.length > 0
    ? Math.max(...baselineTxs.map(t => parseFloat(t.amount))) : 0;
  const recentMax = recentTxs.length > 0
    ? Math.max(...recentTxs.map(t => parseFloat(t.amount))) : 0;

  let amountSpike = 0;
  if (baselineMax > 0 && recentMax > 0) {
    const ratio = recentMax / baselineMax;
    if      (ratio >= 10) amountSpike = 100;
    else if (ratio >= 5)  amountSpike = 80;
    else if (ratio >= 3)  amountSpike = 50;
    else if (ratio >= 2)  amountSpike = 25;
  }

  // ── Nouvelles contreparties
  const baselineCps = new Set(
    baselineTxs.map(t => t.counterparty).filter((c): c is string => !!c)
  );
  const recentCps = new Set(
    recentTxs.map(t => t.counterparty).filter((c): c is string => !!c)
  );
  let newCpCount = 0;
  for (const cp of recentCps) { if (!baselineCps.has(cp)) newCpCount++; }
  const newCounterparties = recentCps.size > 0
    ? Math.min(100, (newCpCount / recentCps.size) * 100) : 0;

  const factors: DriftFactors = {
    volumeDrift:      Math.round(volumeDrift),
    frequencyDrift:   Math.round(frequencyDrift),
    geoDrift:         Math.round(geoDrift),
    amountSpike:      Math.round(amountSpike),
    newCounterparties: Math.round(newCounterparties),
    newCountries,
  };

  // Pondération finale
  const driftScore = Math.round(
    volumeDrift       * 0.25 +
    frequencyDrift    * 0.20 +
    geoDrift          * 0.30 +
    amountSpike       * 0.15 +
    newCounterparties * 0.10,
  );

  return { driftScore, factors };
}

// ─── Déclenchement d'une revue KYC ───────────────────────────────────────────

async function triggerKycReview(
  customer:    Customer,
  driftScore:  number,
  factors:     DriftFactors,
): Promise<void> {
  const now = new Date();

  // Mettre à jour la date de prochaine revue sur le client
  await db.update(customers)
    .set({ nextReviewDate: now, updatedAt: now })
    .where(eq(customers.id, customer.id));

  // Créer une alerte PATTERN de priorité adaptée
  const priority = driftScore >= 80 ? "CRITICAL"
    : driftScore >= 60 ? "HIGH"
    : driftScore >= 40 ? "MEDIUM" : "LOW";

  const reason = [
    driftScore >= 40 ? `Score de dérive comportementale : ${driftScore}/100` : null,
    factors.newCountries.length > 0 ? `Nouveaux pays : ${factors.newCountries.join(", ")}` : null,
    factors.volumeDrift >= 50   ? `Volume +${Math.round(factors.volumeDrift)}%` : null,
    factors.frequencyDrift >= 50 ? `Fréquence +${Math.round(factors.frequencyDrift)}%` : null,
    factors.amountSpike >= 50   ? `Pic de montant détecté` : null,
  ].filter(Boolean).join(" — ");

  await db.insert(alerts).values({
    alertId:        `PKYC-${nanoid(8).toUpperCase()}`,
    customerId:     customer.id,
    scenario:       "PKYC_DRIFT",
    alertType:      "PATTERN",
    priority:       priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    status:         "OPEN",
    riskScore:      driftScore,
    reason,
    enrichmentData: { driftScore, factors },
    createdAt:      now,
    updatedAt:      now,
  });
}

// ─── Run complet pour un client ───────────────────────────────────────────────

export async function runPkycForCustomer(
  customer: Customer,
  now: Date,
): Promise<DriftResult> {
  const threshold   = ENV.PKYC_DRIFT_THRESHOLD;
  const baselineDays = ENV.PKYC_BASELINE_DAYS;
  const windowDays   = ENV.PKYC_WINDOW_DAYS;

  const { driftScore, factors } = await computeCustomerDrift(
    customer.id, now, baselineDays, windowDays,
  );

  const reviewTriggered = driftScore >= threshold;

  // Persister le snapshot
  await db.insert(pkycSnapshots).values({
    customerId:      customer.id,
    snapshotDate:    now,
    driftScore,
    driftFactors:    factors,
    reviewTriggered,
    baselineDays,
    windowDays,
  });

  if (reviewTriggered) {
    await triggerKycReview(customer, driftScore, factors);
    log.info(
      { customerId: customer.id, driftScore, factors },
      "pKYC : revue KYC déclenchée",
    );
  }

  return { customerId: customer.id, driftScore, factors, reviewTriggered };
}

// ─── Run nuitier sur tous les clients actifs ──────────────────────────────────

export async function runPkycNightly(): Promise<{
  processed: number;
  triggered: number;
  errors:    number;
  durationMs: number;
}> {
  const start = Date.now();
  const now   = new Date();

  // Tous les clients actifs (KYC approuvé, non effacés)
  const activeCustomers = await db.select().from(customers)
    .where(ne(customers.kycStatus, "EXPIRED"));

  let processed = 0;
  let triggered = 0;
  let errors    = 0;

  log.info({ count: activeCustomers.length }, "pKYC nuitier démarré");

  for (const customer of activeCustomers) {
    try {
      const result = await runPkycForCustomer(customer, now);
      processed++;
      if (result.reviewTriggered) triggered++;
    } catch (err) {
      errors++;
      log.error({ customerId: customer.id, err }, "pKYC : erreur client");
    }
  }

  const durationMs = Date.now() - start;
  log.info({ processed, triggered, errors, durationMs }, "pKYC nuitier terminé");

  return { processed, triggered, errors, durationMs };
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export async function getPkycDashboardStats() {
  const since30d = new Date(Date.now() - 30 * 86_400_000);
  const since7d  = new Date(Date.now() -  7 * 86_400_000);

  // Dernier snapshot par client — pour connaître le drift actuel
  const latestSnapshotsRaw = await db
    .selectDistinctOn([pkycSnapshots.customerId], {
      customerId:  pkycSnapshots.customerId,
      driftScore:  pkycSnapshots.driftScore,
      snapshotDate: pkycSnapshots.snapshotDate,
      reviewTriggered: pkycSnapshots.reviewTriggered,
    })
    .from(pkycSnapshots)
    .orderBy(pkycSnapshots.customerId, desc(pkycSnapshots.snapshotDate));

  const triggered30d = await db.select({ n: pkycSnapshots.id })
    .from(pkycSnapshots)
    .where(and(
      eq(pkycSnapshots.reviewTriggered, true),
      gte(pkycSnapshots.snapshotDate, since30d),
    ));

  const triggered7d = await db.select({ n: pkycSnapshots.id })
    .from(pkycSnapshots)
    .where(and(
      eq(pkycSnapshots.reviewTriggered, true),
      gte(pkycSnapshots.snapshotDate, since7d),
    ));

  const scores = latestSnapshotsRaw.map(s => s.driftScore);
  const avgDrift = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const highDrift = latestSnapshotsRaw
    .filter(s => s.driftScore >= ENV.PKYC_DRIFT_THRESHOLD)
    .length;

  return {
    monitored:      latestSnapshotsRaw.length,
    avgDrift,
    highDrift,
    triggered30d:   triggered30d.length,
    triggered7d:    triggered7d.length,
    threshold:      ENV.PKYC_DRIFT_THRESHOLD,
  };
}

export async function getPkycQueue(page: number, limit: number) {
  const offset = (page - 1) * limit;
  const threshold = ENV.PKYC_DRIFT_THRESHOLD;

  // Derniers snapshots avec score >= threshold, joints aux clients
  const rows = await db
    .selectDistinctOn([pkycSnapshots.customerId], {
      snapshotId:   pkycSnapshots.id,
      customerId:   pkycSnapshots.customerId,
      driftScore:   pkycSnapshots.driftScore,
      driftFactors: pkycSnapshots.driftFactors,
      snapshotDate: pkycSnapshots.snapshotDate,
      reviewTriggered: pkycSnapshots.reviewTriggered,
      firstName:    customers.firstName,
      lastName:     customers.lastName,
      riskLevel:    customers.riskLevel,
      kycStatus:    customers.kycStatus,
      nextReviewDate: customers.nextReviewDate,
    })
    .from(pkycSnapshots)
    .innerJoin(customers, eq(pkycSnapshots.customerId, customers.id))
    .where(gte(pkycSnapshots.driftScore, threshold))
    .orderBy(pkycSnapshots.customerId, desc(pkycSnapshots.snapshotDate));

  // Sort by driftScore descending after dedup
  rows.sort((a, b) => b.driftScore - a.driftScore);

  const total = rows.length;
  const data  = rows.slice(offset, offset + limit);

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getCustomerDriftHistory(customerId: number, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  return db.select()
    .from(pkycSnapshots)
    .where(and(
      eq(pkycSnapshots.customerId, customerId),
      gte(pkycSnapshots.snapshotDate, since),
    ))
    .orderBy(desc(pkycSnapshots.snapshotDate))
    .limit(days);
}
