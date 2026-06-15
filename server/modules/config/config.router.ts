/**
 * tRPC Router — Configuration système (Phase D)
 *
 * Endpoints :
 *   getAll          — toute la configuration (groupée par catégorie)
 *   getByCategory   — configuration d'une catégorie
 *   update          — modifier une valeur (admin uniquement)
 *   seed            — initialiser les valeurs par défaut
 *   categories      — liste des catégories
 */

import { z } from "zod";
import { router, supervisorProc, adminProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  getAllConfig,
  getConfigByCategory,
  updateConfigValue,
  seedDefaultConfig,
  getCategories,
} from "./config.service";

export const configRouter = router({

  getAll: supervisorProc
    .query(async () => {
      const rows = await getAllConfig();
      // Grouper par catégorie
      const grouped: Record<string, typeof rows> = {};
      for (const row of rows) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category]!.push(row);
      }
      return { config: rows, grouped };
    }),

  getByCategory: supervisorProc
    .input(z.object({ category: z.string().min(1).max(50) }))
    .query(async ({ input }) => {
      return getConfigByCategory(input.category);
    }),

  categories: supervisorProc
    .query(async () => {
      return getCategories();
    }),

  update: adminProc
    .input(z.object({
      key:   z.string().min(1).max(100),
      value: z.union([z.number(), z.string(), z.boolean(), z.record(z.string(), z.unknown())]),
    }))
    .mutation(async ({ input, ctx }) => {
      const auditLog = createAuditFromContext(ctx);

      const result = await updateConfigValue(input.key, input.value, ctx.user.id);

      if (result.success) {
        await auditLog({
          action: "SYSTEM_CONFIG_UPDATED",
          entityType: "system_config",
          entityId: input.key,
          details: { key: input.key, newValue: input.value },
        });
      }

      return result;
    }),

  seed: adminProc
    .mutation(async () => {
      return seedDefaultConfig();
    }),
});
