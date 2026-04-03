/**
 * Scheduler de ré-entraînement automatique du service ML.
 *
 * Appelle POST /retrain sur le service Python à l'heure planifiée
 * (par défaut : dimanche 03:00 UTC, configurable via ML_RETRAIN_CRON).
 *
 * API publique :
 *   startMlRetrainScheduler()  — à appeler au démarrage du serveur
 *   stopMlRetrainScheduler()   — à appeler lors du shutdown gracieux
 *   forceMlRetrain()           — déclenchement manuel (endpoint admin)
 *   getMlRetrainStatus()       — état courant du scheduler
 */

import { ENV }          from "../../_core/env";
import { createLogger } from "../../_core/logger";

const log = createLogger("ml-retrain-scheduler");

// ─── État interne ─────────────────────────────────────────────────────────────

let schedulerHandle: ReturnType<typeof setTimeout> | null = null;
let isRunning      = false;
let lastRunAt:     Date | null = null;
let lastRunStatus: "success" | "error" | "skipped" | null = null;
let lastRunError:  string | null = null;
let nextRunAt:     Date | null = null;

// ─── Parsing cron simplifié ───────────────────────────────────────────────────
//   Format attendu : "minute heure * * *"  (ex. "0 3 * * 0" = dimanche 03:00)
//   On extrait uniquement minute + heure pour planifier le prochain tick quotidien.

function msUntilNextRun(): number {
  const parts        = ENV.ML_RETRAIN_CRON.split(" ");
  const targetMinute = parseInt(parts[0] ?? "0", 10) || 0;
  const targetHour   = parseInt(parts[1] ?? "3",  10) || 3;

  const now    = new Date();
  const target = new Date(now);
  target.setUTCHours(targetMinute, 0, 0, 0);   // intentionally using minute as hour-field below
  target.setUTCHours(targetHour, targetMinute, 0, 0);

  // Si l'heure cible est déjà passée aujourd'hui → demain
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);

  return target.getTime() - now.getTime();
}

// ─── Appel HTTP vers le service Python ───────────────────────────────────────

async function callRetrain(force = false): Promise<{
  status: "success" | "error" | "skipped";
  message: string;
  durationMs?: number;
}> {
  const url     = `${ENV.ML_SERVICE_URL}/retrain`;
  const payload = { days_history: ENV.ML_RETRAIN_DAYS_HISTORY, force };

  const start = Date.now();
  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key":    ENV.ML_INTERNAL_API_KEY,
    },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(10 * 60 * 1000),   // 10 min — entraînement peut être long
  });

  const durationMs = Date.now() - start;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  const data = await res.json() as {
    status?:  string;
    message?: string;
    skipped?: boolean;
  };

  const skipped = data.skipped === true || data.status === "skipped";
  return {
    status:    skipped ? "skipped" : "success",
    message:   data.message ?? (skipped ? "cooldown actif" : "réentraînement terminé"),
    durationMs,
  };
}

// ─── Job principal ─────────────────────────────────────────────────────────────

async function runRetrain(force = false): Promise<void> {
  if (isRunning) {
    log.warn("Réentraînement ML déjà en cours — ignoré");
    return;
  }
  isRunning = true;
  lastRunAt = new Date();
  lastRunError = null;

  log.info({ force, daysHistory: ENV.ML_RETRAIN_DAYS_HISTORY }, "Démarrage réentraînement ML");

  try {
    const result = await callRetrain(force);

    lastRunStatus = result.status;
    log.info(
      { status: result.status, message: result.message, durationMs: result.durationMs },
      "Réentraînement ML terminé"
    );
  } catch (err) {
    lastRunStatus = "error";
    lastRunError  = err instanceof Error ? err.message : String(err);
    log.error({ err: lastRunError }, "Erreur réentraînement ML");
  } finally {
    isRunning = false;
    scheduleNextRun();
  }
}

function scheduleNextRun(): void {
  if (schedulerHandle) clearTimeout(schedulerHandle);

  const delay = msUntilNextRun();
  nextRunAt   = new Date(Date.now() + delay);

  log.info(
    { nextAt: nextRunAt.toISOString(), delayH: Math.round(delay / 3_600_000) },
    "Prochain réentraînement ML planifié"
  );

  schedulerHandle = setTimeout(() => void runRetrain(false), delay);
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function startMlRetrainScheduler(): void {
  if (!ENV.ML_RETRAIN_AUTO) {
    log.info("Scheduler ML désactivé (ML_RETRAIN_AUTO=false)");
    return;
  }
  log.info("Démarrage scheduler réentraînement ML");
  scheduleNextRun();
}

export function stopMlRetrainScheduler(): void {
  if (schedulerHandle) {
    clearTimeout(schedulerHandle);
    schedulerHandle = null;
    log.info("Scheduler réentraînement ML arrêté");
  }
}

export async function forceMlRetrain(): Promise<{
  status: "success" | "error" | "skipped";
  message: string;
  durationMs?: number;
}> {
  if (isRunning) {
    return { status: "skipped", message: "Réentraînement déjà en cours" };
  }

  isRunning    = true;
  lastRunAt    = new Date();
  lastRunError = null;

  try {
    const result = await callRetrain(true);  // force=true pour ignorer le cooldown Python
    lastRunStatus = result.status;
    lastRunError  = null;
    return result;
  } catch (err) {
    lastRunStatus = "error";
    lastRunError  = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    isRunning = false;
    scheduleNextRun();
  }
}

export function getMlRetrainStatus(): {
  isRunning:    boolean;
  lastRunAt:    string | null;
  lastRunStatus: "success" | "error" | "skipped" | null;
  lastRunError: string | null;
  nextRunAt:    string | null;
  config: {
    auto:        boolean;
    cron:        string;
    daysHistory: number;
    mlServiceUrl: string;
  };
} {
  return {
    isRunning,
    lastRunAt:    lastRunAt?.toISOString() ?? null,
    lastRunStatus,
    lastRunError,
    nextRunAt:    nextRunAt?.toISOString() ?? null,
    config: {
      auto:         ENV.ML_RETRAIN_AUTO,
      cron:         ENV.ML_RETRAIN_CRON,
      daysHistory:  ENV.ML_RETRAIN_DAYS_HISTORY,
      mlServiceUrl: ENV.ML_SERVICE_URL,
    },
  };
}
