/**
 * Wallets Router — actif uniquement si wallets=true
 *
 * Toutes les procédures vérifient le flag en entrée → TRPCError FORBIDDEN
 * si le déploiement est CLASSIC_BANK.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, analystProc, supervisorProc } from "../../_core/trpc";
import { getInstitutionFlags } from "../../_core/institution";
import {
  listWallets,
  getWalletById,
  getWalletsByCustomer,
  createWallet,
  promoteWalletTier,
  getKycTierHistory,
  reactivateWallet,
  getWalletStats,
} from "./wallets.service";

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
    .mutation(({ input, ctx }) => {
      requireWallets();
      return promoteWalletTier({ ...input, userId: ctx.user.id });
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
});
