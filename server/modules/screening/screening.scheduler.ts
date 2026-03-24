/**
 * Scheduler de mise à jour des listes de sanctions.
 *
 * Utilise setInterval (pas de dépendance node-cron) avec une logique
 * de scheduling basée sur la prochaine heure 02:00 UTC.
 *
 * En production : met à jour toutes les nuits à 02:00 UTC.
 * En dev        : met à jour au démarrage si le cache est vide.
 */

import { ENV } from "../../_core/env";
import { createLogger } from "../../_core/logger";
import { loadAllSanctionLists } from "./screening.lists";

const log = createLogger("screening-scheduler");

let schedulerHandle: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

// ─── Logique de scheduling ────────────────────────────────────────────────────

function msUntilNextUpdate(): number {
  // Parse le cron "0 2 * * *" → heure 2, minute 0
  // Pour simplicité on parse juste l'heure cible (premier champ = minute, deuxième = heure)
  const parts = ENV.SCREENING_UPDATE_CRON.split(" ");
  const targetMinute = parseInt(parts[0] ?? "0", 10) || 0;
  const targetHour   = parseInt(parts[1] ?? "2",  10) || 2;

  const now    = new Date();
  const target = new Date(now);
  target.setUTCHours(targetHour, targetMinute, 0, 0);

  // Si l'heure cible est déjà passée aujourd'hui → demain
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);

  return target.getTime() - now.getTime();
}

// ─── Job de mise à jour ────────────────────────────────────────────────────────

async function runUpdate(forceRefresh = false): Promise<void> {
  if (isRunning) {
    log.warn("Mise à jour des listes déjà en cours — ignoré");
    return;
  }
  isRunning = true;

  try {
    log.info({ forceRefresh }, "Démarrage mise à jour listes sanctions");
    const { statuses, totalCount } = await loadAllSanctionLists(forceRefresh);

    const summary = statuses.map(s =>
      `${s.provider}:${s.count}${s.fromCache ? "(cache)" : "(fresh)"}${s.error ? "!" : ""}`
    ).join(" | ");

    log.info({ total: totalCount, summary }, "Listes sanctions mises à jour");
  } catch (err) {
    log.error({ err }, "Erreur mise à jour listes sanctions");
  } finally {
    isRunning = false;
    // Planifier la prochaine exécution
    scheduleNextRun();
  }
}

function scheduleNextRun(): void {
  if (schedulerHandle) clearTimeout(schedulerHandle);

  const delay = msUntilNextUpdate();
  const nextAt = new Date(Date.now() + delay);

  log.info(
    { nextAt: nextAt.toISOString(), delayH: Math.round(delay / 3_600_000) },
    "Prochaine mise à jour listes sanctions planifiée"
  );

  schedulerHandle = setTimeout(() => void runUpdate(true), delay);
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function startSanctionsScheduler(): void {
  if (!ENV.SCREENING_AUTO_UPDATE) {
    log.info("Scheduler sanctions désactivé (SCREENING_AUTO_UPDATE=false)");
    return;
  }

  log.info("Démarrage scheduler listes sanctions");

  // Démarrage : charger depuis le cache (pas de refresh forcé)
  // Si le cache est vide, loadAllSanctionLists va fetcher automatiquement
  void runUpdate(false);
}

export function stopSanctionsScheduler(): void {
  if (schedulerHandle) {
    clearTimeout(schedulerHandle);
    schedulerHandle = null;
    log.info("Scheduler sanctions arrêté");
  }
}

// Forcer un refresh immédiat (appelé par l'endpoint admin)
export async function forceRefresh(): Promise<ReturnType<typeof loadAllSanctionLists>> {
  isRunning = false; // réinitialiser au cas où
  const result = await loadAllSanctionLists(true);
  scheduleNextRun();
  return result;
}
