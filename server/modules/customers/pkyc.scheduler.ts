/**
 * Scheduler pKYC — Score de dérive comportementale nuitière
 *
 * Tourne chaque nuit (PKYC_CRON, défaut 01:00 UTC) et appelle runPkycNightly().
 *
 * API publique :
 *   startPkycScheduler()   — appeler au démarrage du serveur
 *   stopPkycScheduler()    — appeler lors du shutdown gracieux
 *   forcePkycRun()         — déclenchement manuel (endpoint admin)
 *   getPkycSchedulerStatus() — état courant
 */

import { ENV }          from "../../_core/env";
import { createLogger } from "../../_core/logger";
import { runPkycNightly } from "./pkyc.service";

const log = createLogger("pkyc-scheduler");

let schedulerHandle: ReturnType<typeof setTimeout> | null = null;
let isRunning      = false;
let lastRunAt:     Date | null = null;
let lastRunStatus: "success" | "error" | null = null;
let lastRunError:  string | null = null;
let nextRunAt:     Date | null = null;
let lastStats: { processed: number; triggered: number; errors: number; durationMs: number } | null = null;

// ─── Calcul du délai jusqu'au prochain run ────────────────────────────────────

function msUntilNextRun(): number {
  const parts        = ENV.PKYC_CRON.split(" ");
  const targetMinute = parseInt(parts[0] ?? "0", 10) || 0;
  const targetHour   = parseInt(parts[1] ?? "1",  10) || 1;

  const now    = new Date();
  const target = new Date(now);
  target.setUTCHours(targetHour, targetMinute, 0, 0);

  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);

  return target.getTime() - now.getTime();
}

// ─── Job ──────────────────────────────────────────────────────────────────────

async function runJob(): Promise<void> {
  if (isRunning) { log.warn("pKYC déjà en cours — ignoré"); return; }
  isRunning    = true;
  lastRunAt    = new Date();
  lastRunError = null;

  log.info("Démarrage run pKYC nuitier");

  try {
    lastStats     = await runPkycNightly();
    lastRunStatus = "success";
    log.info(lastStats, "Run pKYC terminé");
  } catch (err) {
    lastRunStatus = "error";
    lastRunError  = err instanceof Error ? err.message : String(err);
    log.error({ err: lastRunError }, "Erreur run pKYC");
  } finally {
    isRunning = false;
    scheduleNextRun();
  }
}

function scheduleNextRun(): void {
  if (schedulerHandle) clearTimeout(schedulerHandle);
  const delay  = msUntilNextRun();
  nextRunAt    = new Date(Date.now() + delay);
  log.info({ nextAt: nextRunAt.toISOString(), delayH: Math.round(delay / 3_600_000) },
    "Prochain run pKYC planifié");
  schedulerHandle = setTimeout(() => void runJob(), delay);
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function startPkycScheduler(): void {
  if (!ENV.PKYC_ENABLED) {
    log.info("Scheduler pKYC désactivé (PKYC_ENABLED=false)");
    return;
  }
  log.info("Démarrage scheduler pKYC");
  scheduleNextRun();
}

export function stopPkycScheduler(): void {
  if (schedulerHandle) {
    clearTimeout(schedulerHandle);
    schedulerHandle = null;
    log.info("Scheduler pKYC arrêté");
  }
}

export async function forcePkycRun(): Promise<typeof lastStats> {
  if (isRunning) return null;
  isRunning    = true;
  lastRunAt    = new Date();
  lastRunError = null;
  try {
    lastStats     = await runPkycNightly();
    lastRunStatus = "success";
    return lastStats;
  } catch (err) {
    lastRunStatus = "error";
    lastRunError  = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    isRunning = false;
    scheduleNextRun();
  }
}

export function getPkycSchedulerStatus() {
  return {
    isRunning,
    lastRunAt:    lastRunAt?.toISOString()   ?? null,
    lastRunStatus,
    lastRunError,
    nextRunAt:    nextRunAt?.toISOString()   ?? null,
    lastStats,
    config: {
      enabled:       ENV.PKYC_ENABLED,
      cron:          ENV.PKYC_CRON,
      driftThreshold: ENV.PKYC_DRIFT_THRESHOLD,
      baselineDays:  ENV.PKYC_BASELINE_DAYS,
      windowDays:    ENV.PKYC_WINDOW_DAYS,
    },
  };
}
