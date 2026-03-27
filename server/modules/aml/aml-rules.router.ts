import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, analystProc, supervisorProc, adminProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import { runBacktest } from "./aml-rules.backtest";
import {
  getAllRules,
  getRuleById,
  insertRule,
  updateRule,
  deleteRule,
  getRuleStats,
  getRecentExecutions,
  insertRuleFeedback,
  getRuleFalsePositiveCount,
} from "./aml-rules.repository";
import { DEFAULT_AML_RULES } from "./aml-rules.engine";
import { db } from "../../_core/db";
import { amlRules } from "../../../drizzle/schema";
import { count } from "drizzle-orm";

// ─── Schemas Zod ──────────────────────────────────────────────────────────────

const conditionSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({
      field: z.string().min(1),
      op: z.enum([">=", "<=", ">", "<", "==", "!=", "in", "not_in"]),
      value: z.union([z.number(), z.string(), z.boolean(), z.array(z.string())]),
    }),
    z.object({
      logic: z.enum(["AND", "OR"]),
      rules: z.array(conditionSchema).min(1),
    }),
  ])
);

const categoryEnum = z.enum([
  "THRESHOLD", "FREQUENCY", "PATTERN",
  "GEOGRAPHY", "COUNTERPARTY", "VELOCITY", "CUSTOMER",
]);
const statusEnum   = z.enum(["ACTIVE", "INACTIVE", "TESTING"]);
const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const alertTypeEnum = z.enum([
  "THRESHOLD", "PATTERN", "VELOCITY", "SANCTIONS", "FRAUD", "PEP", "NETWORK",
]);

// ─── Router ───────────────────────────────────────────────────────────────────

export const amlRulesRouter = router({

  // ── Lecture ──────────────────────────────────────────────────────────────────

  list: analystProc
    .query(async () => getAllRules()),

  getById: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const rule = await getRuleById(input.id);
      if (!rule) throw new Error("Règle introuvable");
      return rule;
    }),

  stats: analystProc
    .input(z.object({
      id:   z.number().int().positive(),
      days: z.number().int().min(1).max(90).default(30),
    }))
    .query(async ({ input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      return getRuleStats(input.id, since);
    }),

  recentExecutions: analystProc
    .input(z.object({
      id:    z.number().int().positive(),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) =>
      getRecentExecutions(input.id, input.limit)
    ),

  // ── Écriture ─────────────────────────────────────────────────────────────────

  create: supervisorProc
    .input(z.object({
      name:           z.string().min(3).max(200),
      description:    z.string().max(1000).optional(),
      category:       categoryEnum,
      status:         statusEnum.default("ACTIVE"),
      conditions:     conditionSchema,
      baseScore:      z.number().int().min(0).max(100).default(50),
      priority:       priorityEnum.default("MEDIUM"),
      alertType:      alertTypeEnum.default("THRESHOLD"),
      thresholdValue: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      windowMinutes:  z.number().int().positive().optional(),
      countThreshold: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const rule = await insertRule({
        name:           input.name,
        description:    input.description ?? null,
        category:       input.category,
        status:         input.status,
        conditions:     input.conditions as unknown as null,
        baseScore:      input.baseScore,
        priority:       input.priority,
        alertType:      input.alertType,
        thresholdValue: input.thresholdValue ?? null,
        windowMinutes:  input.windowMinutes ?? null,
        countThreshold: input.countThreshold ?? null,
        createdBy:      ctx.user.id,
        updatedBy:      ctx.user.id,
      });
      await log({
        action: "AML_RULE_TRIGGERED", entityType: "aml_rule",
        entityId: rule.ruleId,
        details: { action: "created", name: rule.name, status: rule.status },
      });
      return rule;
    }),

  update: supervisorProc
    .input(z.object({
      id:             z.number().int().positive(),
      name:           z.string().min(3).max(200).optional(),
      description:    z.string().max(1000).optional(),
      status:         statusEnum.optional(),
      conditions:     conditionSchema.optional(),
      baseScore:      z.number().int().min(0).max(100).optional(),
      priority:       priorityEnum.optional(),
      alertType:      alertTypeEnum.optional(),
      thresholdValue: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      windowMinutes:  z.number().int().positive().optional(),
      countThreshold: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const { id, ...updates } = input;

      const patch: Parameters<typeof updateRule>[1] = { updatedBy: ctx.user.id };
      if (updates.name           !== undefined) patch.name           = updates.name;
      if (updates.description    !== undefined) patch.description    = updates.description;
      if (updates.status         !== undefined) patch.status         = updates.status;
      if (updates.baseScore      !== undefined) patch.baseScore      = updates.baseScore;
      if (updates.priority       !== undefined) patch.priority       = updates.priority;
      if (updates.alertType      !== undefined) patch.alertType      = updates.alertType;
      if (updates.thresholdValue !== undefined) patch.thresholdValue = updates.thresholdValue;
      if (updates.windowMinutes  !== undefined) patch.windowMinutes  = updates.windowMinutes;
      if (updates.countThreshold !== undefined) patch.countThreshold = updates.countThreshold;
      if (updates.conditions     !== undefined) {
        patch.conditions = updates.conditions as unknown as null;
      }

      const rule = await updateRule(id, patch);
      await log({
        action: "AML_RULE_TRIGGERED", entityType: "aml_rule",
        entityId: rule.ruleId,
        details: { action: "updated", changes: Object.keys(updates) },
      });
      return rule;
    }),

  toggleStatus: supervisorProc
    .input(z.object({
      id:     z.number().int().positive(),
      status: statusEnum,
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const rule = await updateRule(input.id, {
        status:    input.status,
        updatedBy: ctx.user.id,
      });
      await log({
        action: "AML_RULE_TRIGGERED", entityType: "aml_rule",
        entityId: rule.ruleId,
        details: { action: "status_changed", newStatus: input.status },
      });
      return rule;
    }),

  delete: adminProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const rule = await getRuleById(input.id);
      if (!rule) throw new Error("Règle introuvable");
      await deleteRule(input.id);
      await log({
        action: "AML_RULE_TRIGGERED", entityType: "aml_rule",
        entityId: rule.ruleId,
        details: { action: "deleted", name: rule.name },
      });
      return { success: true };
    }),

  // ── Seed des règles par défaut ────────────────────────────────────────────────

  seedDefaults: adminProc
    .mutation(async ({ ctx }) => {
      const log = createAuditFromContext(ctx);
      const totalRows = await db.select({ total: count() }).from(amlRules);
      if (Number(totalRows[0]?.total ?? 0) > 0) {
        return { seeded: 0, message: "Des règles existent déjà" };
      }

      const created = await Promise.all(
        DEFAULT_AML_RULES.map((r) =>
          insertRule({
            name:           r.name,
            description:    r.description,
            category:       r.category,
            status:         r.status,
            conditions:     r.conditions as unknown as null,
            baseScore:      r.baseScore,
            priority:       r.priority,
            alertType:      r.alertType,
            thresholdValue: r.thresholdValue ?? null,
            windowMinutes:  r.windowMinutes ?? null,
            countThreshold: r.countThreshold ?? null,
            createdBy:      ctx.user.id,
            updatedBy:      ctx.user.id,
          })
        )
      );

      await log({
        action: "AML_RULE_TRIGGERED", entityType: "aml_rule",
        entityId: "seed",
        details: { action: "seeded_defaults", count: created.length },
      });

      return { seeded: created.length, message: `${created.length} règles par défaut créées` };
    }),

  // ── Backtesting ───────────────────────────────────────────────────────────────

  backtest: supervisorProc
    .input(z.object({
      ruleId:            z.number().int().positive(),
      daysPeriod:        z.number().int().min(1).max(180).default(90),
      maxTx:             z.number().int().min(100).max(10_000).default(2_000),
      compareWithActive: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const result = await runBacktest(input);
      await log({
        action:     "AML_RULE_TRIGGERED",
        entityType: "aml_rule",
        entityId:   String(input.ruleId),
        details: {
          action:      "backtest",
          daysPeriod:  input.daysPeriod,
          triggered:   result.simulation.triggered,
          triggerRate: result.simulation.triggerRate,
          durationMs:  result.durationMs,
        },
      });
      return result;
    }),

  // ── Feedback faux positifs (Sprint 5) ────────────────────────────────────────

  feedback: analystProc
    .input(z.object({
      ruleId: z.number().int().positive(),
      note:   z.string().min(10, "Note requise (min 10 caractères)"),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);

      const rule = await getRuleById(input.ruleId);
      if (!rule) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Règle introuvable" });
      }

      // Enregistrer le feedback
      await insertRuleFeedback({
        ruleId: input.ruleId,
        userId: ctx.user.id,
        note:   input.note,
        type:   "FALSE_POSITIVE",
      });

      await log({
        action:     "AML_RULE_TRIGGERED",
        entityType: "aml_rule",
        entityId:   rule.ruleId,
        details:    { action: "false_positive_reported", note: input.note },
      });

      // Rétrogradation automatique si taux FP > 20% (réévaluation tous les 10 feedbacks)
      const fpCount = await getRuleFalsePositiveCount(input.ruleId);
      if (fpCount > 0 && fpCount % 10 === 0) {
        const stats = await getRuleStats(input.ruleId);
        if (stats.totalTriggered > 0 && fpCount / stats.totalTriggered > 0.2) {
          await updateRule(input.ruleId, { status: "TESTING", updatedBy: ctx.user.id });
          await log({
            action:     "AML_RULE_TRIGGERED",
            entityType: "aml_rule",
            entityId:   rule.ruleId,
            details: {
              action:  "auto_demoted_to_testing",
              fpRate:  Math.round((fpCount / stats.totalTriggered) * 100),
              fpCount,
            },
          });
        }
      }

      return { success: true, message: "Feedback enregistré" };
    }),
});
