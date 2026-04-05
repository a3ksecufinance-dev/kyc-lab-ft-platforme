/**
 * Service KYC Tier — gestion des tiers allégé / standard / renforcé
 *
 * Chargé uniquement si walletKyc=true (MICROFINANCE / PAYMENT_INSTITUTION).
 * Le tier est stocké en VARCHAR sur la table wallets pour éviter les migrations
 * futures si un nouveau tier est introduit.
 *
 * Plafonds réglementaires BAM (Circulaire 5/W/2023) :
 *   ALLEGED  : 5 000 MAD/tx   · 20 000 MAD/mois
 *   STANDARD : 50 000 MAD/tx  · 200 000 MAD/mois
 *   RENFORCE : 500 000 MAD/tx · 2 000 000 MAD/mois
 */

import { eq } from "drizzle-orm";
import { db }  from "../../_core/db";
import { wallets, kycTierSnapshots } from "../../../drizzle/schema";
import type { KycTier } from "../../../shared/institution.types";
import { KYC_TIER_CONFIGS }         from "../../../shared/institution.types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TierCheckResult {
  allowed: boolean;
  reason?: string;
  currentTier: KycTier;
  dailyLimit: number;
  monthlyLimit: number;
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export async function getWalletTier(walletId: number): Promise<KycTier> {
  const [wallet] = await db
    .select({ kycTier: wallets.kycTier })
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .limit(1);

  const tier = wallet?.kycTier;
  return (tier === "STANDARD" || tier === "RENFORCE") ? tier : "ALLEGED";
}

// ─── Vérification de plafond ──────────────────────────────────────────────────

export function checkTierLimits(
  tier: KycTier,
  txAmount: number,
  monthlyTotal: number,
): TierCheckResult {
  const config = KYC_TIER_CONFIGS[tier];

  if (txAmount > config.maxSingleTx) {
    return {
      allowed: false,
      reason: `Montant ${txAmount} MAD dépasse le plafond unitaire ${config.maxSingleTx} MAD pour le tier ${config.label}`,
      currentTier: tier,
      dailyLimit:   config.maxSingleTx,
      monthlyLimit: config.maxMonthly,
    };
  }

  if (monthlyTotal + txAmount > config.maxMonthly) {
    return {
      allowed: false,
      reason: `Cumul mensuel ${(monthlyTotal + txAmount).toFixed(0)} MAD dépasse le plafond ${config.maxMonthly} MAD pour le tier ${config.label}`,
      currentTier: tier,
      dailyLimit:   config.maxSingleTx,
      monthlyLimit: config.maxMonthly,
    };
  }

  return {
    allowed: true,
    currentTier: tier,
    dailyLimit:   config.maxSingleTx,
    monthlyLimit: config.maxMonthly,
  };
}

// ─── Promotion / rétrogradation de tier ──────────────────────────────────────

export async function updateWalletTier(params: {
  walletId:     number;
  customerId:   number;
  newTier:      KycTier;
  reason:       string;
  triggeredBy?: number;   // userId — null = auto-déclenché
}): Promise<void> {
  const currentTier = await getWalletTier(params.walletId);

  await db.transaction(async (trx) => {
    await trx
      .update(wallets)
      .set({ kycTier: params.newTier, updatedAt: new Date() })
      .where(eq(wallets.id, params.walletId));

    await trx.insert(kycTierSnapshots).values({
      customerId:   params.customerId,
      walletId:     params.walletId,
      previousTier: currentTier,
      newTier:      params.newTier,
      reason:       params.reason,
      triggeredBy:  params.triggeredBy ?? null,
      autoTriggered: params.triggeredBy === undefined,
    });
  });
}

// ─── Évaluation automatique du tier ──────────────────────────────────────────
/**
 * Déclenché après la complétion d'une vérification de documents.
 * Détermine le tier maximal selon les documents présents.
 *
 * ALLEGED  → CIN seule
 * STANDARD → CIN + justificatif de domicile
 * RENFORCE → CIN + JDD + relevé bancaire + entretien EDD
 */
export function inferTierFromDocuments(documentTypes: string[]): KycTier {
  const docs = new Set(documentTypes);

  const hasId          = docs.has("ID_CARD") || docs.has("PASSPORT");
  const hasAddress     = docs.has("PROOF_OF_ADDRESS");
  const hasBankStmt    = docs.has("BANK_STATEMENT");

  if (!hasId) return "ALLEGED";
  if (hasId && hasAddress && hasBankStmt) return "RENFORCE";
  if (hasId && hasAddress) return "STANDARD";
  return "ALLEGED";
}
