/**
 * License Router — endpoints de gestion de la licence
 *
 * - getStatus (public) : statut licence pour affichage UI (avant login)
 * - getInfo (admin) : détails complets
 * - activate (admin) : activer une nouvelle clé
 * - history (admin) : historique des licences
 * - checkSeat (admin) : vérifier la limite de sièges
 */

import { z } from "zod";
import { router, publicProc, adminProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import { getLicense, isModuleLicensed } from "../../_core/license";
import type { LicenseModule } from "../../../shared/license.types";
import {
  getLicenseStatus,
  activateLicense,
  getLicenseHistory,
  checkSeatLimit,
  countActiveUsers,
} from "./license.service";

export const licenseRouter = router({
  /**
   * Statut simplifié — accessible sans auth (pour banner UI)
   */
  getStatus: publicProc.query(async () => {
    const state = getLicense();
    const currentUsers = await countActiveUsers();
    return {
      mode: state.mode,
      status: state.status,
      graceMode: state.status === "GRACE",
      daysRemaining: state.payload
        ? Math.ceil((state.payload.exp - Math.floor(Date.now() / 1000)) / 86400)
        : null,
      clientName: state.payload?.client ?? null,
      maxUsers: state.payload?.maxUsers ?? 999,
      currentUsers,
    };
  }),

  /**
   * Info complète — admin uniquement
   */
  getInfo: adminProc.query(async () => {
    return getLicenseStatus();
  }),

  /**
   * Activer une nouvelle licence
   */
  activate: adminProc
    .input(z.object({
      licenseKey: z.string().min(10, "Clé de licence trop courte"),
    }))
    .mutation(async ({ input, ctx }) => {
      const secret = process.env["LICENSE_SIGNING_SECRET"];
      if (!secret) {
        return {
          success: false,
          error: "LICENSE_SIGNING_SECRET non configuré sur le serveur",
        };
      }

      const result = await activateLicense(input.licenseKey, secret, ctx.user.id);

      if (result.success) {
        const log = createAuditFromContext(ctx);
        await log({
          action: "LICENSE_ACTIVATED",
          entityType: "system",
          entityId: result.info?.licenseId ?? "unknown",
          details: {
            clientName: result.info?.clientName,
            modules: result.info?.modules,
            maxUsers: result.info?.maxUsers,
            expiresAt: result.info?.expiresAt,
          },
        });
      }

      return result;
    }),

  /**
   * Historique des licences
   */
  history: adminProc.query(async () => {
    return getLicenseHistory();
  }),

  /**
   * Vérification de la limite de sièges
   */
  checkSeat: adminProc.query(async () => {
    const state = getLicense();
    const maxUsers = state.payload?.maxUsers ?? 999;
    return checkSeatLimit(maxUsers);
  }),

  /**
   * Vérifier si un module spécifique est licencié
   */
  isModuleActive: publicProc
    .input(z.object({ module: z.string() }))
    .query(({ input }) => {
      return { active: isModuleLicensed(input.module as LicenseModule) };
    }),
});
