/**
 * Connectors Service — Phase G
 *
 * Supervision des connecteurs CBS :
 *   - Health check CBS (ping)
 *   - État circuit breaker
 *   - Statistiques queue CBS
 *   - Jobs en échec (dead letter)
 */

import { getCbsClient } from "../../_core/cbs";
import { cbsCircuitBreaker, type CircuitState } from "../../_core/circuit-breaker";
import {
  getQueueStats,
  getFailedJobs,
  retryFailedJob,
  retryAllFailed,
  clearFailedJobs,
  type CbsJob,
  type QueueStats,
} from "../../_core/cbs-queue";
import { createLogger } from "../../_core/logger";

const log = createLogger("connectors");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CbsHealthResult {
  mode:      string;
  available: boolean;
  latencyMs: number | null;
  status:    "ok" | "degraded" | "unavailable" | "absent";
  error:     string | null;
}

export interface CircuitBreakerStatus {
  service:          string;
  state:            CircuitState;
  failures:         number;
  totalFailures:    number;
  totalSuccesses:   number;
  lastFailureAt:    number | null;
  openedAt:         number | null;
  lastTransitionAt: number;
}

export interface ConnectorDashboard {
  cbs:            CbsHealthResult;
  circuitBreaker: CircuitBreakerStatus;
  queue:          QueueStats;
  failedJobs:     CbsJob[];
}

// ─── CBS Health ─────────────────────────────────────────────────────────────

export async function checkCbsHealth(): Promise<CbsHealthResult> {
  const mode = process.env["CBS_MODE"] ?? "absent";

  if (mode === "absent") {
    return { mode, available: false, latencyMs: null, status: "absent", error: null };
  }

  const cbs = getCbsClient();
  if (!cbs) {
    return { mode, available: false, latencyMs: null, status: "unavailable", error: "Client non initialisé" };
  }

  try {
    const start = Date.now();
    const result = await cbs.ping();
    const latencyMs = Date.now() - start;

    return {
      mode,
      available: true,
      latencyMs,
      status: result.status === "ok" ? "ok" : "degraded",
      error: null,
    };
  } catch (err) {
    log.error({ err }, "CBS health check failed");
    return {
      mode,
      available: false,
      latencyMs: null,
      status: "unavailable",
      error: err instanceof Error ? err.message : "Ping failed",
    };
  }
}

// ─── Circuit Breaker Status ─────────────────────────────────────────────────

export async function getCircuitBreakerStatus(): Promise<CircuitBreakerStatus> {
  const data = await cbsCircuitBreaker.getState();
  return {
    service:          cbsCircuitBreaker.config.service,
    state:            data.state,
    failures:         data.failures,
    totalFailures:    data.totalFailures,
    totalSuccesses:   data.totalSuccesses,
    lastFailureAt:    data.lastFailureAt,
    openedAt:         data.openedAt,
    lastTransitionAt: data.lastTransitionAt,
  };
}

// ─── Full Dashboard ─────────────────────────────────────────────────────────

export async function getConnectorDashboard(): Promise<ConnectorDashboard> {
  const [cbs, circuitBreaker, queue, failedJobs] = await Promise.all([
    checkCbsHealth(),
    getCircuitBreakerStatus(),
    getQueueStats(),
    getFailedJobs(20),
  ]);

  return { cbs, circuitBreaker, queue, failedJobs };
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export {
  retryFailedJob,
  retryAllFailed,
  clearFailedJobs,
};
export type { CbsJob, QueueStats };
