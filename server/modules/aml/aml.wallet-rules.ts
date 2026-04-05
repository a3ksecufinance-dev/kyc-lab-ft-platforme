/**
 * Règles AML spécifiques aux wallets mobile — chargées UNIQUEMENT si walletAml=true
 *
 * 5 règles complémentaires aux 11 règles core :
 *   W1 — P2P_VELOCITY              : flux P2P trop rapides depuis un wallet
 *   W2 — AGENT_MULE               : agent relai de petites opérations (smurfing)
 *   W3 — SMALL_AMOUNT_ACCUMULATION: accumulation de micro-dépôts sous les seuils KYC
 *   W4 — MERCHANT_BYPASS          : fractionner un paiement marchand pour éviter la revue
 *   W5 — DORMANT_WALLET_REACTIVATION: wallet dormant soudainement actif avec gros montant
 *
 * Ce fichier n'importe pas aml.engine.ts pour éviter les dépendances circulaires.
 * Les types retournés sont structurellement compatibles avec AmlRuleResult.
 */

import { and, eq, gte, desc } from "drizzle-orm";
import { db }          from "../../_core/db";
import { transactions, wallets } from "../../../drizzle/schema";
import type { Transaction, Customer } from "../../../drizzle/schema";

// ─── Types locaux (structurellement compatibles avec AmlRuleResult) ───────────

export type WalletAmlRuleName =
  | "P2P_VELOCITY"
  | "AGENT_MULE"
  | "SMALL_AMOUNT_ACCUMULATION"
  | "MERCHANT_BYPASS"
  | "DORMANT_WALLET_REACTIVATION";

export interface WalletAmlRuleResult {
  triggered: boolean;
  rule: WalletAmlRuleName;
  score: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
  details: Record<string, unknown>;
}

const NOOP = (rule: WalletAmlRuleName): WalletAmlRuleResult => ({
  triggered: false, rule, score: 0, priority: "LOW", reason: "", details: {},
});

// ─── W1 : P2P_VELOCITY ────────────────────────────────────────────────────────
/**
 * Détecte les rafales de transferts P2P depuis un même wallet.
 * Indicateur typique de money-mule ou de collecte de fonds illicites.
 * Seuil : ≥5 P2P_TRANSFER depuis le même wallet en 1h.
 */
async function ruleP2pVelocity(tx: Transaction): Promise<WalletAmlRuleResult> {
  if (!tx.walletId || tx.transactionType !== "P2P_TRANSFER") return NOOP("P2P_VELOCITY");

  const since1h = new Date(tx.transactionDate.getTime() - 60 * 60 * 1000);
  const recent = await db
    .select({ id: transactions.id, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.walletId, tx.walletId),
        eq(transactions.transactionType, "P2P_TRANSFER"),
        gte(transactions.transactionDate, since1h),
      )
    )
    .orderBy(desc(transactions.transactionDate));

  const count = recent.filter(t => t.id !== tx.id).length + 1;
  const totalAmount = recent.reduce((s, t) => s + Number(t.amount), 0);
  const triggered = count >= 5;

  return {
    triggered,
    rule: "P2P_VELOCITY",
    score: triggered ? Math.min(40 + (count - 5) * 8, 70) : 0,
    priority: count >= 8 ? "HIGH" : "MEDIUM",
    reason: triggered
      ? `Vélocité P2P : ${count} transferts en 1h depuis wallet #${tx.walletId} (total ${totalAmount.toFixed(0)} MAD)`
      : "",
    details: { walletId: tx.walletId, p2pCount1h: count, totalAmount1h: totalAmount },
  };
}

// ─── W2 : AGENT_MULE ─────────────────────────────────────────────────────────
/**
 * Agent effectuant de nombreux cash-in/cash-out de faibles montants en courte période.
 * Smurfing typique via réseau d'agents informels.
 * Seuil : ≥10 opérations agent en 2h depuis le même agentId.
 */
async function ruleAgentMule(tx: Transaction): Promise<WalletAmlRuleResult> {
  if (!tx.agentId) return NOOP("AGENT_MULE");
  if (tx.transactionType !== "AGENT_CASH_IN" && tx.transactionType !== "AGENT_CASH_OUT") {
    return NOOP("AGENT_MULE");
  }

  const since2h = new Date(tx.transactionDate.getTime() - 2 * 60 * 60 * 1000);
  const recent = await db
    .select({ id: transactions.id, amount: transactions.amount, transactionType: transactions.transactionType })
    .from(transactions)
    .where(
      and(
        eq(transactions.agentId, tx.agentId),
        gte(transactions.transactionDate, since2h),
      )
    );

  const agentTxCount = recent.filter(t => t.id !== tx.id).length + 1;
  const smallTxCount = recent.filter(
    t => Number(t.amount) < 5_000
  ).length;
  const triggered = agentTxCount >= 10 && smallTxCount >= 7;

  return {
    triggered,
    rule: "AGENT_MULE",
    score: triggered ? Math.min(50 + (agentTxCount - 10) * 5, 75) : 0,
    priority: triggered ? "HIGH" : "LOW",
    reason: triggered
      ? `Agent mule suspect : ${agentTxCount} opérations en 2h (agent #${tx.agentId}), dont ${smallTxCount} < 5 000 MAD`
      : "",
    details: { agentId: tx.agentId, agentTxCount2h: agentTxCount, smallTxCount },
  };
}

// ─── W3 : SMALL_AMOUNT_ACCUMULATION ──────────────────────────────────────────
/**
 * Accumulation de micro-dépôts pour rester sous les seuils KYC ALLEGED (5 000 MAD).
 * Pattern fréquent chez les clients non-vérifiés qui fragmentent leurs versements.
 * Seuil : somme des dépôts < 2 000 MAD > 80% du plafond mensuel ALLEGED en 7j.
 */
async function ruleSmallAccumulation(tx: Transaction): Promise<WalletAmlRuleResult> {
  if (!tx.walletId) return NOOP("SMALL_AMOUNT_ACCUMULATION");

  const amount = Number(tx.amount);
  if (amount >= 2_000) return NOOP("SMALL_AMOUNT_ACCUMULATION"); // pas un micro-dépôt

  const since7d = new Date(tx.transactionDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recent7d = await db
    .select({ id: transactions.id, amount: transactions.amount, transactionType: transactions.transactionType })
    .from(transactions)
    .where(
      and(
        eq(transactions.walletId, tx.walletId),
        gte(transactions.transactionDate, since7d),
      )
    );

  const deposits = recent7d.filter(
    t => t.id !== tx.id
      && (t.transactionType === "AGENT_CASH_IN" || t.transactionType === "MOBILE_MONEY_IN")
      && Number(t.amount) < 2_000
  );
  const accumulated = deposits.reduce((s, t) => s + Number(t.amount), 0) + amount;

  // 80% du plafond mensuel KYC ALLEGED (20 000 MAD) → 16 000 MAD en 7j est suspect
  const triggered = accumulated >= 16_000 && deposits.length >= 5;

  return {
    triggered,
    rule: "SMALL_AMOUNT_ACCUMULATION",
    score: triggered ? Math.min(35 + deposits.length * 3, 60) : 0,
    priority: "MEDIUM",
    reason: triggered
      ? `Accumulation micro-dépôts : ${deposits.length + 1} versements < 2 000 MAD pour total ${accumulated.toFixed(0)} MAD en 7j (wallet #${tx.walletId})`
      : "",
    details: {
      walletId: tx.walletId,
      microDepositCount: deposits.length + 1,
      accumulated7d: accumulated,
      thresholdAlleged: 20_000,
    },
  };
}

// ─── W4 : MERCHANT_BYPASS ────────────────────────────────────────────────────
/**
 * Fractionner un paiement marchand pour éviter la revue manuelle.
 * ≥3 MERCHANT_PAYMENT vers le même beneficiaire en moins de 10 minutes.
 */
async function ruleMerchantBypass(tx: Transaction): Promise<WalletAmlRuleResult> {
  if (!tx.walletId || tx.transactionType !== "MERCHANT_PAYMENT") {
    return NOOP("MERCHANT_BYPASS");
  }
  if (!tx.counterparty) return NOOP("MERCHANT_BYPASS");

  const since10min = new Date(tx.transactionDate.getTime() - 10 * 60 * 1000);
  const recent = await db
    .select({ id: transactions.id, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.walletId, tx.walletId),
        eq(transactions.transactionType, "MERCHANT_PAYMENT"),
        eq(transactions.counterparty, tx.counterparty),
        gte(transactions.transactionDate, since10min),
      )
    );

  const count = recent.filter(t => t.id !== tx.id).length + 1;
  const totalAmount = recent.reduce((s, t) => s + Number(t.amount), 0) + Number(tx.amount);
  const triggered = count >= 3;

  return {
    triggered,
    rule: "MERCHANT_BYPASS",
    score: triggered ? Math.min(40 + count * 8, 65) : 0,
    priority: "MEDIUM",
    reason: triggered
      ? `Contournement marchand : ${count} paiements vers "${tx.counterparty}" en 10 min (total ${totalAmount.toFixed(0)} MAD)`
      : "",
    details: {
      walletId: tx.walletId,
      merchant: tx.counterparty,
      paymentCount10min: count,
      totalAmount10min: totalAmount,
    },
  };
}

// ─── W5 : DORMANT_WALLET_REACTIVATION ────────────────────────────────────────
/**
 * Wallet dormant depuis ≥90 jours soudainement actif avec un montant élevé.
 * Indicateur de compte compromis ou de réactivation planifiée pour blanchiment.
 */
async function ruleDormantReactivation(tx: Transaction): Promise<WalletAmlRuleResult> {
  if (!tx.walletId) return NOOP("DORMANT_WALLET_REACTIVATION");

  const [wallet] = await db
    .select({ isDormant: wallets.isDormant, dormantSince: wallets.dormantSince, kycTier: wallets.kycTier })
    .from(wallets)
    .where(eq(wallets.id, tx.walletId))
    .limit(1);

  if (!wallet?.isDormant || !wallet.dormantSince) return NOOP("DORMANT_WALLET_REACTIVATION");

  const dormantDays = Math.floor(
    (tx.transactionDate.getTime() - wallet.dormantSince.getTime()) / (24 * 60 * 60 * 1000)
  );
  const amount = Number(tx.amount);

  // Seul les montants élevés (> 10% du plafond tier) sont suspects à la réactivation
  const tierThreshold = wallet.kycTier === "RENFORCE" ? 50_000
    : wallet.kycTier === "STANDARD" ? 5_000
    : 500;   // ALLEGED

  const triggered = dormantDays >= 90 && amount >= tierThreshold;
  const isCritical = dormantDays >= 365 || amount >= tierThreshold * 5;

  return {
    triggered,
    rule: "DORMANT_WALLET_REACTIVATION",
    score: triggered ? Math.min(55 + (dormantDays >= 365 ? 20 : 0), 80) : 0,
    priority: isCritical ? "HIGH" : "MEDIUM",
    reason: triggered
      ? `Réactivation wallet dormant depuis ${dormantDays}j : ${amount.toFixed(0)} MAD (tier ${wallet.kycTier})`
      : "",
    details: {
      walletId: tx.walletId,
      dormantDays,
      kycTier: wallet.kycTier,
      amount,
      tierThreshold,
    },
  };
}

// ─── Orchestrateur wallet ─────────────────────────────────────────────────────

export async function runWalletAmlRules(
  tx: Transaction,
  _customer: Customer,
): Promise<WalletAmlRuleResult[]> {
  return Promise.all([
    ruleP2pVelocity(tx),
    ruleAgentMule(tx),
    ruleSmallAccumulation(tx),
    ruleMerchantBypass(tx),
    ruleDormantReactivation(tx),
  ]);
}
