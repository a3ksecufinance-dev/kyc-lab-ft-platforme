import { z } from "zod";
import { router, analystProc, supervisorProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  listJurisdictions,
  getJurisdictionById,
  upsertJurisdiction,
  toggleJurisdiction,
  getEffectiveThresholds,
} from "./jurisdictions.service";

export const jurisdictionsRouter = router({

  list: analystProc
    .query(() => listJurisdictions()),

  getById: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const p = await getJurisdictionById(input.id);
      if (!p) throw new Error("Juridiction introuvable");
      return p;
    }),

  // Seuils effectifs pour un pays donné — utile pour affichage UI
  effectiveThresholds: analystProc
    .input(z.object({ countryCode: z.string().length(2) }))
    .query(({ input }) => getEffectiveThresholds(input.countryCode)),

  upsert: supervisorProc
    .input(z.object({
      jurisdictionCode: z.string().min(2).max(10).toUpperCase(),
      jurisdictionName: z.string().min(2).max(200),
      isActive:         z.boolean().default(true),

      thresholdSingleTx:   z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      thresholdStructuring: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      structuringWindowH:  z.number().int().positive().optional(),
      frequencyThreshold:  z.number().int().positive().optional(),
      cashThreshold:       z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      currencyCode:        z.string().length(3).default("EUR"),

      strMandatoryAbove:   z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      strDelayHours:       z.number().int().positive().default(24),
      sarDelayHours:       z.number().int().positive().default(72),
      enhancedDdPep:       z.boolean().default(true),
      enhancedDdHighRisk:  z.boolean().default(true),

      regulatorName:       z.string().max(200).optional(),
      regulatorCode:       z.string().max(50).optional(),
      goamlEntityType:     z.string().max(50).optional(),
      reportingFormat:     z.string().max(50).default("GOAML_2"),
      coveredCountries:    z.array(z.string().length(2)).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const result = await upsertJurisdiction({
        ...input,
        coveredCountries: input.coveredCountries as unknown as null,
        updatedBy:        ctx.user.id,
        createdBy:        ctx.user.id,
      });
      await log({
        action:     "SYSTEM_HEALTH_CHECKED",
        entityType: "system",
        entityId:   `jurisdiction:${input.jurisdictionCode}`,
        details:    { action: "upsert", code: input.jurisdictionCode },
      });
      return result;
    }),

  toggle: supervisorProc
    .input(z.object({
      id:       z.number().int().positive(),
      isActive: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const result = await toggleJurisdiction(input.id, input.isActive);
      await log({
        action: "SYSTEM_HEALTH_CHECKED",
        entityType: "system",
        entityId: `jurisdiction:${result.jurisdictionCode}`,
        details: { action: "toggle", isActive: input.isActive },
      });
      return result;
    }),
});
