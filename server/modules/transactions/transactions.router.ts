import { z } from "zod";
import { router, analystProc, supervisorProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import { parseTransactionFile } from "./transactions.import";
import {
  listTransactions,
  getTransactionOrThrow,
  createTransaction,
  completeTransaction,
  blockTransaction,
  getTransactionStats,
  getAlertsByCustomer,
} from "./transactions.service";

const transactionTypeEnum = z.enum(["TRANSFER", "DEPOSIT", "WITHDRAWAL", "PAYMENT", "EXCHANGE"]);
const channelEnum = z.enum(["ONLINE", "MOBILE", "BRANCH", "ATM", "API"]);
const transactionStatusEnum = z.enum(["PENDING", "COMPLETED", "FLAGGED", "BLOCKED", "REVERSED"]);

export const transactionsRouter = router({

  /**
   * Liste paginée avec filtres — analyst+
   */
  list: analystProc
    .input(z.object({
      page:          z.number().int().positive().default(1),
      limit:         z.number().int().min(1).max(100).default(20),
      customerId:    z.number().int().positive().optional(),
      status:        transactionStatusEnum.optional(),
      isSuspicious:  z.boolean().optional(),
      dateFrom:      z.string().datetime().optional(),
      dateTo:        z.string().datetime().optional(),
      amountMin:     z.number().positive().optional(),
      amountMax:     z.number().positive().optional(),
      search:        z.string().max(100).optional(),
    }))
    .query(async ({ input }) => {
      return listTransactions({
        page:         input.page,
        limit:        input.limit,
        ...(input.customerId    !== undefined && { customerId:   input.customerId }),
        ...(input.status        !== undefined && { status:       input.status }),
        ...(input.isSuspicious  !== undefined && { isSuspicious: input.isSuspicious }),
        ...(input.amountMin     !== undefined && { amountMin:    input.amountMin }),
        ...(input.amountMax     !== undefined && { amountMax:    input.amountMax }),
        ...(input.dateFrom      !== undefined && { dateFrom:     new Date(input.dateFrom) }),
        ...(input.dateTo        !== undefined && { dateTo:       new Date(input.dateTo) }),
        ...(input.search        !== undefined && { search:       input.search }),
      });
    }),

  /**
   * Détail d'une transaction — analyst+
   */
  getById: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getTransactionOrThrow(input.id);
    }),

  /**
   * Créer une transaction + déclenchement AML automatique — analyst+
   */
  create: analystProc
    .input(z.object({
      customerId:          z.number().int().positive(),
      amount:              z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant invalide"),
      currency:            z.string().length(3).default("EUR"),
      transactionType:     transactionTypeEnum,
      channel:             channelEnum.default("ONLINE"),
      counterparty:        z.string().max(200).optional(),
      counterpartyCountry: z.string().max(10).optional(),
      counterpartyBank:    z.string().max(200).optional(),
      purpose:             z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);

      const tx = await createTransaction(input);

      await log({
        action: "TRANSACTION_CREATED",
        entityType: "transaction",
        entityId: tx.transactionId,
        details: {
          amount: tx.amount,
          currency: tx.currency,
          transactionType: tx.transactionType,
          customerId: tx.customerId,
        },
      });

      return tx;
    }),

  /**
   * Marquer complétée — analyst+
   */
  complete: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const tx = await completeTransaction(input.id);

      await log({
        action: "TRANSACTION_CREATED",
        entityType: "transaction",
        entityId: tx.transactionId,
        details: { status: "COMPLETED" },
      });

      return tx;
    }),

  /**
   * Bloquer manuellement — supervisor+
   */
  block: supervisorProc
    .input(z.object({
      id:     z.number().int().positive(),
      reason: z.string().min(10, "Raison requise (min 10 caractères)"),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const tx = await blockTransaction(input.id, input.reason);

      await log({
        action: "TRANSACTION_BLOCKED",
        entityType: "transaction",
        entityId: tx.transactionId,
        details: { reason: input.reason },
      });

      return tx;
    }),

  /**
   * Statistiques globales — analyst+
   */
  stats: analystProc
    .query(async () => getTransactionStats()),

  /**
   * Alertes d'un client — analyst+
   */
  getAlertsByCustomer: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getAlertsByCustomer(input.customerId);
    }),

  /**
   * Importer des transactions depuis CSV ou SWIFT MT940 — supervisor+
   * Le contenu du fichier est passé en base64 (tRPC ne supporte pas les binaires)
   */
  importFile: supervisorProc
    .input(z.object({
      customerId: z.number().int().positive(),
      content:    z.string().min(1),      // contenu du fichier en texte (CSV ou MT940)
      dryRun:     z.boolean().default(true), // si true, parse sans insérer
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);

      // Parser le fichier
      const parseResult = parseTransactionFile(input.content);

      if (parseResult.format === "unknown") {
        return { success: false, parseResult, inserted: 0 };
      }

      let inserted = 0;
      const insertErrors: Array<{ ref: string; error: string }> = [];

      if (!input.dryRun) {
        for (const tx of parseResult.transactions) {
          try {
            await createTransaction({
              customerId:      input.customerId,
              amount:          tx.amount,
              currency:        tx.currency,
              transactionType: tx.transactionType,
              ...(tx.counterparty     ? { counterparty:     tx.counterparty }     : {}),
              ...(tx.counterpartyBank ? { counterpartyBank: tx.counterpartyBank } : {}),
              ...(tx.purpose          ? { purpose:          tx.purpose }          : {}),
              ...(tx.transactionDate  ? { transactionDate:  tx.transactionDate }  : {}),
            });
            inserted++;
          } catch (err) {
            insertErrors.push({ ref: tx.externalRef, error: String(err) });
          }
        }

        await log({
          action:     "REPORT_STATUS_CHANGED",
          entityType: "transaction",
          entityId:   `import:${parseResult.format}`,
          details: {
            format: parseResult.format, customerId: input.customerId,
            total: parseResult.total, parsed: parseResult.parsed, inserted,
          },
        });
      }

      return {
        success:     true,
        parseResult: { ...parseResult, transactions: undefined }, // ne pas renvoyer toutes les lignes
        preview:     parseResult.transactions.slice(0, 5),        // aperçu 5 premières
        inserted,
        insertErrors: insertErrors.slice(0, 10),
      };
    }),
});
