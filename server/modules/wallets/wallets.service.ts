/**
 * Wallets Service — MICROFINANCE / PAYMENT_INSTITUTION uniquement
 *
 * Actif uniquement si getInstitutionFlags().wallets === true.
 * Ce fichier peut être importé librement — la garde est dans le router.
 */

import { eq, and, desc, count, sum, gte } from "drizzle-orm";
import { db } from "../../_core/db";
import { wallets, transactions, kycTierSnapshots } from "../../../drizzle/schema";
import { updateWalletTier } from "../customers/kyc-tier.service";
import type { KycTier } from "../../../shared/institution.types";
import { nanoid } from "nanoid";

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
