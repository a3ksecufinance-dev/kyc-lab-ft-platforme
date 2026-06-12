/**
 * Wallets Service — MICROFINANCE / PAYMENT_INSTITUTION uniquement
 *
 * Actif uniquement si getInstitutionFlags().wallets === true.
 * Ce fichier peut être importé librement — la garde est dans le router.
 */

import { eq, and, desc, count, sum, gte, lte, between } from "drizzle-orm";
import { db } from "../../_core/db";
import { wallets, transactions, kycTierSnapshots, alerts, customers } from "../../../drizzle/schema";
import { updateWalletTier } from "../customers/kyc-tier.service";
import { requireCustomer } from "../customers/customers.repository";
import type { KycTier } from "../../../shared/institution.types";
import { nanoid } from "nanoid";

// ─── Limites BAM par tier (MAD) ───────────────────────────────────────────────
const TIER_LIMITS: Record<KycTier, { daily: number; monthly: number }> = {
  ALLEGED:  { daily:     5_000, monthly:    20_000 },
  STANDARD: { daily:    50_000, monthly:   200_000 },
  RENFORCE: { daily:   500_000, monthly: 2_000_000 },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListWalletsInput {
  page:      number;
  limit:     number;
  customerId?: number;
  provider?:   string;
  kycTier?:   KycTier;
  isDormant?: boolean;
}

export interface CreateWalletInput {
  customerId:   number;
  provider?:    string;
  phoneNumber?: string;
  msisdn?:      string;
  currency?:    string;
  kycTier?:     KycTier;
}

// ─── Requêtes ─────────────────────────────────────────────────────────────────

export async function listWallets(input: ListWalletsInput) {
  const offset = (input.page - 1) * input.limit;
  const conditions = [];

  if (input.customerId !== undefined) conditions.push(eq(wallets.customerId, input.customerId));
  if (input.provider   !== undefined) conditions.push(eq(wallets.provider,   input.provider));
  if (input.kycTier    !== undefined) conditions.push(eq(wallets.kycTier,    input.kycTier));
  if (input.isDormant  !== undefined) conditions.push(eq(wallets.isDormant,  input.isDormant));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select().from(wallets).where(where).orderBy(desc(wallets.createdAt)).limit(input.limit).offset(offset),
    db.select({ total: count() }).from(wallets).where(where),
  ]);

  return {
    data,
    total:      Number(countResult[0]?.total ?? 0),
    page:       input.page,
    limit:      input.limit,
    totalPages: Math.ceil(Number(countResult[0]?.total ?? 0) / input.limit),
  };
}

export async function getWalletById(id: number) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id)).limit(1);
  return wallet ?? null;
}

export async function getWalletsByCustomer(customerId: number) {
  return db.select().from(wallets).where(eq(wallets.customerId, customerId)).orderBy(desc(wallets.createdAt));
}

// ─── Création ─────────────────────────────────────────────────────────────────

export async function createWallet(input: CreateWalletInput) {
  await requireCustomer(input.customerId);

  const walletId = `WAL-${nanoid(10).toUpperCase()}`;

  const [wallet] = await db.insert(wallets).values({
    walletId,
    customerId:  input.customerId,
    provider:    input.provider   ?? "INTERNAL",
    phoneNumber: input.phoneNumber ?? null,
    msisdn:      input.msisdn      ?? null,
    currency:    input.currency    ?? "MAD",
    kycTier:     input.kycTier     ?? "ALLEGED",
    balance:     "0",
    isActive:    true,
    isDormant:   false,
  }).returning();

  if (!wallet) throw new Error("Échec création wallet");
  return wallet;
}

// ─── Mise à jour tier ─────────────────────────────────────────────────────────

export async function promoteWalletTier(params: {
  walletId:   number;
  customerId: number;
  newTier:    KycTier;
  reason:     string;
  userId?:    number;
}) {
  await updateWalletTier({
    walletId:   params.walletId,
    customerId: params.customerId,
    newTier:    params.newTier,
    reason:     params.reason,
    ...(params.userId !== undefined && { triggeredBy: params.userId }),
  });

  const [updated] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.id, params.walletId))
    .limit(1);

  return updated ?? null;
}

// ─── Historique des tiers ─────────────────────────────────────────────────────

export async function getKycTierHistory(walletId: number) {
  return db
    .select()
    .from(kycTierSnapshots)
    .where(eq(kycTierSnapshots.walletId, walletId))
    .orderBy(desc(kycTierSnapshots.createdAt));
}

// ─── Réactivation wallet dormant ──────────────────────────────────────────────

export async function reactivateWallet(walletId: number) {
  const [updated] = await db
    .update(wallets)
    .set({
      isDormant:     false,
      reactivatedAt: new Date(),
      updatedAt:     new Date(),
    })
    .where(eq(wallets.id, walletId))
    .returning();

  if (!updated) throw new Error(`Wallet ${walletId} introuvable`);
  return updated;
}

// ─── Transactions du wallet ───────────────────────────────────────────────────

export async function getWalletTransactions(walletId: number, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const [data, countResult] = await Promise.all([
    db.select().from(transactions)
      .where(eq(transactions.walletId, walletId))
      .orderBy(desc(transactions.transactionDate))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(transactions)
      .where(eq(transactions.walletId, walletId)),
  ]);
  return {
    data,
    total:      Number(countResult[0]?.total ?? 0),
    page,
    limit,
    totalPages: Math.ceil(Number(countResult[0]?.total ?? 0) / limit),
  };
}

// ─── Utilisation vs limites de tier ──────────────────────────────────────────

export async function getWalletUsage(walletId: number) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, walletId)).limit(1);
  if (!wallet) throw new Error(`Wallet ${walletId} introuvable`);

  const now   = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [daily, monthly] = await Promise.all([
    db.select({ total: sum(transactions.amount) })
      .from(transactions)
      .where(and(
        eq(transactions.walletId, walletId),
        gte(transactions.transactionDate, dayStart),
      )),
    db.select({ total: sum(transactions.amount) })
      .from(transactions)
      .where(and(
        eq(transactions.walletId, walletId),
        gte(transactions.transactionDate, monthStart),
      )),
  ]);

  const tier = (wallet.kycTier ?? "ALLEGED") as KycTier;
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.ALLEGED;
  const dailyUsed   = Number(daily[0]?.total   ?? 0);
  const monthlyUsed = Number(monthly[0]?.total ?? 0);

  // Utiliser les limites personnalisées si définies sur le wallet
  const dailyLimit   = wallet.dailyLimit   ? Number(wallet.dailyLimit)   : limits.daily;
  const monthlyLimit = wallet.monthlyLimit ? Number(wallet.monthlyLimit) : limits.monthly;

  return {
    tier,
    dailyUsed,   dailyLimit,   dailyPct:   Math.min(100, Math.round(dailyUsed   / dailyLimit   * 100)),
    monthlyUsed, monthlyLimit, monthlyPct: Math.min(100, Math.round(monthlyUsed / monthlyLimit * 100)),
    balance: Number(wallet.balance),
    currency: wallet.currency,
  };
}

// ─── Suspension / Réactivation ────────────────────────────────────────────────

export async function suspendWallet(walletId: number, _reason: string, _userId?: number) {
  const [updated] = await db
    .update(wallets)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(wallets.id, walletId))
    .returning();
  if (!updated) throw new Error(`Wallet ${walletId} introuvable`);
  return updated;
}

export async function unsuspendWallet(walletId: number) {
  const [updated] = await db
    .update(wallets)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(wallets.id, walletId))
    .returning();
  if (!updated) throw new Error(`Wallet ${walletId} introuvable`);
  return updated;
}

// ─── Gel réglementaire (freeze) ──────────────────────────────────────────────
// Distinct de la suspension : le gel est un acte réglementaire tracé avec
// motif, auteur, et horodatage. Un wallet gelé ne peut PAS effectuer de
// transactions — la vérification se fait dans checkWalletLimits().

export async function freezeWallet(walletId: number, reason: string, userId: number) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, walletId)).limit(1);
  if (!wallet) throw new Error(`Wallet ${walletId} introuvable`);
  if (wallet.frozenAt) throw new Error(`Wallet ${walletId} est déjà gelé`);

  const [updated] = await db.update(wallets).set({
    frozenAt: new Date(),
    frozenReason: reason,
    frozenBy: userId,
    updatedAt: new Date(),
  }).where(eq(wallets.id, walletId)).returning();

  return updated!;
}

export async function unfreezeWallet(walletId: number) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, walletId)).limit(1);
  if (!wallet) throw new Error(`Wallet ${walletId} introuvable`);
  if (!wallet.frozenAt) throw new Error(`Wallet ${walletId} n'est pas gelé`);

  const [updated] = await db.update(wallets).set({
    frozenAt: null,
    frozenReason: null,
    frozenBy: null,
    updatedAt: new Date(),
  }).where(eq(wallets.id, walletId)).returning();

  return updated!;
}

// ─── Enforcement temps réel des limites ──────────────────────────────────────
// Vérifie si une transaction d'un montant donné peut passer sur ce wallet.
// Retourne { allowed, reasons[] } — appelé AVANT d'exécuter la transaction.

export async function checkWalletLimits(walletId: number, amount: number) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, walletId)).limit(1);
  if (!wallet) throw new Error(`Wallet ${walletId} introuvable`);

  const reasons: string[] = [];

  // Check 1: Wallet gelé
  if (wallet.frozenAt) {
    reasons.push(`Wallet gelé depuis ${wallet.frozenAt.toISOString().slice(0, 10)} — ${wallet.frozenReason ?? "motif non précisé"}`);
  }

  // Check 2: Wallet suspendu
  if (!wallet.isActive) {
    reasons.push("Wallet suspendu");
  }

  // Check 3: Limites de tier
  const tier = (wallet.kycTier ?? "ALLEGED") as KycTier;
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.ALLEGED;
  const dailyLimit = wallet.dailyLimit ? Number(wallet.dailyLimit) : limits.daily;
  const monthlyLimit = wallet.monthlyLimit ? Number(wallet.monthlyLimit) : limits.monthly;

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [dailyUsage, monthlyUsage] = await Promise.all([
    db.select({ total: sum(transactions.amount) }).from(transactions)
      .where(and(eq(transactions.walletId, walletId), gte(transactions.transactionDate, dayStart))),
    db.select({ total: sum(transactions.amount) }).from(transactions)
      .where(and(eq(transactions.walletId, walletId), gte(transactions.transactionDate, monthStart))),
  ]);

  const dailyUsed = Number(dailyUsage[0]?.total ?? 0);
  const monthlyUsed = Number(monthlyUsage[0]?.total ?? 0);

  if (dailyUsed + amount > dailyLimit) {
    reasons.push(`Plafond journalier dépassé : ${dailyUsed + amount} / ${dailyLimit} ${wallet.currency} (tier ${tier})`);
  }
  if (monthlyUsed + amount > monthlyLimit) {
    reasons.push(`Plafond mensuel dépassé : ${monthlyUsed + amount} / ${monthlyLimit} ${wallet.currency} (tier ${tier})`);
  }

  // Check 4: Transaction unitaire > plafond journalier
  if (amount > dailyLimit) {
    reasons.push(`Montant unitaire (${amount}) supérieur au plafond journalier (${dailyLimit})`);
  }

  return {
    allowed: reasons.length === 0,
    walletId,
    amount,
    currency: wallet.currency,
    tier,
    dailyUsed,
    dailyLimit,
    monthlyUsed,
    monthlyLimit,
    reasons,
  };
}

// ─── Réconciliation solde CBS ────────────────────────────────────────────────
// Compare le solde local avec un solde CBS externe fourni.
// Retourne les écarts détectés.

export interface CbsBalanceEntry {
  walletId: string;      // walletId (WAL-xxx)
  cbsBalance: number;    // solde côté CBS
  cbsCurrency: string;
}

export async function reconcileCbsBalances(entries: CbsBalanceEntry[]) {
  const discrepancies: Array<{
    walletId: string;
    localBalance: number;
    cbsBalance: number;
    difference: number;
    currency: string;
  }> = [];
  let matched = 0;

  for (const entry of entries) {
    const [wallet] = await db.select({
      id: wallets.id,
      walletId: wallets.walletId,
      balance: wallets.balance,
      currency: wallets.currency,
    }).from(wallets).where(eq(wallets.walletId, entry.walletId)).limit(1);

    if (!wallet) continue;

    const localBalance = Number(wallet.balance);
    const diff = Math.abs(localBalance - entry.cbsBalance);

    if (diff > 0.01) { // tolerance 1 centime
      discrepancies.push({
        walletId: entry.walletId,
        localBalance,
        cbsBalance: entry.cbsBalance,
        difference: Math.round(diff * 100) / 100,
        currency: wallet.currency,
      });
    } else {
      matched++;
    }
  }

  return {
    total: entries.length,
    matched,
    discrepancies: discrepancies.length,
    details: discrepancies,
  };
}

// ─── Export CSV des transactions ──────────────────────────────────────────────

export async function exportWalletTransactionsCsv(
  walletId: number,
  from?: Date,
  to?: Date,
): Promise<string> {
  const conditions = [eq(transactions.walletId, walletId)];
  if (from && to) conditions.push(between(transactions.transactionDate, from, to));
  else if (from)  conditions.push(gte(transactions.transactionDate, from));
  else if (to)    conditions.push(lte(transactions.transactionDate, to));

  const rows = await db.select().from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.transactionDate))
    .limit(10_000);

  const header = "date,transactionId,type,channel,amount,currency,counterparty,purpose,status,riskScore";
  const lines  = rows.map(r =>
    [
      r.transactionDate.toISOString().slice(0, 10),
      r.transactionId,
      r.transactionType,
      r.channel,
      r.amount,
      r.currency,
      `"${(r.counterparty ?? "").replace(/"/g, '""')}"`,
      `"${(r.purpose     ?? "").replace(/"/g, '""')}"`,
      r.status,
      r.riskScore,
    ].join(",")
  );

  return [header, ...lines].join("\n");
}

// ─── Scoring risque wallet ────────────────────────────────────────────────────
//
// Score 0–100, décomposé en 5 facteurs :
//   1. Transactions suspectes (30j)       : max +30
//   2. Alertes ouvertes                   : max +25
//   3. Utilisation % des limites tier     : max +15
//   4. Dormance puis réactivation récente : max +15
//   5. Risque client (hérité)             : max +15
//
// Niveaux : LOW (0–29), MEDIUM (30–59), HIGH (60–79), CRITICAL (80–100)

function riskLevelFromScore(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export async function calculateWalletRisk(walletId: number) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, walletId)).limit(1);
  if (!wallet) throw new Error(`Wallet ${walletId} introuvable`);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [suspTx, openAlerts, dailyUsage, monthlyUsage, customer] = await Promise.all([
    // 1. Transactions suspectes (30j)
    db.select({ c: count() }).from(transactions)
      .where(and(
        eq(transactions.walletId, walletId),
        eq(transactions.isSuspicious, true),
        gte(transactions.transactionDate, thirtyDaysAgo),
      )),
    // 2. Alertes ouvertes du client propriétaire
    db.select({ c: count() }).from(alerts)
      .where(and(
        eq(alerts.customerId, wallet.customerId),
        eq(alerts.status, "OPEN"),
      )),
    // 3a. Usage journalier
    db.select({ total: sum(transactions.amount) }).from(transactions)
      .where(and(
        eq(transactions.walletId, walletId),
        gte(transactions.transactionDate, dayStart),
      )),
    // 3b. Usage mensuel
    db.select({ total: sum(transactions.amount) }).from(transactions)
      .where(and(
        eq(transactions.walletId, walletId),
        gte(transactions.transactionDate, monthStart),
      )),
    // 5. Risque client
    db.select({ riskScore: customers.riskScore, riskLevel: customers.riskLevel })
      .from(customers).where(eq(customers.id, wallet.customerId)).limit(1),
  ]);

  // Factor 1: Suspicious transactions (0–30)
  const suspCount = Number(suspTx[0]?.c ?? 0);
  const f1 = Math.min(30, suspCount * 10);

  // Factor 2: Open alerts (0–25)
  const alertCount = Number(openAlerts[0]?.c ?? 0);
  const f2 = Math.min(25, alertCount * 8);

  // Factor 3: Usage vs limits (0–15)
  const tier = (wallet.kycTier ?? "ALLEGED") as KycTier;
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.ALLEGED;
  const dailyLimit = wallet.dailyLimit ? Number(wallet.dailyLimit) : limits.daily;
  const monthlyLimit = wallet.monthlyLimit ? Number(wallet.monthlyLimit) : limits.monthly;
  const dailyPct = Number(dailyUsage[0]?.total ?? 0) / dailyLimit;
  const monthlyPct = Number(monthlyUsage[0]?.total ?? 0) / monthlyLimit;
  const maxPct = Math.max(dailyPct, monthlyPct);
  const f3 = maxPct >= 1.0 ? 15 : maxPct >= 0.9 ? 12 : maxPct >= 0.7 ? 8 : maxPct >= 0.5 ? 4 : 0;

  // Factor 4: Dormancy + recent reactivation (0–15)
  let f4 = 0;
  if (wallet.isDormant) f4 = 5;
  if (wallet.reactivatedAt) {
    const daysSinceReactivation = (Date.now() - wallet.reactivatedAt.getTime()) / 86_400_000;
    if (daysSinceReactivation < 30) f4 = 15;
    else if (daysSinceReactivation < 90) f4 = 8;
  }

  // Factor 5: Customer inherited risk (0–15)
  const custRiskScore = Number(customer[0]?.riskScore ?? 0);
  const f5 = Math.min(15, Math.round(custRiskScore * 0.15));

  const totalScore = Math.min(100, f1 + f2 + f3 + f4 + f5);
  const level = riskLevelFromScore(totalScore);

  // Persist
  const [updated] = await db.update(wallets).set({
    walletRiskScore: totalScore,
    walletRiskLevel: level,
    updatedAt: new Date(),
  }).where(eq(wallets.id, walletId)).returning();

  return {
    walletId,
    score: totalScore,
    level,
    factors: {
      suspiciousTransactions: { count: suspCount, points: f1 },
      openAlerts: { count: alertCount, points: f2 },
      limitUsage: { maxPct: Math.round(maxPct * 100), points: f3 },
      dormancy: { points: f4 },
      customerRisk: { score: custRiskScore, points: f5 },
    },
    wallet: updated,
  };
}

export async function recalculateAllWalletRisks() {
  const activeWallets = await db.select({ id: wallets.id }).from(wallets).where(eq(wallets.isActive, true));
  const results = { total: activeWallets.length, updated: 0, errors: 0 };

  for (const w of activeWallets) {
    try {
      await calculateWalletRisk(w.id);
      results.updated++;
    } catch {
      results.errors++;
    }
  }

  return results;
}

// ─── Statistiques ─────────────────────────────────────────────────────────────

export async function getWalletStats() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [total, dormant, byTier, volume30d] = await Promise.all([
    db.select({ total: count() }).from(wallets).where(eq(wallets.isActive, true)),
    db.select({ total: count() }).from(wallets).where(eq(wallets.isDormant, true)),
    db
      .select({ kycTier: wallets.kycTier, total: count() })
      .from(wallets)
      .where(eq(wallets.isActive, true))
      .groupBy(wallets.kycTier),
    db
      .select({ volume: sum(transactions.amount) })
      .from(transactions)
      .where(
        and(
          gte(transactions.transactionDate, thirtyDaysAgo),
        )
      ),
  ]);

  return {
    total:       Number(total[0]?.total ?? 0),
    dormant:     Number(dormant[0]?.total ?? 0),
    byTier:      Object.fromEntries(byTier.map(r => [r.kycTier, Number(r.total)])),
    volume30d:   Number(volume30d[0]?.volume ?? 0),
  };
}
