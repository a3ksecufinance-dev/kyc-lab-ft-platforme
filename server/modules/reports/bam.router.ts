/**
 * BAM Router — rapports réglementaires Bank Al-Maghrib (Établissements de Paiement)
 *
 * Actif uniquement si bamReports=true (PAYMENT_INSTITUTION).
 *
 * Référence : Circulaire BAM n°5/W/2023 relative aux établissements de paiement
 * Rapports obligatoires : mensuel, trimestriel, annuel
 *
 * Ces endpoints produisent des agrégats prêts à l'exportation réglementaire.
 * La génération PDF/Excel est gérée côté client.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, gte, lte, count, sum, eq } from "drizzle-orm";
import { router, complianceProc } from "../../_core/trpc";
import { getInstitutionFlags } from "../../_core/institution";
import { db } from "../../_core/db";
import { transactions, wallets, agentAccounts, alerts } from "../../../drizzle/schema";

function requireBam() {
  if (!getInstitutionFlags().bamReports) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Module rapports BAM non activé pour cette institution" });
  }
}

// ─── Helper : fenêtre temporelle ─────────────────────────────────────────────

function periodBounds(year: number, month?: number, quarter?: number): { from: Date; to: Date } {
  if (month !== undefined) {
    // Mensuel : du 1er au dernier jour du mois
    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month,     1);   // 1er du mois suivant (exclusif)
    return { from, to };
  }
  if (quarter !== undefined) {
    // Trimestriel : Q1=jan-mar, Q2=avr-jun, Q3=jul-sep, Q4=oct-dec
    const startMonth = (quarter - 1) * 3;
    const from = new Date(year, startMonth,     1);
    const to   = new Date(year, startMonth + 3, 1);
    return { from, to };
  }
  // Annuel
  return {
    from: new Date(year,     0, 1),
    to:   new Date(year + 1, 0, 1),
  };
}

// ─── Agrégateur commun ────────────────────────────────────────────────────────

async function computeBamAggregates(from: Date, to: Date) {
  const periodFilter = and(
    gte(transactions.transactionDate, from),
    lte(transactions.transactionDate, to),
  )!;

  const [
    txStats,
    walletStats,
    agentStats,
    alertStats,
    byChannel,
    byTransactionType,
    p2pStats,
    agentCashStats,
  ] = await Promise.all([
    // Volume global
    db.select({ total: count(), volume: sum(transactions.amount) })
      .from(transactions)
      .where(periodFilter),

    // Wallets actifs sur la période
    db.select({ active: count() })
      .from(wallets)
      .where(eq(wallets.isActive, true)),

    // Agents actifs
    db.select({ active: count() })
      .from(agentAccounts)
      .where(eq(agentAccounts.isActive, true)),

    // Alertes ouvertes créées sur la période
    db.select({ total: count() })
      .from(alerts)
      .where(
        and(
          gte(alerts.createdAt, from),
          lte(alerts.createdAt, to),
        )
      ),

    // Répartition par canal
    db.select({ channel: transactions.channel, total: count(), volume: sum(transactions.amount) })
      .from(transactions)
      .where(periodFilter)
      .groupBy(transactions.channel),

    // Répartition par type de transaction
    db.select({ type: transactions.transactionType, total: count(), volume: sum(transactions.amount) })
      .from(transactions)
      .where(periodFilter)
      .groupBy(transactions.transactionType),

    // Flux P2P spécifiquement
    db.select({ total: count(), volume: sum(transactions.amount) })
      .from(transactions)
      .where(and(periodFilter, eq(transactions.transactionType, "P2P_TRANSFER"))),

    // Flux agent cash-in + cash-out
    db.select({ type: transactions.transactionType, total: count(), volume: sum(transactions.amount) })
      .from(transactions)
      .where(
        and(
          periodFilter,
          // AGENT_CASH_IN and AGENT_CASH_OUT via in() not needed; two separate rows via groupBy
        )
      )
      .groupBy(transactions.transactionType)
      .having(
        // We want only agent types — we can't use IN here easily, so we'll filter client-side
        // This returns all types; we filter in the return
        eq(transactions.transactionType, transactions.transactionType)  // noop, filter below
      ),
  ]);

  // Filtrer les flux agent côté JS (plus simple que SQL dynamique)
  const agentCashFiltered = agentCashStats.filter(
    r => r.type === "AGENT_CASH_IN" || r.type === "AGENT_CASH_OUT"
  );

  return {
    period: { from: from.toISOString(), to: to.toISOString() },

    // Section 1 : Vue d'ensemble
    overview: {
      totalTransactions: Number(txStats[0]?.total  ?? 0),
      totalVolumeMad:    Number(txStats[0]?.volume ?? 0),
      activeWallets:     Number(walletStats[0]?.active ?? 0),
      activeAgents:      Number(agentStats[0]?.active  ?? 0),
      alertsGenerated:   Number(alertStats[0]?.total   ?? 0),
    },

    // Section 2 : Ventilation par canal (Article 12 Circulaire)
    byChannel: byChannel.map(r => ({
      channel: r.channel,
      count:   Number(r.total),
      volume:  Number(r.volume ?? 0),
    })),

    // Section 3 : Ventilation par type d'opération (Article 13 Circulaire)
    byTransactionType: byTransactionType.map(r => ({
      type:   r.type,
      count:  Number(r.total),
      volume: Number(r.volume ?? 0),
    })),

    // Section 4 : Flux P2P (indicateur spécifique EP)
    p2p: {
      count:  Number(p2pStats[0]?.total  ?? 0),
      volume: Number(p2pStats[0]?.volume ?? 0),
    },

    // Section 5 : Opérations agents (float, cash-in, cash-out)
    agentOperations: agentCashFiltered.map(r => ({
      type:   r.type,
      count:  Number(r.total),
      volume: Number(r.volume ?? 0),
    })),
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const bamRouter = router({

  /**
   * Rapport mensuel BAM — Article 11 Circulaire 5/W/2023
   * À transmettre avant le 15 du mois suivant.
   */
  monthly: complianceProc
    .input(z.object({
      year:  z.number().int().min(2020).max(2099),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ input }) => {
      requireBam();
      const { from, to } = periodBounds(input.year, input.month);
      const data = await computeBamAggregates(from, to);
      return {
        reportType: "BAM_MONTHLY" as const,
        ...data,
        generatedAt: new Date().toISOString(),
        institution: getInstitutionFlags().institutionName,
      };
    }),

  /**
   * Rapport trimestriel BAM — Article 11 §2 Circulaire 5/W/2023
   * À transmettre avant le 30 du mois suivant la fin du trimestre.
   */
  quarterly: complianceProc
    .input(z.object({
      year:    z.number().int().min(2020).max(2099),
      quarter: z.number().int().min(1).max(4),
    }))
    .query(async ({ input }) => {
      requireBam();
      const { from, to } = periodBounds(input.year, undefined, input.quarter);
      const data = await computeBamAggregates(from, to);
      return {
        reportType: "BAM_QUARTERLY" as const,
        quarter:    input.quarter,
        ...data,
        generatedAt: new Date().toISOString(),
        institution: getInstitutionFlags().institutionName,
      };
    }),

  /**
   * Rapport annuel BAM — Article 11 §3 Circulaire 5/W/2023
   * À transmettre avant le 31 mars de l'année suivante.
   */
  annual: complianceProc
    .input(z.object({
      year: z.number().int().min(2020).max(2099),
    }))
    .query(async ({ input }) => {
      requireBam();
      const { from, to } = periodBounds(input.year);
      const data = await computeBamAggregates(from, to);
      return {
        reportType: "BAM_ANNUAL" as const,
        ...data,
        generatedAt: new Date().toISOString(),
        institution: getInstitutionFlags().institutionName,
      };
    }),
});
