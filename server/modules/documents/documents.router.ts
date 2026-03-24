import { z } from "zod";
import { router, analystProc, supervisorProc, complianceProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  getDocument, getCustomerDocuments, getDocumentStats,
  manuallyVerifyDocument, rejectDocument, removeDocument,
} from "./documents.service";

export const documentsRouter = router({

  /** Documents d'un client — analyst+ */
  getByCustomer: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input }) => getCustomerDocuments(input.customerId)),

  /** Détail d'un document (avec URL signée si S3) — analyst+ */
  getById: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => getDocument(input.id)),

  /** Stats documents par client — analyst+ */
  stats: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input }) => getDocumentStats(input.customerId)),

  /** Vérifier manuellement un document — supervisor+ */
  verify: supervisorProc
    .input(z.object({
      id:    z.number().int().positive(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const doc = await manuallyVerifyDocument(input.id, ctx.user.id, input.notes);
      await log({
        action: "REPORT_APPROVED", entityType: "document",
        entityId: String(input.id),
        details: { action: "manual_verify", notes: input.notes },
      });
      return doc;
    }),

  /** Rejeter un document — supervisor+ */
  reject: supervisorProc
    .input(z.object({
      id:     z.number().int().positive(),
      reason: z.string().min(5, "Motif requis"),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const doc = await rejectDocument(input.id, input.reason);
      await log({
        action: "REPORT_REJECTED", entityType: "document",
        entityId: String(input.id),
        details: { reason: input.reason },
      });
      return doc;
    }),

  /** Supprimer un document — compliance+ */
  remove: complianceProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      await removeDocument(input.id);
      await log({
        action: "REPORT_STATUS_CHANGED", entityType: "document",
        entityId: String(input.id),
        details: { action: "deleted" },
      });
      return { success: true };
    }),
});
