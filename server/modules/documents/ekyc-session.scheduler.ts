/**
 * Scheduler eKYC — marquage périodique des sessions expirées en ABANDONED,
 * puis purge RGPD des sessions ABANDONED de plus de 30 jours.
 *
 * Une session reste en DRAFT / RECTO_ONLY / OCR_DONE jusqu'à expiresAt.
 * Sans cron, ces sessions occupent des CIN et faussent les stats SLA.
 *
 * Purge : loi 09-08 / RGPD art. 5 minimisation.
 *
 * Démarré par server/_core/index.ts (startSchedulers()).
 */

import { createLogger }         from "../../_core/logger";
import { abandonExpiredSessions, purgeOldAbandonedSessions } from "./ekyc-session.service";

const log = createLogger("ekyc-session-scheduler");

let abandonTimer: ReturnType<typeof setInterval> | null = null;
let purgeTimer:   ReturnType<typeof setInterval> | null = null;

const ABANDON_INTERVAL_MS = 5 * 60 * 1_000;         // 5 minutes
const PURGE_INTERVAL_MS   = 24 * 60 * 60 * 1_000;   // 24 heures

export function startEkycSessionScheduler(): void {
  const runAbandon = async () => {
    try {
      const count = await abandonExpiredSessions();
      if (count > 0) log.info({ count }, "Sessions eKYC expirées abandonnées");
    } catch (err) {
      log.error({ err }, "Erreur passage sessions eKYC expirées");
    }
  };

  const runPurge = async () => {
    try {
      const count = await purgeOldAbandonedSessions();
      if (count > 0) log.info({ count }, "Sessions ABANDONED purgées");
    } catch (err) {
      log.error({ err }, "Erreur purge sessions ABANDONED");
    }
  };

  void runAbandon();
  void runPurge();
  abandonTimer = setInterval(() => void runAbandon(), ABANDON_INTERVAL_MS);
  purgeTimer   = setInterval(() => void runPurge(),   PURGE_INTERVAL_MS);

  log.info({
    abandonIntervalMin: ABANDON_INTERVAL_MS / 60_000,
    purgeIntervalH:     PURGE_INTERVAL_MS / 3_600_000,
  }, "Scheduler eKYC sessions démarré");
}

export function stopEkycSessionScheduler(): void {
  if (abandonTimer) { clearInterval(abandonTimer); abandonTimer = null; }
  if (purgeTimer)   { clearInterval(purgeTimer);   purgeTimer   = null; }
  log.info("Scheduler eKYC sessions arrêté");
}
