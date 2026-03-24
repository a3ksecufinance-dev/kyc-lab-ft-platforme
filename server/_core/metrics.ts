/**
 * Métriques Prometheus — prom-client
 *
 * Métriques exposées sur GET /metrics :
 *
 * Système (auto via collectDefaultMetrics) :
 *   process_cpu_seconds_total, process_heap_bytes, nodejs_eventloop_lag_*
 *
 * HTTP :
 *   http_request_duration_seconds{method, route, status_code}
 *   http_requests_total{method, route, status_code}
 *
 * tRPC :
 *   trpc_request_duration_seconds{procedure, type}
 *   trpc_errors_total{procedure, code}
 *
 * AML :
 *   aml_alerts_total{priority}
 *   aml_rules_triggered_total{rule_id}
 *   aml_transactions_analyzed_total
 *   aml_ml_score_duration_seconds
 *
 * Screening :
 *   screening_checks_total{status}
 *
 * Base de données :
 *   db_query_duration_seconds (depuis Drizzle middleware)
 */

import {
  Registry, Counter, Histogram, Gauge,
  collectDefaultMetrics,
} from "prom-client";

// ─── Registre dédié (évite les conflits avec le registre global) ──────────────

export const metricsRegistry = new Registry();
metricsRegistry.setDefaultLabels({ app: "kyc-aml-v2" });
collectDefaultMetrics({ register: metricsRegistry });

// ─── HTTP ─────────────────────────────────────────────────────────────────────

export const httpRequestDuration = new Histogram({
  name:       "http_request_duration_seconds",
  help:       "Durée des requêtes HTTP",
  labelNames: ["method", "route", "status_code"] as const,
  buckets:    [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers:  [metricsRegistry],
});

export const httpRequestsTotal = new Counter({
  name:       "http_requests_total",
  help:       "Nombre total de requêtes HTTP",
  labelNames: ["method", "route", "status_code"] as const,
  registers:  [metricsRegistry],
});

// ─── tRPC ─────────────────────────────────────────────────────────────────────

export const trpcRequestDuration = new Histogram({
  name:       "trpc_request_duration_seconds",
  help:       "Durée des appels tRPC",
  labelNames: ["procedure", "type"] as const,
  buckets:    [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers:  [metricsRegistry],
});

export const trpcErrorsTotal = new Counter({
  name:       "trpc_errors_total",
  help:       "Nombre d'erreurs tRPC",
  labelNames: ["procedure", "code"] as const,
  registers:  [metricsRegistry],
});

// ─── AML ──────────────────────────────────────────────────────────────────────

export const amlAlertsTotal = new Counter({
  name:       "aml_alerts_total",
  help:       "Alertes AML générées",
  labelNames: ["priority"] as const,
  registers:  [metricsRegistry],
});

export const amlRulesTriggeredTotal = new Counter({
  name:       "aml_rules_triggered_total",
  help:       "Déclenchements de règles AML",
  labelNames: ["rule_id"] as const,
  registers:  [metricsRegistry],
});

export const amlTransactionsAnalyzed = new Counter({
  name:      "aml_transactions_analyzed_total",
  help:      "Transactions passées par le moteur AML",
  registers: [metricsRegistry],
});

export const amlMlScoreDuration = new Histogram({
  name:      "aml_ml_score_duration_seconds",
  help:      "Durée du scoring ML Python",
  buckets:   [0.05, 0.1, 0.5, 1, 2, 3, 5],
  registers: [metricsRegistry],
});

// ─── Screening ────────────────────────────────────────────────────────────────

export const screeningChecksTotal = new Counter({
  name:       "screening_checks_total",
  help:       "Screenings sanctions réalisés",
  labelNames: ["status"] as const,   // CLEAR | REVIEW | MATCH
  registers:  [metricsRegistry],
});

// ─── Système ──────────────────────────────────────────────────────────────────

export const activeConnections = new Gauge({
  name:      "app_active_connections",
  help:      "Connexions HTTP actives",
  registers: [metricsRegistry],
});

export const redisConnected = new Gauge({
  name:      "redis_connected",
  help:      "1 si Redis est connecté, 0 sinon",
  registers: [metricsRegistry],
});

export const dbConnected = new Gauge({
  name:      "db_connected",
  help:      "1 si PostgreSQL est connecté, 0 sinon",
  registers: [metricsRegistry],
});

// ─── Middleware HTTP pour Express ─────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime();
  activeConnections.inc();

  res.on("finish", () => {
    const [s, ns] = process.hrtime(start);
    const duration = s + ns / 1e9;

    // Normaliser la route (éviter le cardinality explosion)
    const route = normalizeRoute(req.path);

    httpRequestDuration.labels(req.method, route, String(res.statusCode)).observe(duration);
    httpRequestsTotal.labels(req.method, route, String(res.statusCode)).inc();
    activeConnections.dec();
  });

  next();
}

function normalizeRoute(path: string): string {
  // /trpc/auth.login → /trpc/auth.*
  if (path.startsWith("/trpc/")) return "/trpc/:procedure";
  // /customers/42 → /customers/:id
  return path.replace(/\/\d+/g, "/:id").replace(/\?.*/g, "");
}

// ─── Helper pour mesurer les appels ML ───────────────────────────────────────

export function trackMlScore<T>(fn: () => Promise<T>): Promise<T> {
  const end = amlMlScoreDuration.startTimer();
  return fn().finally(() => end());
}
