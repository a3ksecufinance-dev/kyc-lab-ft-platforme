/**
 * Wallets Router — actif uniquement si wallets=true
 *
 * Toutes les procédures vérifient le flag en entrée → TRPCError FORBIDDEN
 * si le déploiement est CLASSIC_BANK.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, analystProc, supervisorProc, complianceProc } from "../../_core/trpc";
import { getInstitutionFlags } from "../../_core/institution";
import { createAuditFromContext } from "../../_core/audit";
import {
  listWallets,
  getWalletById,
  getWalletsByCustomer,
  createWallet,
  promoteWalletTier,
  getKycTierHistory,
  reactivateWallet,
  getWalletStats,
  getWalletTransactions,
  getWalletUsage,
  suspendWallet,
  unsuspendWallet,
  exportWalletTransactionsCsv,
  calculateWalletRisk,
  recalculateAllWalletRisks,
  freezeWallet,
  unfreezeWallet,
  checkWalletLimits,
  reconcileCbsBalances,
} from "./wallets.service";
import { importWalletTransactions } from "./wallets.import";
import { bulkImportWalletTransactions } from "./wallets.bulk-import";
import {
  getWalletComplianceDashboard,
  getHighRiskWallets,
  getWalletSuspiciousTx,
  getWalletAlerts,
  createWalletInvestigation,
  getWalletInvestigations,
} from "./wallets.compliance";

function requireWallets() {
  if (!getInstitutionFlags().wallets) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Module wallets non activé pour cette institution" });
  }
}

const kycTierEnum = z.enum(["ALLEGED", "STANDARD", "RENFORCE"]);

export const walletsRouter = router({

  list: analystProc
    .input(z.object({
      page:       z.number().int().positive().default(1),
      limit:      z.number().int().min(1).max(100).default(20),
      customerId: z.number().int().positive().optional(),
      provider:   z.string().optional(),
      kycTier:    kycTierEnum.optional(),
      isDormant:  z.boolean().optional(),
    }))
    .query(({ input }) => {
      requireWallets();
      return listWallets({
        page:  input.page,
        limit: input.limit,
        ...(input.customerId !== undefined && { customerId: input.customerId }),
        ...(input.provider   !== undefined && { provider:   input.provider }),
        ...(input.kycTier    !== undefined && { kycTier:    input.kycTier }),
        ...(input.isDormant  !== undefined && { isDormant:  input.isDormant }),
      });
    }),

  byCustomer: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(({ input }) => {
      requireWallets();
      return getWalletsByCustomer(input.customerId);
    }),

  get: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      requireWallets();
      const wallet = await getWalletById(input.id);
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: `Wallet ${input.id} introuvable` });
      return wallet;
    }),

  create: supervisorProc
    .input(z.object({
      customerId:  z.number().int().positive(),
      provider:    z.string().max(50).optional(),
      phoneNumber: z.string().max(30).optional(),
      msisdn:      z.string().max(30).optional(),
      currency:    z.string().max(10).optional(),
      kycTier:     kycTierEnum.optional(),
    }))
    .mutation(({ input }) => {
      requireWallets();
      return createWallet({
        customerId: input.customerId,
        ...(input.provider    !== undefined && { provider:    input.provider }),
        ...(input.phoneNumber !== undefined && { phoneNumber: input.phoneNumber }),
        ...(input.msisdn      !== undefined && { msisdn:      input.msisdn }),
        ...(input.currency    !== undefined && { currency:    input.currency }),
        ...(input.kycTier     !== undefined && { kycTier:     input.kycTier }),
      });
    }),

  promoteTier: supervisorProc
    .input(z.object({
      walletId:   z.number().int().positive(),
      customerId: z.number().int().positive(),
      newTier:    kycTierEnum,
      reason:     z.string().min(5),
    }))
    .mutation(async ({ input, ctx }) => {
      requireWallets();
      const log = createAuditFromContext(ctx);
      const result = await promoteWalletTier({ ...input, userId: ctx.user.id });
      await log({ action: "CUSTOMER_KYC_STATUS_CHANGED", entityType: "customer",
        entityId: String(input.customerId),
        details: { walletId: input.walletId, newTier: input.newTier, reason: input.reason } });
      return result;
    }),

  tierHistory: analystProc
    .input(z.object({ walletId: z.number().int().positive() }))
    .query(({ input }) => {
      requireWallets();
      return getKycTierHistory(input.walletId);
    }),

  reactivate: supervisorProc
    .input(z.object({ walletId: z.number().int().positive() }))
    .mutation(({ input }) => {
      requireWallets();
      return reactivateWallet(input.walletId);
    }),

  stats: analystProc
    .query(() => {
      requireWallets();
      return getWalletStats();
    }),

  // ── Transactions du wallet ────────────────────────────────────────────────

  getTransactions: analystProc
    .input(z.object({
      walletId: z.number().int().positive(),
      page:     z.number().int().positive().default(1),
      limit:    z.number().int().min(1).max(100).default(20),
    }))
    .query(({ input }) => {
      requireWallets();
      return getWalletTransactions(input.walletId, input.page, input.limit);
    }),

  // ── Utilisation vs limites de tier ───────────────────────────────────────

  getUsage: analystProc
    .input(z.object({ walletId: z.number().int().positive() }))
    .query(({ input }) => {
      requireWallets();
      return getWalletUsage(input.walletId);
    }),

  // ── Suspension / réactivation ─────────────────────────────────────────────

  suspend: supervisorProc
    .input(z.object({
      walletId: z.number().int().positive(),
      reason:   z.string().min(5),
    }))
    .mutation(async ({ input, ctx }) => {
      requireWallets();
      const log = createAuditFromContext(ctx);
      const result = await suspendWallet(input.walletId, input.reason, ctx.user.id);
      await log({ action: "CUSTOMER_RISK_LEVEL_CHANGED", entityType: "customer",
        entityId: String(input.walletId),
        details: { walletId: input.walletId, action: "WALLET_SUSPENDED", reason: input.reason } });
      return result;
    }),

  unsuspend: supervisorProc
    .input(z.object({ walletId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireWallets();
      const log = createAuditFromContext(ctx);
      const result = await unsuspendWallet(input.walletId);
      await log({ action: "CUSTOMER_RISK_LEVEL_CHANGED", entityType: "customer",
        entityId: String(input.walletId),
        details: { walletId: input.walletId, action: "WALLET_UNSUSPENDED" } });
      return result;
    }),

  // ── Import transactions (fichier) ─────────────────────────────────────────

  importTransactions: supervisorProc
    .input(z.object({
      walletId:   z.number().int().positive(),
      customerId: z.number().int().positive(),
      content:    z.string().min(1).max(5_000_000),
      dryRun:     z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      requireWallets();
      return importWalletTransactions({
        walletId:   input.walletId,
        customerId: input.customerId,
        content:    input.content,
        ...(input.dryRun !== undefined ? { dryRun: input.dryRun } : {}),
      });
    }),

  // ── Import global (multi-wallets, un seul fichier) ───────────────────────

  bulkImport: supervisorProc
    .input(z.object({
      content:   z.string().min(1).max(10_000_000),
      provider:  z.string().optional(),
      currency:  z.string().optional(),
      dryRun:    z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      requireWallets();
      return bulkImportWalletTransactions({
        content:  input.content,
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.dryRun   !== undefined ? { dryRun:   input.dryRun   } : {}),
      });
    }),

  // ── Conformité ────────────────────────────────────────────────────────────

  complianceDashboard: analystProc
    .query(() => {
      requireWallets();
      return getWalletComplianceDashboard();
    }),

  highRiskWallets: analystProc
    .input(z.object({
      page:  z.number().int().positive().default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(({ input }) => {
      requireWallets();
      return getHighRiskWallets(input.page, input.limit);
    }),

  suspiciousTx: analystProc
    .input(z.object({
      page:  z.number().int().positive().default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(({ input }) => {
      requireWallets();
      return getWalletSuspiciousTx(input.page, input.limit);
    }),

  walletAlerts: analystProc
    .input(z.object({
      page:  z.number().int().positive().default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(({ input }) => {
      requireWallets();
      return getWalletAlerts(input.page, input.limit);
    }),

  createInvestigation: supervisorProc
    .input(z.object({
      walletId:   z.number().int().positive(),
      customerId: z.number().int().positive(),
      reason:     z.string().min(10),
      severity:   z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    }))
    .mutation(async ({ input, ctx }) => {
      requireWallets();
      const log = createAuditFromContext(ctx);
      const result = await createWalletInvestigation({ ...input, userId: ctx.user.id });
      await log({ action: "CASE_CREATED", entityType: "case",
        entityId: String(input.walletId),
        details: { walletId: input.walletId, customerId: input.customerId,
          reason: input.reason, severity: input.severity } });
      return result;
    }),

  walletInvestigations: analystProc
    .input(z.object({
      page:  z.number().int().positive().default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(({ input }) => {
      requireWallets();
      return getWalletInvestigations(input.page, input.limit);
    }),

  // ── Export CSV ────────────────────────────────────────────────────────────

  exportCsv: analystProc
    .input(z.object({
      walletId: z.number().int().positive(),
      from:     z.string().datetime().optional(),
      to:       z.string().datetime().optional(),
    }))
    .query(({ input }) => {
      requireWallets();
      return exportWalletTransactionsCsv(
        input.walletId,
        input.from ? new Date(input.from) : undefined,
        input.to   ? new Date(input.to)   : undefined,
      );
    }),

  // ── Scoring risque wallet (Phase B) ─────────────────────────────────────

  calculateRisk: supervisorProc
    .input(z.object({ walletId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireWallets();
      const result = await calculateWalletRisk(input.walletId);
      const log = createAuditFromContext(ctx);
      await log({
        action: "WALLET_RISK_CALCULATED",
        entityType: "customer",
        entityId: String(input.walletId),
        details: { score: result.score, level: result.level, factors: result.factors },
      });
      return result;
    }),

  recalculateAllRisks: complianceProc
    .mutation(async ({ ctx }) => {
      requireWallets();
      const result = await recalculateAllWalletRisks();
      const log = createAuditFromContext(ctx);
      await log({
        action: "WALLET_RISK_CALCULATED",
        entityType: "system",
        entityId: "bulk",
        details: result,
      });
      return result;
    }),

  // ── Gel réglementaire (Phase B) ─────────────────────────────────────────

  freeze: complianceProc
    .input(z.object({
      walletId: z.number().int().positive(),
      reason:   z.string().min(10, "Le motif de gel doit faire au moins 10 caractères"),
    }))
    .mutation(async ({ input, ctx }) => {
      requireWallets();
      const result = await freezeWallet(input.walletId, input.reason, ctx.user.id);
      const log = createAuditFromContext(ctx);
      await log({
        action: "WALLET_FROZEN",
        entityType: "customer",
        entityId: String(input.walletId),
        details: { walletId: input.walletId, reason: input.reason },
      });
      return result;
    }),

  unfreeze: complianceProc
    .input(z.object({ walletId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireWallets();
      const result = await unfreezeWallet(input.walletId);
      const log = createAuditFromContext(ctx);
      await log({
        action: "WALLET_UNFROZEN",
        entityType: "customer",
        entityId: String(input.walletId),
        details: { walletId: input.walletId },
      });
      return result;
    }),

  // ── Enforcement limites (Phase B) ───────────────────────────────────────

  checkLimits: analystProc
    .input(z.object({
      walletId: z.number().int().positive(),
      amount:   z.number().positive(),
    }))
    .query(({ input }) => {
      requireWallets();
      return checkWalletLimits(input.walletId, input.amount);
    }),

  // ── Réconciliation CBS (Phase B) ────────────────────────────────────────

  reconcileCbs: complianceProc
    .input(z.object({
      entries: z.array(z.object({
        walletId:    z.string().min(1),
        cbsBalance:  z.number(),
        cbsCurrency: z.string().max(10),
      })).min(1).max(10_000),
    }))
    .mutation(async ({ input, ctx }) => {
      requireWallets();
      const result = await reconcileCbsBalances(input.entries);
      const log = createAuditFromContext(ctx);
      await log({
        action: "CBS_RECONCILIATION",
        entityType: "system",
        entityId: "reconciliation",
        details: { total: result.total, matched: result.matched, discrepancies: result.discrepancies },
      });
      return result;
    }),
});
