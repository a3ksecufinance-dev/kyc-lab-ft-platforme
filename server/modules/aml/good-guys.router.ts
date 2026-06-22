import { z } from "zod";
import { router, analystProc, supervisorProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  getAllGoodGuys,
  addToGoodGuys,
  revokeGoodGuys,
  isCustomerExcluded,
} from "./good-guys.repository";

export const goodGuysRouter = router({
  list: analystProc
    .input(z.object({ page: z.number().min(1).default(1), limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ input }) => {
      const { page, limit } = input ?? { page: 1, limit: 20 };
      return getAllGoodGuys(page, limit);
    }),

  checkExcluded: analystProc
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      return { excluded: await isCustomerExcluded(input.customerId) };
    }),

  add: supervisorProc
    .input(z.object({
      customerId: z.number(),
      reason: z.string().min(10, "Motif requis (min 10 caractères)"),
      category: z.enum(["TRUSTED", "INSTITUTIONAL", "GOVERNMENT", "REGULATORY", "TEMPORARY"]).default("TRUSTED"),
      validUntil: z.string().datetime().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const auditLog = createAuditFromContext(ctx);
      const entry = await addToGoodGuys({
        customerId: input.customerId,
        reason: input.reason,
        category: input.category,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        addedBy: ctx.user!.id!,
      });
      await auditLog({
        action: "SYSTEM_CONFIG_UPDATED",
        entityType: "customer",
        entityId: input.customerId,
        details: { action: "GOOD_GUYS_ADD", reason: input.reason, category: input.category },
      });
      return entry;
    }),

  revoke: supervisorProc
    .input(z.object({
      id: z.number(),
      reason: z.string().min(10, "Motif de révocation requis"),
    }))
    .mutation(async ({ ctx, input }) => {
      const auditLog = createAuditFromContext(ctx);
      const entry = await revokeGoodGuys(input.id, ctx.user!.id!, input.reason);
      await auditLog({
        action: "SYSTEM_CONFIG_UPDATED",
        entityType: "customer",
        entityId: entry?.customerId ?? null,
        details: { action: "GOOD_GUYS_REVOKE", reason: input.reason },
      });
      return entry;
    }),
});
