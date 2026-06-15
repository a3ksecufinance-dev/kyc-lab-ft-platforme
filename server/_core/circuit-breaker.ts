/**
 * Circuit Breaker — Pattern de résilience pour appels CBS
 *
 * États : CLOSED → OPEN → HALF_OPEN → CLOSED
 *   - CLOSED   : trafic normal, comptage des erreurs
 *   - OPEN     : toutes les requêtes échouent immédiatement (fast-fail)
 *   - HALF_OPEN: après cooldown, permet 1 requête test
 *
 * Configuration :
 *   - failureThreshold : nombre d'erreurs consécutives avant OPEN (default 5)
 *   - cooldownMs       : durée en OPEN avant passage HALF_OPEN (default 30s)
 *   - successThreshold : succès consécutifs en HALF_OPEN pour revenir CLOSED (default 2)
 *
 * Stockage : Redis (partagé entre workers/instances)
 */

import { redis, RedisKeys } from "./redis";
import { createLogger } from "./logger";

const log = createLogger("circuit-breaker");

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  service:          string;
  failureThreshold: number;
  cooldownMs:       number;
  successThreshold: number;
}

interface CircuitData {
  state:             CircuitState;
  failures:          number;
  successes:         number;
  lastFailureAt:     number | null;
  openedAt:          number | null;
  totalFailures:     number;
  totalSuccesses:    number;
  lastTransitionAt:  number;
}

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, "service"> = {
  failureThreshold: 5,
  cooldownMs:       30_000,
  successThreshold: 2,
};

const TTL_SECONDS = 3600; // 1h — auto-expire if service disappears

// ─── State read/write ───────────────────────────────────────────────────────

async function getCircuitData(service: string): Promise<CircuitData> {
  try {
    const raw = await redis.get(RedisKeys.circuitBreaker(service));
    if (raw) return JSON.parse(raw) as CircuitData;
  } catch {
    // Redis down → assume closed
  }
  return {
    state: "CLOSED", failures: 0, successes: 0,
    lastFailureAt: null, openedAt: null,
    totalFailures: 0, totalSuccesses: 0,
    lastTransitionAt: Date.now(),
  };
}

async function setCircuitData(service: string, data: CircuitData): Promise<void> {
  try {
    await redis.setex(RedisKeys.circuitBreaker(service), TTL_SECONDS, JSON.stringify(data));
  } catch {
    // Redis down → best effort
  }
}

// ─── Circuit Breaker ────────────────────────────────────────────────────────

export function createCircuitBreaker(config: Partial<CircuitBreakerConfig> & { service: string }) {
  const cfg: CircuitBreakerConfig = { ...DEFAULT_CONFIG, ...config };

  async function getState(): Promise<CircuitData> {
    const data = await getCircuitData(cfg.service);

    // Auto-transition OPEN → HALF_OPEN after cooldown
    if (data.state === "OPEN" && data.openedAt) {
      if (Date.now() - data.openedAt >= cfg.cooldownMs) {
        data.state = "HALF_OPEN";
        data.successes = 0;
        data.lastTransitionAt = Date.now();
        await setCircuitData(cfg.service, data);
        log.info({ service: cfg.service }, "Circuit breaker → HALF_OPEN (cooldown écoulé)");
      }
    }

    return data;
  }

  async function recordSuccess(): Promise<void> {
    const data = await getCircuitData(cfg.service);
    data.totalSuccesses++;

    if (data.state === "HALF_OPEN") {
      data.successes++;
      if (data.successes >= cfg.successThreshold) {
        data.state = "CLOSED";
        data.failures = 0;
        data.successes = 0;
        data.openedAt = null;
        data.lastTransitionAt = Date.now();
        log.info({ service: cfg.service }, "Circuit breaker → CLOSED (récupéré)");
      }
    } else if (data.state === "CLOSED") {
      data.failures = 0; // Reset failure count on success
    }

    await setCircuitData(cfg.service, data);
  }

  async function recordFailure(): Promise<void> {
    const data = await getCircuitData(cfg.service);
    data.failures++;
    data.totalFailures++;
    data.lastFailureAt = Date.now();

    if (data.state === "HALF_OPEN") {
      // Any failure in HALF_OPEN → back to OPEN
      data.state = "OPEN";
      data.openedAt = Date.now();
      data.successes = 0;
      data.lastTransitionAt = Date.now();
      log.warn({ service: cfg.service }, "Circuit breaker → OPEN (échec en HALF_OPEN)");
    } else if (data.state === "CLOSED" && data.failures >= cfg.failureThreshold) {
      data.state = "OPEN";
      data.openedAt = Date.now();
      data.lastTransitionAt = Date.now();
      log.warn({ service: cfg.service, failures: data.failures }, "Circuit breaker → OPEN (seuil atteint)");
    }

    await setCircuitData(cfg.service, data);
  }

  /**
   * Execute fn wrapped in circuit breaker protection.
   * Throws CircuitOpenError if circuit is OPEN.
   */
  async function execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = await getState();

    if (state.state === "OPEN") {
      throw new CircuitOpenError(cfg.service);
    }

    try {
      const result = await fn();
      await recordSuccess();
      return result;
    } catch (err) {
      await recordFailure();
      throw err;
    }
  }

  async function reset(): Promise<void> {
    const data = await getCircuitData(cfg.service);
    data.state = "CLOSED";
    data.failures = 0;
    data.successes = 0;
    data.openedAt = null;
    data.lastTransitionAt = Date.now();
    await setCircuitData(cfg.service, data);
    log.info({ service: cfg.service }, "Circuit breaker reset manuellement → CLOSED");
  }

  return { execute, getState, recordSuccess, recordFailure, reset, config: cfg };
}

// ─── Error ──────────────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(public readonly service: string) {
    super(`Circuit breaker OPEN pour le service "${service}" — requêtes bloquées`);
    this.name = "CircuitOpenError";
  }
}

// ─── Pre-built CBS circuit breaker ──────────────────────────────────────────

export const cbsCircuitBreaker = createCircuitBreaker({
  service:          "cbs",
  failureThreshold: 5,
  cooldownMs:       30_000,
  successThreshold: 2,
});
