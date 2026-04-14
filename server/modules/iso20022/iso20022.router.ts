/**
 * tRPC Router — ISO 20022 (pacs.008 + camt.053)
 *
 * Obligatoire BAM Maroc — deadline fin 2025
 * Référence : BAM Circulaire 5/W/2023 + Mémorandum ISO 20022 Migration 2024
 *
 * Endpoints :
 *   generatePacs008     — virement créditeur FI-to-FI
 *   generateCamt053     — relevé de compte périodique
 *   txToPacs008         — convertit une transaction existante en pacs.008
 *   statementForAccount — génère un relevé camt.053 pour un compte sur une période
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, between, eq } from "drizzle-orm";
import { router, analystProc, complianceProc } from "../../_core/trpc";
import { db } from "../../_core/db";
import { transactions, customers } from "../../../drizzle/schema";
import {
  generatePacs008,
  transactionToPacs008,
  type Pacs008Input,
} from "./iso20022.pacs008";
import {
  generateCamt053,
  type Camt053Transaction,
} from "./iso20022.camt053";
import { ENV } from "../../_core/env";

// ─── Schémas Zod ─────────────────────────────────────────────────────────────

const Pacs008PartySchema = z.object({
  name:     z.string().min(1).max(140),
  iban:     z.string().optional(),
  bic:      z.string().optional(),
  country:  z.string().length(2),
  address:  z.string().max(70).optional(),
});

const Pacs008InputSchema = z.object({
  messageId:       z.string().max(35),
  endToEndId:      z.string().max(35),
  amount:          z.number().positive(),
  currency:        z.string().length(3),
  settlementDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  debtor:          Pacs008PartySchema,
  debtorAgent:     z.object({ bic: z.string(), name: z.string(), country: z.string().length(2) }),
  creditor:        Pacs008PartySchema,
  creditorAgent:   z.object({ bic: z.string(), name: z.string(), country: z.string().length(2) }),
  purpose:         z.string().max(4).optional(),
  remittanceInfo:  z.string().max(140).optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const iso20022Router = router({

  /**
   * Génère un message pacs.008 (FI-to-FI credit transfer) depuis les données fournies
   */
  generatePacs008: complianceProc
    .input(Pacs008InputSchema)
    .mutation(({ input }) => {
      const result = generatePacs008(input as Pacs008Input);
      return {
        xml:           result.xml,
        messageId:     result.messageId,
        uetr:          result.uetr,
        checksum:      result.checksum,
        generatedAt:   result.generatedAt.toISOString(),
        schemaVersion: result.schemaVersion,
      };
    }),

  /**
   * Convertit une transaction existante en pacs.008 et retourne le XML
   */
  txToPacs008: complianceProc
    .input(z.object({
      transactionDbId: z.number().int().positive(),
      ownBic:          z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [tx] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, input.transactionDbId))
        .limit(1);

      if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction introuvable" });

      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, tx.customerId))
        .limit(1);

      const originatorName = customer
        ? `${customer.firstName} ${customer.lastName}`
        : "CLIENT INCONNU";

      const pacs008Input = transactionToPacs008(tx, originatorName, input.ownBic);
      const result       = generatePacs008(pacs008Input);

      return {
        xml:           result.xml,
        messageId:     result.messageId,
        uetr:          result.uetr,
        checksum:      result.checksum,
        generatedAt:   result.generatedAt.toISOString(),
        schemaVersion: result.schemaVersion,
        transactionRef: tx.transactionId,
      };
    }),

  /**
   * Génère un relevé camt.053 pour un compte (customerId) sur une période
   */
  statementForAccount: complianceProc
    .input(z.object({
      customerId:  z.number().int().positive(),
      fromDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      toDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      currency:    z.string().length(3).default("MAD"),
    }))
    .query(async ({ input }) => {
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, input.customerId))
        .limit(1);

      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable" });

      const from = new Date(`${input.fromDate}T00:00:00Z`);
      const to   = new Date(`${input.toDate}T23:59:59Z`);

      const txList = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.customerId, input.customerId),
            between(transactions.transactionDate, from, to),
          )
        )
        .limit(500);

      const camt053Txs: Camt053Transaction[] = txList.map(tx => ({
        id:          tx.transactionId,
        amount:      Math.abs(Number(tx.amount)),
        currency:    tx.currency ?? input.currency,
        direction:   tx.transactionType?.includes("DEBIT") ? "DBIT" as const : "CRDT" as const,
        bookingDate: tx.transactionDate.toISOString().slice(0, 10),
        valueDate:   tx.transactionDate.toISOString().slice(0, 10),
        status:      "BOOK" as const,
        endToEndId:  tx.transactionId,
        ...(tx.transactionType ? { description: tx.transactionType } : {}),
        ...(tx.counterparty    ? { counterparty: tx.counterparty }   : {}),
      }));

      const credits = camt053Txs.filter(t => t.direction === "CRDT").reduce((s, t) => s + t.amount, 0);
      const debits  = camt053Txs.filter(t => t.direction === "DBIT").reduce((s, t) => s + t.amount, 0);

      const result = generateCamt053({
        statementId:     `STMT-${customer.customerId}-${input.fromDate}`,
        accountId:       `ACCT-${customer.customerId}`,
        accountName:     `${customer.firstName} ${customer.lastName}`,
        currency:        input.currency,
        fromDate:        input.fromDate,
        toDate:          input.toDate,
        openingBalance:  0,
        closingBalance:  credits - debits,
        transactions:    camt053Txs as Camt053Transaction[],
      });

      return {
        xml:              result.xml,
        messageId:        result.messageId,
        checksum:         result.checksum,
        generatedAt:      result.generatedAt.toISOString(),
        schemaVersion:    result.schemaVersion,
        transactionCount: result.transactionCount,
        accountName:      `${customer.firstName} ${customer.lastName}`,
        period:           { from: input.fromDate, to: input.toDate },
      };
    }),

  /**
   * Génère un relevé camt.053 depuis des données fournies librement
   */
  generateCamt053: complianceProc
    .input(z.object({
      statementId:    z.string().max(35),
      accountId:      z.string().max(34),
      accountName:    z.string().max(70).optional(),
      currency:       z.string().length(3),
      fromDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      toDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      openingBalance: z.number(),
      closingBalance: z.number(),
      transactions: z.array(z.object({
        id:           z.string(),
        amount:       z.number().positive(),
        currency:     z.string().length(3),
        direction:    z.enum(["CRDT", "DBIT"]),
        bookingDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        valueDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        status:       z.enum(["BOOK", "PDNG"]),
        endToEndId:   z.string().max(35),
        description:  z.string().max(140).optional(),
        counterparty: z.string().max(140).optional(),
      })).max(1000),
    }))
    .mutation(({ input }) => {
      const { accountName, ...rest } = input;
      const result = generateCamt053({
        ...rest,
        ...(accountName ? { accountName } : {}),
        transactions: input.transactions as Camt053Transaction[],
      });
      return {
        xml:              result.xml,
        messageId:        result.messageId,
        checksum:         result.checksum,
        generatedAt:      result.generatedAt.toISOString(),
        schemaVersion:    result.schemaVersion,
        transactionCount: result.transactionCount,
      };
    }),

  /**
   * Informations sur la version schema ISO 20022 supportée
   */
  schemaInfo: analystProc
    .query(() => ({
      institution:      ENV.INSTITUTION_NAME,
      supportedSchemas: ["pacs.008.001.08", "camt.053.001.08"],
      bamDeadline:      "2025-12-31",
      referenceDoc:     "BAM Circulaire 5/W/2023 + Mémorandum ISO 20022 Migration 2024",
    })),
});
