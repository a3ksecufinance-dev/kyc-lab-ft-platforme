/**
 * tRPC Router — Travel Rule FATF R.16 / IVMS 101
 *
 * Endpoints :
 *   generate    — génère et envoie un message IVMS 101 pour une transaction
 *   getByTxRef  — récupère un message par référence de transaction
 *   getById     — récupère un message par messageId
 *   pending     — liste les messages en attente / en échec
 *   stats       — statistiques globales
 *   retry       — retenté un message échoué
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, analystProc, complianceProc } from "../../_core/trpc";
import {
  processTravelRule,
  getTravelRuleByTransactionRef,
  getTravelRuleById,
  getPendingTravelRules,
  getTravelRuleStats,
} from "./travel-rule.service";

export const travelRuleRouter = router({

  /**
   * Génère + envoie un message IVMS 101 pour une transaction existante
   * Usage : bouton "Envoyer Travel Rule" depuis la vue transaction
   */
  generate: complianceProc
    .input(z.object({
      transactionDbId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const record = await processTravelRule(input.transactionDbId);
      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transaction introuvable ou Travel Rule non requise (< seuil)",
        });
      }
      return record;
    }),

  /**
   * Récupère un message IVMS 101 par référence de transaction
   */
  getByTxRef: analystProc
    .input(z.object({ txRef: z.string().min(1) }))
    .query(async ({ input }) => {
      const record = await getTravelRuleByTransactionRef(input.txRef);
      if (!record) return null;
      return record;
    }),

  /**
   * Récupère un message IVMS 101 par son messageId
   */
  getById: analystProc
    .input(z.object({ messageId: z.string().min(1) }))
    .query(async ({ input }) => {
      const record = await getTravelRuleById(input.messageId);
      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message Travel Rule introuvable" });
      }
      return record;
    }),

  /**
   * Liste les messages IVMS 101 en attente / en échec
   * Limité aux 200 premiers par performance
   */
  pending: analystProc
    .query(async () => {
      return getPendingTravelRules();
    }),

  /**
   * Statistiques globales Travel Rule
   */
  stats: analystProc
    .query(async () => {
      return getTravelRuleStats();
    }),

});
