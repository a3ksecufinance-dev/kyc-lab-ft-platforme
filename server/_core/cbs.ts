/**
 * CBS Client singleton — serveur
 *
 * Instancie KycCbsClient ou KycCbsClientMock selon CBS_MODE :
 *   - CBS_MODE=live   → appels réels vers CBS_BASE_URL
 *   - CBS_MODE=mock   → mock en mémoire (tests / démo)
 *   - CBS_MODE=absent → pas de CBS configuré (log warning, retourne null)
 *
 * Usage dans un service :
 *   import { getCbsClient } from "../../_core/cbs";
 *   const cbs = getCbsClient();
 *   if (cbs) await cbs.pushKycUpdate({ ... });
 */

import { KycCbsClient } from "../../sdk/src/client";
import { KycCbsClientMock } from "../../sdk/src/mock";
import { createLogger } from "./logger";

const log = createLogger("cbs");

export type AnyCbsClient = KycCbsClient | KycCbsClientMock;

let _client: AnyCbsClient | null = null;

export function getCbsClient(): AnyCbsClient | null {
  if (_client) return _client;

  const mode    = process.env["CBS_MODE"] ?? "absent";
  const baseUrl = process.env["CBS_BASE_URL"] ?? "";
  const apiKey  = process.env["CBS_API_KEY"]  ?? "";

  if (mode === "live") {
    if (!baseUrl || !apiKey) {
      log.error("CBS_MODE=live mais CBS_BASE_URL ou CBS_API_KEY absent — CBS désactivé");
      return null;
    }
    _client = new KycCbsClient({ baseUrl, apiKey });
    log.info({ baseUrl }, "CBS client initialisé (live)");

  } else if (mode === "mock") {
    _client = new KycCbsClientMock();
    log.warn("CBS client en mode MOCK — aucun appel réel CBS");

  } else {
    log.info("Pas de CBS configuré (CBS_MODE absent) — fonctionnalités CBS désactivées");
    return null;
  }

  return _client;
}

/**
 * Réinitialise le singleton — uniquement pour les tests.
 */
export function _resetCbsClient(): void {
  _client = null;
}
