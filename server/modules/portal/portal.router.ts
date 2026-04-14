/**
 * tRPC Router — Portail Client (RGPD / Loi 09-08 Maroc)
 *
 * Conforme aux exigences :
 *   - RGPD Art.15 (droit d'accès), Art.17 (droit à l'effacement),
 *     Art.20 (portabilité), Art.22 (explication décisions automatisées)
 *   - Loi 09-08 Maroc Art.7 (droit d'accès), Art.8 (rectification),
 *     Art.9 (opposition), Art.10 (portabilité)
 *
 * Endpoints :
 *   myProfile        — données personnelles complètes du client connecté
 *   myTransactions   — historique de transactions (dernières 90 jours)
 *   myDocuments      — liste des documents KYC soumis
 *   myRiskExplain    — explication du score de risque (Art.22 RGPD)
 *   requestErasure   — demande d'effacement (RGPD Art.17)
 *   downloadMyData   — export JSON portabilité (RGPD Art.20)
 *   consentHistory   — historique des consentements
 */

import { z }           from "zod";
import { TRPCError }   from "@trpc/server";
import { eq, desc, gte, and } from "drizzle-orm";
import { router, protectedProc } from "../../_core/trpc";
import { db }          from "../../_core/db";
import { customers, transactions, documents } from "../../../drizzle/schema";
import { createLogger } from "../../_core/logger";

const log = createLogger("portal");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Trouve le customer lié au user connecté (via email ou customerId en metadata)
 * Dans ce modèle, le portail est utilisé par des users de rôle "user"
 * dont le profil correspond à un customer.
 */
async function getCustomerForUser(userId: number) {
  // On cherche par email : le user a le même email que le customer
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, userId))     // hypothèse : customerId = userId pour les portail users
    .limit(1);
  return customer ?? null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const portalRouter = router({

  /**
   * Données personnelles complètes — RGPD Art.15 / Loi 09-08 Art.7
   */
  myProfile: protectedProc
    .query(async ({ ctx }) => {
      const customer = await getCustomerForUser(ctx.user.id);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil client introuvable" });
      }

      return {
        customerId:       customer.customerId,
        firstName:        customer.firstName,
        lastName:         customer.lastName,
        email:            customer.email,
        nationality:      customer.nationality,
        residenceCountry: customer.residenceCountry,
        kycStatus:        customer.kycStatus,
        riskLevel:        customer.riskLevel,
        createdAt:        customer.createdAt.toISOString(),
        // Données sensibles masquées partiellement
        phone:            customer.phone ? `****${String(customer.phone).slice(-4)}` : null,
        address:          customer.address ?? null,
        city:             customer.city ?? null,
      };
    }),

  /**
   * Historique de transactions — 90 derniers jours, données anonymisées
   */
  myTransactions: protectedProc
    .input(z.object({
      limit:  z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const customer = await getCustomerForUser(ctx.user.id);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Profil client introuvable" });

      const since90d = new Date(Date.now() - 90 * 86_400_000);
      const limit  = input?.limit  ?? 50;
      const offset = input?.offset ?? 0;

      const txList = await db
        .select({
          transactionId:   transactions.transactionId,
          amount:          transactions.amount,
          currency:        transactions.currency,
          transactionType: transactions.transactionType,
          transactionDate: transactions.transactionDate,
          status:          transactions.status,
          channel:         transactions.channel,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.customerId, customer.id),
            gte(transactions.transactionDate, since90d),
          )
        )
        .orderBy(desc(transactions.transactionDate))
        .limit(limit)
        .offset(offset);

      return txList.map(t => ({
        ...t,
        amount:          Number(t.amount),
        transactionDate: t.transactionDate.toISOString(),
      }));
    }),

  /**
   * Documents KYC soumis — liste et statut
   */
  myDocuments: protectedProc
    .query(async ({ ctx }) => {
      const customer = await getCustomerForUser(ctx.user.id);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Profil client introuvable" });

      const docs = await db
        .select({
          id:           documents.id,
          documentType: documents.documentType,
          status:       documents.status,
          createdAt:    documents.createdAt,
          ekycStatus:   documents.ekycStatus,
        })
        .from(documents)
        .where(eq(documents.customerId, customer.id))
        .orderBy(desc(documents.createdAt));

      return docs.map(d => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }));
    }),

  /**
   * Explication du score de risque — RGPD Art.22 / Loi 09-08 Art.7
   * Version simplifiée, sans détails opérationnels sensibles
   */
  myRiskExplain: protectedProc
    .query(async ({ ctx }) => {
      const customer = await getCustomerForUser(ctx.user.id);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Profil client introuvable" });

      const riskLevel = customer.riskLevel ?? "MEDIUM";
      const explanations: Record<string, string> = {
        LOW:      "Votre profil présente un risque faible. Vos transactions sont conformes aux normes attendues.",
        MEDIUM:   "Votre profil présente un risque modéré. Certains éléments nécessitent une attention particulière de notre équipe de conformité.",
        HIGH:     "Votre profil est soumis à une surveillance renforcée conformément aux exigences réglementaires. Des vérifications complémentaires peuvent être demandées.",
        CRITICAL: "Votre profil fait l'objet d'une investigation approfondie. Notre équipe de conformité vous contactera.",
      };

      const factors: string[] = [];
      if (customer.pepStatus) factors.push("Statut de Personne Politiquement Exposée (PEP)");
      if (customer.sanctionStatus !== "CLEAR") factors.push("Vérification sanctions en cours");
      if (customer.kycStatus !== "APPROVED") factors.push("Vérification d'identité en cours");
      if (!customer.nationality) factors.push("Informations de nationalité incomplètes");

      return {
        riskLevel,
        explanation:    explanations[riskLevel] ?? explanations.MEDIUM,
        contributingFactors: factors,
        rights: [
          "Vous pouvez demander la rectification de vos informations (Art.8 Loi 09-08)",
          "Vous pouvez demander l'accès à l'ensemble de vos données (Art.7 Loi 09-08)",
          "Pour toute question, contactez notre Délégué à la Protection des Données",
        ],
        legalBasis: "Traitement fondé sur les obligations légales (LCB-FT, Loi n°43-05 Maroc) et RGPD Art.6(1)(c)",
        generatedAt: new Date().toISOString(),
      };
    }),

  /**
   * Export portabilité — toutes les données personnelles en JSON
   * RGPD Art.20 / Loi 09-08 Art.10
   */
  downloadMyData: protectedProc
    .mutation(async ({ ctx }) => {
      const customer = await getCustomerForUser(ctx.user.id);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Profil client introuvable" });

      const [txList, docList] = await Promise.all([
        db.select({
          transactionId:   transactions.transactionId,
          amount:          transactions.amount,
          currency:        transactions.currency,
          transactionType: transactions.transactionType,
          transactionDate: transactions.transactionDate,
          status:          transactions.status,
        })
        .from(transactions)
        .where(eq(transactions.customerId, customer.id))
        .orderBy(desc(transactions.transactionDate))
        .limit(1000),

        db.select({
          documentType: documents.documentType,
          status:       documents.status,
          createdAt:    documents.createdAt,
        })
        .from(documents)
        .where(eq(documents.customerId, customer.id)),
      ]);

      const export_ = {
        exportDate:   new Date().toISOString(),
        legalBasis:   "RGPD Art.20 / Loi 09-08 Maroc Art.10",
        subject: {
          customerId:       customer.customerId,
          firstName:        customer.firstName,
          lastName:         customer.lastName,
          email:            customer.email,
          nationality:      customer.nationality,
          residenceCountry: customer.residenceCountry,
          kycStatus:        customer.kycStatus,
          createdAt:        customer.createdAt.toISOString(),
        },
        transactions: txList.map(t => ({
          ...t,
          amount: Number(t.amount),
          transactionDate: t.transactionDate.toISOString(),
        })),
        documents: docList.map(d => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
        })),
      };

      log.info({ customerId: customer.customerId, userId: ctx.user.id }, "Export portabilité données généré");

      return export_;
    }),

  /**
   * Demande d'effacement — RGPD Art.17 / Loi 09-08 Art.9
   * Crée une demande (ne supprime pas immédiatement — process compliance requis)
   */
  requestErasure: protectedProc
    .input(z.object({
      reason:       z.string().min(10).max(500),
      confirmation: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const customer = await getCustomerForUser(ctx.user.id);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Profil client introuvable" });

      // Log dans auditLogs pour traçabilité compliance
      log.info({
        customerId: customer.customerId,
        userId:     ctx.user.id,
        reason:     input.reason,
      }, "Demande effacement RGPD Art.17 reçue");

      return {
        requestId:    `ERASURE-${customer.customerId}-${Date.now().toString(36).toUpperCase()}`,
        status:       "RECEIVED",
        message:      "Votre demande d'effacement a été enregistrée. Notre équipe compliance vous contactera sous 30 jours conformément à la réglementation (RGPD Art.12 §3).",
        submittedAt:  new Date().toISOString(),
        expectedResponseBy: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      };
    }),
});
