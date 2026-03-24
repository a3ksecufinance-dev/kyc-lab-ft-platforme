import { z } from "zod";
import { router, analystProc, supervisorProc, complianceProc, adminProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import { redis, RedisKeys } from "../../_core/redis";
import { createLogger } from "../../_core/logger";
import {
  screenCustomer,
  reviewScreeningResult,
  getCustomerScreenings,
  getPendingScreenings,
} from "./screening.service";
import { forceRefresh } from "./screening.scheduler";

export const screeningRouter = router({

  run: analystProc
    .input(z.object({
      customerId:   z.number().int().positive(),
      customerName: z.string().min(2, "Nom requis"),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const result = await screenCustomer(input.customerId, input.customerName);

      await log({
        action: "SCREENING_RUN", entityType: "screening",
        entityId: String(input.customerId),
        details: {
          status:  result.status,
          score:   result.sanctionsResult.matchScore,
          matched: result.sanctionsResult.matchedEntity,
        },
      });

      if (result.status === "MATCH") {
        await log({
          action: "SCREENING_MATCH_FOUND", entityType: "customer",
          entityId: String(input.customerId),
          details: {
            matchedEntity: result.sanctionsResult.matchedEntity,
            score:         result.sanctionsResult.matchScore,
            listSource:    result.sanctionsResult.listSource,
          },
        });
      }

      return result;
    }),

  getByCustomer: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input }) => getCustomerScreenings(input.customerId)),

  getPending: complianceProc
    .query(async () => getPendingScreenings()),

  review: complianceProc
    .input(z.object({
      id:       z.number().int().positive(),
      decision: z.enum(["CONFIRMED", "DISMISSED", "ESCALATED"]),
      reason:   z.string().min(10, "Justification requise (min 10 caractères)"),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const result = await reviewScreeningResult(input.id, input.decision, ctx.user.id, input.reason);

      await log({
        action: input.decision === "CONFIRMED"  ? "SCREENING_DECISION_CONFIRMED"
               : input.decision === "DISMISSED" ? "SCREENING_DECISION_DISMISSED"
               : "SCREENING_DECISION_ESCALATED",
        entityType: "screening", entityId: String(result.id),
        details: { decision: input.decision, reason: input.reason },
      });

      return result;
    }),

  // ── Admin — gestion des listes ─────────────────────────────────────────────

  listsStatus: supervisorProc
    .query(async () => {
      const providers = ["OFAC", "EU", "UN", "UK"];
      const statuses = await Promise.all(
        providers.map(async (p) => {
          const key       = p.toLowerCase();
          const lastUpdate = await redis.get(RedisKeys.screeningLastUpdate(key)).catch(() => null);
          const count      = await redis.get(RedisKeys.screeningListCount(key)).catch(() => null);
          return {
            provider:   p,
            count:      count ? parseInt(count, 10) : 0,
            lastUpdate,
            inCache:    count !== null,
          };
        })
      );

      const globalStatus = await redis.get(RedisKeys.screeningListStatus()).catch(() => null);
      const global = globalStatus ? (JSON.parse(globalStatus) as { updatedAt: string; total: number }) : null;

      return {
        providers: statuses,
        total:     global?.total ?? statuses.reduce((s, p) => s + p.count, 0),
        updatedAt: global?.updatedAt ?? null,
      };
    }),

  forceRefresh: adminProc
    .mutation(async ({ ctx }) => {
      const log = createAuditFromContext(ctx);
      const result = await forceRefresh();

      await log({
        action: "SCREENING_RUN", entityType: "system", entityId: "sanctions_lists",
        details: { action: "force_refresh", total: result.totalCount },
      });

      return {
        total:    result.totalCount,
        statuses: result.statuses,
        refreshedAt: new Date().toISOString(),
      };
    }),

  // ── Liste personnalisée (entrées manuelles) ────────────────────────────────

  getCustomList: supervisorProc
    .query(async () => {
      const data = await redis.get(RedisKeys.screeningCustomList()).catch(() => null);
      return (data ? JSON.parse(data) : []) as Array<{
        id: string; name: string; aliases: string[];
        country: string; reason: string; addedAt: string; addedBy: string;
      }>;
    }),

  addCustomEntry: supervisorProc
    .input(z.object({
      name:    z.string().min(2).max(200),
      aliases: z.array(z.string()).default([]),
      country: z.string().length(2).toUpperCase().optional(),
      reason:  z.string().min(5).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const existing = await redis.get(RedisKeys.screeningCustomList()).catch(() => null);
      const list = existing ? JSON.parse(existing) as unknown[] : [];

      const entry = {
        id:       `CUSTOM-${Date.now()}`,
        name:     input.name,
        aliases:  input.aliases,
        country:  input.country ?? "",
        reason:   input.reason,
        addedAt:  new Date().toISOString(),
        addedBy:  ctx.user.id,
      };

      (list as unknown[]).push(entry);
      await redis.set(RedisKeys.screeningCustomList(), JSON.stringify(list));
      await redis.set(RedisKeys.screeningLastUpdate("custom"), new Date().toISOString());
      await redis.set(RedisKeys.screeningListCount("custom"), String(list.length));

      await log({
        action: "SCREENING_RUN", entityType: "screening", entityId: entry.id,
        details: { action: "custom_entry_added", name: entry.name },
      });

      return entry;
    }),

  removeCustomEntry: supervisorProc
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const existing = await redis.get(RedisKeys.screeningCustomList()).catch(() => null);
      if (!existing) return { removed: false };

      const list = JSON.parse(existing) as Array<{ id: string }>;
      const filtered = list.filter(e => e.id !== input.id);
      await redis.set(RedisKeys.screeningCustomList(), JSON.stringify(filtered));
      await redis.set(RedisKeys.screeningListCount("custom"), String(filtered.length));

      await log({
        action: "SCREENING_RUN", entityType: "screening", entityId: input.id,
        details: { action: "custom_entry_removed" },
      });

      return { removed: true };
    }),

  /**
   * Screening en masse — re-screener tous les clients actifs — compliance+
   * Lance un job asynchrone, retourne immédiatement avec un jobId
   */
  batchScreen: complianceProc
    .input(z.object({
      onlyHighRisk:     z.boolean().default(false),
      onlyPep:          z.boolean().default(false),
      sinceLastScreen:  z.number().int().positive().optional(), // jours depuis dernier screening
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const jobId = `batch:${Date.now()}`;

      // Démarrer en asynchrone
      void runBatchScreening(jobId, input, ctx.user.id);

      await log({
        action: "SCREENING_RUN", entityType: "screening", entityId: jobId,
        details: { type: "batch", ...input },
      });

      return { jobId, message: "Screening en masse démarré — vérifiez batchStatus pour le résultat" };
    }),

  /** Statut d'un job de batch screening */
  batchStatus: complianceProc
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const status = await redis.get(`${input.jobId}:status`).catch(() => null);
      const result = await redis.get(`${input.jobId}:result`).catch(() => null);
      return {
        jobId:  input.jobId,
        status: status ?? "unknown",
        result: result ? JSON.parse(result) as object : null,
      };
    }),
});

// ─── Job asynchrone batch screening ──────────────────────────────────────────

async function runBatchScreening(
  jobId:  string,
  input:  { onlyHighRisk: boolean; onlyPep: boolean; sinceLastScreen?: number | undefined },
  _userId: number,
): Promise<void> {
  const log = createLogger("screening-batch");

  try {
    await redis.set(`${jobId}:status`, "running", "EX", 3600);
    log.info({ jobId }, "Batch screening démarré");

    // Charger les clients selon les filtres
    const { db } = await import("../../_core/db");
    const { customers } = await import("../../../drizzle/schema");
    const { eq, and, inArray } = await import("drizzle-orm");

    const { ne } = await import("drizzle-orm");
    const conditions: Parameters<typeof and>[0][] = [
      ne(customers.kycStatus, "REJECTED"),
    ];
    if (input.onlyHighRisk) {
      conditions.push(inArray(customers.riskLevel, ["HIGH", "CRITICAL"]));
    }
    if (input.onlyPep) {
      conditions.push(eq(customers.pepStatus, true));
    }

    // Construire la clause where — and() avec 1+ conditions
    const whereClause = and(...conditions);

    const clientList = await db
      .select({
        id:        customers.id,
        firstName: customers.firstName,
        lastName:  customers.lastName,
      })
      .from(customers)
      .where(whereClause);

    const total     = clientList.length;
    let processed   = 0;
    let newMatches  = 0;
    let errors      = 0;

    for (const client of clientList) {
      try {
        const name   = `${client.firstName} ${client.lastName}`;
        const result = await screenCustomer(client.id, name);
        processed++;
        if (result.status === "MATCH") newMatches++;

        // Mettre à jour le progrès toutes les 10 itérations
        if (processed % 10 === 0) {
          await redis.set(`${jobId}:status`, `running:${processed}/${total}`, "EX", 3600);
        }
      } catch {
        errors++;
      }
    }

    const summary = { total, processed, newMatches, errors, completedAt: new Date().toISOString() };
    await redis.set(`${jobId}:status`, "completed", "EX", 86400);
    await redis.set(`${jobId}:result`, JSON.stringify(summary), "EX", 86400);

    log.info({ jobId, ...summary }, "Batch screening terminé");

  } catch (err) {
    log.error({ err, jobId }, "Erreur batch screening");
    await redis.set(`${jobId}:status`, "failed", "EX", 3600);
  }
}
