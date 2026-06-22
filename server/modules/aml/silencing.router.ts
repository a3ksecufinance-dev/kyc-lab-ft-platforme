import { z } from "zod";
import { router, analystProc, supervisorProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  getAllSilencingRules,
  createSilencingRule,
  revokeSilencingRule,
} from "./silencing.repository";

export const silencingRouter = router({
  list: analystProc
    .input(z.object({ page: z.number().min(1).default(1), limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      return getAllSilencingRules(input.page, input.limit);
    }),

  create: supervisorProc
    .input(z.object({
      name: z.string().min(3),
      description: z.string().nullable().optional(),
      matchers: z.record(z.string(), z.unknown()).refine(obj => Object.keys(obj).length > 0, "Au moins un critère requis"),
      validUntil: z.string().datetime(),
      validFrom: z.string().datetime().optional(),
      maxMatches: z.number().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const auditLog = createAuditFromContext(ctx);
      const rule = await createSilencingRule({
        name: input.name,
        ...(input.description != null ? { description: input.description } : {}),
        matchers: input.matchers as Record<string, unknown>,
        ...(input.validFrom ? { validFrom: new Date(input.validFrom) } : {}),
        validUntil: new Date(input.validUntil),
        ...(input.maxMatches != null ? { maxMatches: input.maxMatches } : {}),
        createdBy: ctx.user!.id!,
      });
      await auditLog({
        action: "SYSTEM_CONFIG_UPDATED",
        entityType: "system_config",
        entityId: rule?.id ?? null,
        details: { action: "SILENCING_RULE_CREATE", name: input.name, matchers: input.matchers as Record<string, unknown> },
      });
      return rule;
    }),

  revoke: supervisorProc
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const auditLog = createAuditFromContext(ctx);
      const rule = await revokeSilencingRule(input.id, ctx.user!.id!);
      await auditLog({
        action: "SYSTEM_CONFIG_UPDATED",
        entityType: "system_config",
        entityId: input.id,
        details: { action: "SILENCING_RULE_REVOKE" },
      });
      return rule;
    }),
});
