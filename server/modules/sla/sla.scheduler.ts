/**
 * Scheduler SLA — snapshots horaires + auto-escalation
 *
 * Tâches périodiques :
 *   - Toutes les heures : capture snapshot SLA + stockage Redis
 *   - Toutes les 4 heures : auto-escalation des dossiers hors SLA
 *
 * Démarré par server/_core/index.ts (startSchedulers())
 */

import { createLogger }           from "../../_core/logger";
import { computeSlaSnapshot, saveSnapshot, runSlaEscalation } from "./sla.service";

const log = createLogger("sla-scheduler");

let snapshotTimer:   ReturnType<typeof setInterval> | null = null;
let escalationTimer: ReturnType<typeof setInterval> | null = null;

const SNAPSHOT_INTERVAL_MS   = 60 * 60 * 1_000;   // 1 heure
const ESCALATION_INTERVAL_MS =  4 * 60 * 60 * 1_000; // 4 heures

export function startSlaScheduler(): void {
  // Snapshot immédiat au démarrage puis toutes les heures
  void (async () => {
    try {
      const snap = await computeSlaSnapshot();
      await saveSnapshot(snap);
      log.info({ capturedAt: snap.capturedAt, pending: snap.kpi.pendingAlerts }, "SLA snapshot initial");
    } catch (err) {
      log.error({ err }, "Erreur SLA snapshot initial");
    }
  })();

  snapshotTimer = setInterval(async () => {
    try {
      const snap = await computeSlaSnapshot();
      await saveSnapshot(snap);
      log.debug({ capturedAt: snap.capturedAt }, "SLA snapshot horaire");
    } catch (err) {
      log.error({ err }, "Erreur SLA snapshot horaire");
    }
  }, SNAPSHOT_INTERVAL_MS);

  // Auto-escalation des dossiers SLA dépassé
  escalationTimer = setInterval(async () => {
    try {
      const result = await runSlaEscalation();
      if (result.escalated > 0) {
        log.warn({ escalated: result.escalated }, "Auto-escalation SLA exécutée");
      }
    } catch (err) {
      log.error({ err }, "Erreur auto-escalation SLA");
    }
  }, ESCALATION_INTERVAL_MS);

  log.info({
    snapshotIntervalMin: SNAPSHOT_INTERVAL_MS / 60_000,
    escalationIntervalH: ESCALATION_INTERVAL_MS / 3_600_000,
  }, "SLA scheduler démarré");
}

export function stopSlaScheduler(): void {
  if (snapshotTimer)   { clearInterval(snapshotTimer);   snapshotTimer   = null; }
  if (escalationTimer) { clearInterval(escalationTimer); escalationTimer = null; }
  log.info("SLA scheduler arrêté");
}
