/**
 * tRPC Router — SLA Dashboard
 *
 * Endpoints :
 *   snapshot      — snapshot SLA actuel (ou calcul à la demande)
 *   history       — historique des 24 derniers snapshots (évolution)
 *   escalate      — déclenche manuellement l'auto-escalation
 *   thresholds    — retourne les seuils SLA configurés
 */

import { z }          from "zod";
import { router, analystProc, supervisorProc } from "../../_core/trpc";
import {
  computeSlaSnapshot,
  getLatestSnapshot,
  getSnapshotHistory,
  runSlaEscalation,
} from "./sla.service";

const ALERT_SLA_HRS = { LOW: 72, MEDIUM: 24, HIGH: 4, CRITICAL: 2 };
const CASE_SLA_DAYS = { default: 30, HIGH: 15, CRITICAL: 15 };
const FAR_FAUX_POS  = 30;   // % max recommandé GAFI/BAM

export const slaRouter = router({

  /**
   * Snapshot SLA actuel
   * Si forceRefresh=true, recalcule depuis la base (peut prendre 1-2s)
   */
  snapshot: analystProc
    .input(z.object({ forceRefresh: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
      if (input?.forceRefresh) {
        const snap = await computeSlaSnapshot();
        return snap;
      }
      const cached = await getLatestSnapshot();
      if (cached) return cached;
      // Aucun cache — calcul immédiat
      return computeSlaSnapshot();
    }),

  /**
   * Historique des N derniers snapshots (graphe évolution)
   */
  history: analystProc
    .input(z.object({ lastN: z.number().int().min(1).max(168).default(24) }).optional())
    .query(async ({ input }) => {
      return getSnapshotHistory(input?.lastN ?? 24);
    }),

  /**
   * Auto-escalation manuelle — force le passage en ESCALATED des dossiers hors SLA
   * Requiert rôle supervisor minimum
   */
  escalate: supervisorProc
    .mutation(async () => {
      return runSlaEscalation();
    }),

  /**
   * Configuration des seuils SLA (lecture seule)
   */
  thresholds: analystProc
    .query(() => ({
      alerts: ALERT_SLA_HRS,
      cases:  CASE_SLA_DAYS,
      kpi: {
        maxFalsePosRate:     FAR_FAUX_POS,
        maxAlertBreachRate:  20,
        maxCaseBreachRate:   10,
      },
    })),
});
