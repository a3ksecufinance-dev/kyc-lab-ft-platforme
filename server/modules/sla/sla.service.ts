/**
 * Service SLA — Transaction Monitoring Dashboard
 *
 * Calcule en temps réel les indicateurs de performance opérationnels :
 *
 * SLA réglementaires BAM (Établissements de Paiement) :
 *   - Délai de traitement alerte :    < 24h (MEDIUM), < 4h (HIGH/CRITICAL)
 *   - Délai fermeture dossier :       < 30 jours (standard), < 15j (CRITICAL)
 *   - Délai révision KYC :            < 12 mois (standard), < 3 mois (HIGH risk)
 *   - Taux de faux positifs :         < 30 % (recommandation GAFI/BAM)
 *
 * Stockage Redis : snapshots horaires de 30 jours pour les graphes d'évolution
 */

import { and, gte, eq, count, isNotNull } from "drizzle-orm";
import { db }           from "../../_core/db";
import { redis }        from "../../_core/redis";
import { createLogger } from "../../_core/logger";
import { alerts, cases, transactions } from "../../../drizzle/schema";

const log = createLogger("sla-service");

const REDIS_SNAPSHOT_KEY = "sla:snapshot:";
const SNAPSHOT_TTL       = 30 * 86_400;       // 30 jours
const SNAPSHOT_INTERVAL  = 3_600;             // 1 heure

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlertSlaMetrics {
  total:            number;
  open:             number;
  resolved:         number;
  breachedSla:      number;    // alertes dépassant SLA (non résolues au-delà du délai)
  avgResolutionHrs: number;    // délai moyen de résolution (heures)
  byPriority: {
    LOW:      { total: number; breached: number; avgHrs: number };
    MEDIUM:   { total: number; breached: number; avgHrs: number };
    HIGH:     { total: number; breached: number; avgHrs: number };
    CRITICAL: { total: number; breached: number; avgHrs: number };
  };
}

export interface CaseSlaMetrics {
  total:            number;
  open:             number;
  closed:           number;
  breachedSla:      number;
  avgResolutionDays: number;
  overdueCases:     number;    // dueDate dépassée + encore OPEN
}

export interface KpiMetrics {
  alertBreachRate:    number;   // % alertes hors SLA
  caseBreachRate:     number;
  falsePosRate:       number;   // % alertes clôturées FALSE_POSITIVE
  escalationRate:     number;   // % dossiers ayant subi une escalade
  txMonitoringVol:    number;   // Volume transactionnel monitoré (24h)
  pendingAlerts:      number;
  openCases:          number;
}

export interface SlaSnapshot {
  capturedAt:   string;   // ISO 8601
  alerts:       AlertSlaMetrics;
  cases:        CaseSlaMetrics;
  kpi:          KpiMetrics;
}

// SLA thresholds (heures)
const ALERT_SLA_HRS: Record<string, number> = {
  LOW:      72,
  MEDIUM:   24,
  HIGH:      4,
  CRITICAL:  2,
};
const CASE_SLA_DAYS = {
  default:  30,
  HIGH:     15,
  CRITICAL: 15,
};

// ─── Calcul des métriques alertes ─────────────────────────────────────────────

async function computeAlertSla(since: Date): Promise<AlertSlaMetrics> {
  const now = new Date();

  const rows = await db
    .select({
      status:     alerts.status,
      priority:   alerts.priority,
      createdAt:  alerts.createdAt,
      resolvedAt: alerts.resolvedAt,
    })
    .from(alerts)
    .where(gte(alerts.createdAt, since))
    .limit(5000);

  const metrics: AlertSlaMetrics = {
    total:   rows.length,
    open:    0,
    resolved: 0,
    breachedSla: 0,
    avgResolutionHrs: 0,
    byPriority: {
      LOW:      { total: 0, breached: 0, avgHrs: 0 },
      MEDIUM:   { total: 0, breached: 0, avgHrs: 0 },
      HIGH:     { total: 0, breached: 0, avgHrs: 0 },
      CRITICAL: { total: 0, breached: 0, avgHrs: 0 },
    },
  };

  const resolutionHrsByPriority: Record<string, number[]> = { LOW: [], MEDIUM: [], HIGH: [], CRITICAL: [] };
  let   totalResolutionHrs = 0;
  let   resolvedCount = 0;

  for (const row of rows) {
    const priority = row.priority ?? "MEDIUM";
    const slaHrs   = ALERT_SLA_HRS[priority] ?? 24;
    const ageMs    = (row.resolvedAt ?? now).getTime() - row.createdAt.getTime();
    const ageHrs   = ageMs / 3_600_000;

    if (row.status === "OPEN" || row.status === "IN_REVIEW") {
      metrics.open++;
    } else {
      metrics.resolved++;
      resolvedCount++;
      totalResolutionHrs += ageHrs;
      resolutionHrsByPriority[priority]?.push(ageHrs);
    }

    const bp = metrics.byPriority[priority as keyof typeof metrics.byPriority];
    if (bp) {
      bp.total++;
      if (ageHrs > slaHrs && (row.status === "OPEN" || row.status === "IN_REVIEW")) {
        bp.breached++;
        metrics.breachedSla++;
      }
    }
  }

  metrics.avgResolutionHrs = resolvedCount > 0 ? totalResolutionHrs / resolvedCount : 0;

  // Moyenne par priorité
  for (const [prio, hrs] of Object.entries(resolutionHrsByPriority)) {
    const bp = metrics.byPriority[prio as keyof typeof metrics.byPriority];
    if (bp && hrs.length > 0) {
      bp.avgHrs = hrs.reduce((a, b) => a + b, 0) / hrs.length;
    }
  }

  return metrics;
}

// ─── Calcul des métriques dossiers ────────────────────────────────────────────

async function computeCaseSla(since: Date): Promise<CaseSlaMetrics> {
  const now = new Date();

  const rows = await db
    .select({
      status:     cases.status,
      severity:   cases.severity,
      createdAt:  cases.createdAt,
      updatedAt:  cases.updatedAt,
      decisionAt: cases.decisionAt,
      dueDate:    cases.dueDate,
    })
    .from(cases)
    .where(gte(cases.createdAt, since))
    .limit(2000);

  const metrics: CaseSlaMetrics = {
    total:             rows.length,
    open:              0,
    closed:            0,
    breachedSla:       0,
    avgResolutionDays: 0,
    overdueCases:      0,
  };

  let totalDays = 0;
  let closedCount = 0;

  for (const row of rows) {
    const slaDays  = CASE_SLA_DAYS[row.severity as keyof typeof CASE_SLA_DAYS] ?? CASE_SLA_DAYS.default;
    const closeTs  = row.decisionAt ?? (row.status === "CLOSED" ? row.updatedAt : null);
    const ageMs    = (closeTs ?? now).getTime() - row.createdAt.getTime();
    const ageDays  = ageMs / 86_400_000;

    const isOpen = row.status === "OPEN" || row.status === "UNDER_INVESTIGATION"
      || row.status === "PENDING_APPROVAL" || row.status === "ESCALATED";
    if (isOpen) {
      metrics.open++;

      if (row.dueDate && row.dueDate < now) {
        metrics.overdueCases++;
      } else if (ageDays > slaDays) {
        metrics.breachedSla++;
      }
    } else {
      metrics.closed++;
      closedCount++;
      totalDays += ageDays;
    }
  }

  metrics.avgResolutionDays = closedCount > 0 ? totalDays / closedCount : 0;

  return metrics;
}

// ─── KPIs globaux ─────────────────────────────────────────────────────────────

async function computeKpi(alertMetrics: AlertSlaMetrics, caseMetrics: CaseSlaMetrics): Promise<KpiMetrics> {
  const last24h = new Date(Date.now() - 86_400_000);

  // Taux faux positifs (alertes fermées avec résolution FALSE_POSITIVE)
  const [fpResult] = await db
    .select({ total: count() })
    .from(alerts)
    .where(
      and(
        eq(alerts.status, "FALSE_POSITIVE"),
        isNotNull(alerts.resolvedAt),
      )
    );
  const fpTotal = Number(fpResult?.total ?? 0);
  const falsePosRate = alertMetrics.resolved > 0 ? (fpTotal / alertMetrics.resolved) * 100 : 0;

  // Taux escalade (dossiers ESCALATED)
  const [escResult] = await db
    .select({ total: count() })
    .from(cases)
    .where(eq(cases.status, "ESCALATED"));
  const escalationRate = caseMetrics.total > 0
    ? (Number(escResult?.total ?? 0) / caseMetrics.total) * 100
    : 0;

  // Volume transactionnel 24h
  const txVolRows = await db
    .select({ total: count() })
    .from(transactions)
    .where(gte(transactions.transactionDate, last24h));

  return {
    alertBreachRate:  alertMetrics.total > 0 ? (alertMetrics.breachedSla / alertMetrics.total) * 100 : 0,
    caseBreachRate:   caseMetrics.total   > 0 ? (caseMetrics.breachedSla  / caseMetrics.total)  * 100 : 0,
    falsePosRate:     Math.round(falsePosRate * 10) / 10,
    escalationRate:   Math.round(escalationRate * 10) / 10,
    txMonitoringVol:  Number(txVolRows[0]?.total ?? 0),
    pendingAlerts:    alertMetrics.open,
    openCases:        caseMetrics.open,
  };
}

// ─── Snapshot complet ─────────────────────────────────────────────────────────

export async function computeSlaSnapshot(): Promise<SlaSnapshot> {
  const since90d = new Date(Date.now() - 90 * 86_400_000);

  const [alertMetrics, caseMetrics] = await Promise.all([
    computeAlertSla(since90d),
    computeCaseSla(since90d),
  ]);
  const kpi = await computeKpi(alertMetrics, caseMetrics);

  const snapshot: SlaSnapshot = {
    capturedAt: new Date().toISOString(),
    alerts:     alertMetrics,
    cases:      caseMetrics,
    kpi,
  };

  return snapshot;
}

// ─── Stockage + Lecture snapshots horaires ────────────────────────────────────

export async function saveSnapshot(snapshot: SlaSnapshot): Promise<void> {
  const key = `${REDIS_SNAPSHOT_KEY}${Math.floor(Date.now() / 1000 / SNAPSHOT_INTERVAL)}`;
  try {
    await redis.setex(key, SNAPSHOT_TTL, JSON.stringify(snapshot));
    log.debug({ capturedAt: snapshot.capturedAt }, "SLA snapshot sauvegardé");
  } catch (err) {
    log.error({ err }, "Erreur sauvegarde SLA snapshot");
  }
}

export async function getLatestSnapshot(): Promise<SlaSnapshot | null> {
  try {
    const key = `${REDIS_SNAPSHOT_KEY}${Math.floor(Date.now() / 1000 / SNAPSHOT_INTERVAL)}`;
    const prev = `${REDIS_SNAPSHOT_KEY}${Math.floor(Date.now() / 1000 / SNAPSHOT_INTERVAL) - 1}`;
    const data = await redis.get(key) ?? await redis.get(prev);
    return data ? (JSON.parse(data) as SlaSnapshot) : null;
  } catch {
    return null;
  }
}

export async function getSnapshotHistory(lastN = 24): Promise<SlaSnapshot[]> {
  const currentBucket = Math.floor(Date.now() / 1000 / SNAPSHOT_INTERVAL);
  const results: SlaSnapshot[] = [];

  for (let i = 0; i < lastN; i++) {
    const key = `${REDIS_SNAPSHOT_KEY}${currentBucket - i}`;
    try {
      const data = await redis.get(key);
      if (data) results.push(JSON.parse(data) as SlaSnapshot);
    } catch { /* skip */ }
  }

  return results.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

// ─── Auto-escalation : créer des alertes quand SLA dépassé ───────────────────

export async function runSlaEscalation(): Promise<{ escalated: number }> {
  const now = new Date();
  let escalated = 0;

  // Dossiers OPEN dépassant leur SLA — forcer statut ESCALATED
  const openCases = await db
    .select({ id: cases.id, status: cases.status, severity: cases.severity, createdAt: cases.createdAt })
    .from(cases)
    .where(eq(cases.status, "OPEN"))
    .limit(500);

  for (const c of openCases) {
    const slaDays = CASE_SLA_DAYS[c.severity as keyof typeof CASE_SLA_DAYS] ?? CASE_SLA_DAYS.default;
    const ageDays = (now.getTime() - c.createdAt.getTime()) / 86_400_000;
    if (ageDays > slaDays) {
      await db.update(cases).set({ status: "ESCALATED", updatedAt: now }).where(eq(cases.id, c.id));
      escalated++;
    }
  }

  if (escalated > 0) {
    log.warn({ escalated }, "SLA dossiers dépassé — dossiers passés en ESCALATED");
  }

  return { escalated };
}
