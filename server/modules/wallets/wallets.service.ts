/**
 * Wallets Service — MICROFINANCE / PAYMENT_INSTITUTION uniquement
 *
 * Actif uniquement si getInstitutionFlags().wallets === true.
 * Ce fichier peut être importé librement — la garde est dans le router.
 */

import { eq, and, desc, count, sum, gte, lte, between } from "drizzle-orm";
import { db } from "../../_core/db";
import { wallets, transactions, kycTierSnapshots } from "../../../drizzle/schema";
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
