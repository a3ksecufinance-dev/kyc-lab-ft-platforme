/**
 * Scheduler expiration documents KYC
 *
 * Tourne chaque nuit (DOC_EXPIRY_CRON, défaut 02:00 UTC) et :
 *  1. Détecte les documents dont expiryDate < aujourd'hui + DOC_EXPIRY_WARN_DAYS
 *  2. Pour les documents déjà expirés → passe le client en IN_REVIEW + alerte CRITICAL
 *  3. Pour les documents expirant bientôt → alerte HIGH (avertissement)
 *  4. Évite les doublons : une seule alerte DOCUMENT_EXPIRY par client par jour
 */

import { ENV }          from "../../_core/env";
import { createLogger } from "../../_core/logger";
import { runDocExpiryCheck } from "./doc-expiry.service";

const log = createLogger("doc-expiry-scheduler");

let schedulerHandle: ReturnType<typeof setTimeout> | null = null;
let isRunning       = false;
let lastRunAt:      Date | null = null;
let lastRunStatus:  "success" | "error" | null = null;
let lastRunError:   string | null = null;
let nextRunAt:      Date | null = null;
let lastStats: {
  processed: number; expired: number; expiringSoon: number; errors: number; durationMs: number;
} | null = null;

// ─── Délai jusqu'au prochain run ─────────────────────────────────────────────

function msUntilNextRun(): number {
  const parts        = ENV.DOC_EXPIRY_CRON.split(" ");
  const targetMinute = parseInt(parts[0] ?? "0", 10) || 0;
  const targetHour   = parseInt(parts[1] ?? "2",  10) || 2;

  const now    = new Date();
  const target = new Date(now);
  target.setUTCHours(targetHour, targetMinute, 0, 0);
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);

  return target.getTime() - now.getTime();
}

// ─── Job ─────────────────────────────────────────────────────────────────────

async function runJob(): Promise<void> {
  if (isRunning) { log.warn("Doc-expiry déjà en cours — ignoré"); return; }
  isRunning    = true;
  lastRunAt    = new Date();
  lastRunError = null;

  log.info("Démarrage vérification expiration documents");

  try {
    lastStats     = await runDocExpiryCheck();
    lastRunStatus = "success";
    log.info(lastStats, "Vérification expiration documents terminée");
  } catch (err) {
    lastRunStatus = "error";
    lastRunError  = err instanceof Error ? err.message : String(err);
    log.error({ err: lastRunError }, "Erreur vérification expiration documents");
  } finally {
    isRunning = false;
    scheduleNextRun();
  }
}

function scheduleNextRun(): void {
  if (schedulerHandle) clearTimeout(schedulerHandle);
  const delay = msUntilNextRun();
  nextRunAt   = new Date(Date.now() + delay);
  log.info({ nextAt: nextRunAt.toISOString(), delayH: Math.round(delay / 3_600_000) },
    "Prochain run expiration documents planifié");
  schedulerHandle = setTimeout(() => void runJob(), delay);
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function startDocExpiryScheduler(): void {
  if (!ENV.DOC_EXPIRY_ENABLED) {
    log.info("Scheduler expiration documents désactivé (DOC_EXPIRY_ENABLED=false)");
    return;
  }
  log.info({ warnDays: ENV.DOC_EXPIRY_WARN_DAYS }, "Démarrage scheduler expiration documents");
  scheduleNextRun();
}

export function stopDocExpiryScheduler(): void {
  if (schedulerHandle) {
    clearTimeout(schedulerHandle);
    schedulerHandle = null;
    log.info("Scheduler expiration documents arrêté");
  }
}

export async function forceDocExpiryRun(): Promise<typeof lastStats> {
  if (isRunning) return null;
  isRunning    = true;
  lastRunAt    = new Date();
  lastRunError = null;
  try {
    lastStats     = await runDocExpiryCheck();
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

export function getDocExpirySchedulerStatus() {
  return {
    isRunning,
    lastRunAt:    lastRunAt?.toISOString()  ?? null,
    lastRunStatus,
    lastRunError,
    nextRunAt:    nextRunAt?.toISOString()  ?? null,
    lastStats,
    config: {
      enabled:   ENV.DOC_EXPIRY_ENABLED,
      cron:      ENV.DOC_EXPIRY_CRON,
      warnDays:  ENV.DOC_EXPIRY_WARN_DAYS,
    },
  };
}
