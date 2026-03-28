/**
 * Reporting AMLD6 — 6ème Directive Anti-Blanchiment (UE 2018/1673)
 *
 * Calcule les 12 KPIs réglementaires requis pour le rapport annuel de conformité :
 *
 *  1.  Transactions analysées (volume + montant total)
 *  2.  Taux de détection (% transactions flaggées)
 *  3.  Alertes générées par niveau de risque
 *  4.  SAR/STR déclarés (délai moyen de déclaration)
 *  5.  Taux de faux positifs (alertes DISMISSED / total)
 *  6.  Clients à haut risque (répartition par niveau)
 *  7.  Clients PEP actifs
 *  8.  Screenings sanctions (MATCH / REVIEW / CLEAR)
 *  9.  Dossiers ouverts / fermés / escaladés
 * 10.  Couverture KYC (% clients avec KYC approuvé)
 * 11.  Transactions bloquées (montant préservé estimé)
 * 12.  Délai moyen de revue des alertes (SLA réglementaire : 5 jours ouvrés)
 */

import { db } from "../../_core/db";
import {
  transactions, alerts, cases, customers,
  reports as reportsTable, screeningResults,
} from "../../../drizzle/schema";
import { and, gte, lte, count, sum, avg, eq, ne, sql } from "drizzle-orm";
import { createLogger } from "../../_core/logger";

const log = createLogger("amld6");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Amld6KpiPeriod {
  from: Date;
  to:   Date;
}

export interface Amld6KpiResult {
  period:         Amld6KpiPeriod;
  generatedAt:    Date;

  // 1 — Volume transactions
  transactions: {
    total:        number;
    totalAmount:  number;
    suspicious:   number;
    blocked:      number;
    detectionRate: number;  // %
  };

  // 2 — Alertes
  alerts: {
    total:         number;
    byLevel: {
      critical:    number;
      high:        number;
      medium:      number;
      low:         number;
    };
    resolved:      number;
    dismissed:     number;
    falsePositiveRate: number;  // %
    avgResolutionDaysFiltered: number;
  };

  // 3 — SAR/STR
  declarations: {
    sarCount:      number;
    strCount:      number;
    submitted:     number;
    avgDaysToSubmit: number;  // délai moyen création → soumission
  };

  // 4 — Clients & KYC
  customers: {
    total:         number;
    byRiskLevel: {
      critical:    number;
      high:        number;
      medium:      number;
      low:         number;
    };
    pepActive:     number;
    sanctionMatch: number;
    kycApproved:   number;
    kycCoverage:   number;  // %
  };

  // 5 — Screening sanctions
  screening: {
    total:         number;
    matchCount:    number;
    reviewCount:   number;
    clearCount:    number;
    matchRate:     number;  // %
  };

  // 6 — Dossiers
  cases: {
    opened:        number;
    closed:        number;
    escalated:     number;
    avgDurationDays: number;
  };

  // 7 — Indicateurs SLA réglementaires
  compliance: {
    alertSlaBreaches:     number;   // alertes > 5 jours ouvrés sans résolution
    avgAlertAgeOpenDays:  number;   // âge moyen des alertes ouvertes
    mfaAdoptionRate:      number;   // % utilisateurs avec MFA activé
  };
}

// ─── Calcul des KPIs ──────────────────────────────────────────────────────────

export async function computeAmld6Kpis(period: Amld6KpiPeriod): Promise<Amld6KpiResult> {
  const { from, to } = period;
  const dateFilter = and(gte(transactions.createdAt, from), lte(transactions.createdAt, to));

  log.info({ from, to }, "Calcul KPIs AMLD6");

  // ── 1. Transactions ────────────────────────────────────────────────────────
  const [txStats] = await db.select({
    total:     count(),
    suspicious: count(sql`CASE WHEN ${transactions.isSuspicious} = true THEN 1 END`),
    blocked:    count(sql`CASE WHEN ${transactions.status} = 'BLOCKED' THEN 1 END`),
    totalAmount: sum(transactions.amount),
  }).from(transactions).where(dateFilter);

  const txTotal     = Number(txStats?.total ?? 0);
  const txSuspicious = Number(txStats?.suspicious ?? 0);
  const txBlocked    = Number(txStats?.blocked ?? 0);
  const txAmount     = Number(txStats?.totalAmount ?? 0);

  // ── 2. Alertes ─────────────────────────────────────────────────────────────
  const alertFilter = and(
    gte(alerts.createdAt, from),
    lte(alerts.createdAt, to)
  );

  const [alertStats] = await db.select({
    total:    count(),
    critical: count(sql`CASE WHEN ${alerts.priority} = 'CRITICAL' THEN 1 END`),
    high:     count(sql`CASE WHEN ${alerts.priority} = 'HIGH'     THEN 1 END`),
    medium:   count(sql`CASE WHEN ${alerts.priority} = 'MEDIUM'   THEN 1 END`),
    low:      count(sql`CASE WHEN ${alerts.priority} = 'LOW'      THEN 1 END`),
    resolved: count(sql`CASE WHEN ${alerts.status} = 'CLOSED'         THEN 1 END`),
    dismissed: count(sql`CASE WHEN ${alerts.status} = 'FALSE_POSITIVE' THEN 1 END`),
  }).from(alerts).where(alertFilter);

  const alertTotal    = Number(alertStats?.total ?? 0);
  const alertDismissed = Number(alertStats?.dismissed ?? 0);
  const alertResolved  = Number(alertStats?.resolved ?? 0);

  // Délai moyen de résolution (jours)
  const [resolutionStats] = await db.select({
    avgDays: avg(
      sql`EXTRACT(EPOCH FROM (${alerts.resolvedAt} - ${alerts.createdAt})) / 86400`
    ),
  }).from(alerts).where(and(alertFilter, ne(alerts.status, "OPEN" as "OPEN")));

  const avgResolutionDays = Number(resolutionStats?.avgDays ?? 0);

  // ── 3. Déclarations SAR/STR ────────────────────────────────────────────────
  const reportFilter = and(
    gte(reportsTable.createdAt, from),
    lte(reportsTable.createdAt, to)
  );

  const [reportStats] = await db.select({
    sarCount:  count(sql`CASE WHEN ${reportsTable.reportType} = 'SAR' THEN 1 END`),
    strCount:  count(sql`CASE WHEN ${reportsTable.reportType} = 'STR' THEN 1 END`),
    submitted: count(sql`CASE WHEN ${reportsTable.status} IN ('SUBMITTED','APPROVED') THEN 1 END`),
    avgDays: avg(
      sql`CASE WHEN ${reportsTable.submittedAt} IS NOT NULL
          THEN EXTRACT(EPOCH FROM (${reportsTable.submittedAt} - ${reportsTable.createdAt})) / 86400
          END`
    ),
  }).from(reportsTable).where(reportFilter);

  // ── 4. Clients ─────────────────────────────────────────────────────────────
  const [custStats] = await db.select({
    total:        count(),
    critical:     count(sql`CASE WHEN ${customers.riskLevel} = 'CRITICAL' THEN 1 END`),
    high:         count(sql`CASE WHEN ${customers.riskLevel} = 'HIGH'     THEN 1 END`),
    medium:       count(sql`CASE WHEN ${customers.riskLevel} = 'MEDIUM'   THEN 1 END`),
    low:          count(sql`CASE WHEN ${customers.riskLevel} = 'LOW'      THEN 1 END`),
    pep:          count(sql`CASE WHEN ${customers.pepStatus} = true       THEN 1 END`),
    sanctionMatch: count(sql`CASE WHEN ${customers.sanctionStatus} = 'MATCH' THEN 1 END`),
    kycApproved:  count(sql`CASE WHEN ${customers.kycStatus} = 'APPROVED' THEN 1 END`),
  }).from(customers);

  const custTotal      = Number(custStats?.total ?? 0);
  const custKycApproved = Number(custStats?.kycApproved ?? 0);

  // ── 5. Screening ───────────────────────────────────────────────────────────
  const screeningFilter = and(
    gte(screeningResults.createdAt, from),
    lte(screeningResults.createdAt, to)
  );

  const [screenStats] = await db.select({
    total:  count(),
    match:  count(sql`CASE WHEN ${screeningResults.status} = 'MATCH'  THEN 1 END`),
    review: count(sql`CASE WHEN ${screeningResults.status} = 'REVIEW' THEN 1 END`),
    clear:  count(sql`CASE WHEN ${screeningResults.status} = 'CLEAR'  THEN 1 END`),
  }).from(screeningResults).where(screeningFilter);

  const screenTotal = Number(screenStats?.total ?? 0);
  const screenMatch = Number(screenStats?.match ?? 0);

  // ── 6. Dossiers ────────────────────────────────────────────────────────────
  const caseFilter = and(
    gte(cases.createdAt, from),
    lte(cases.createdAt, to)
  );

  const [caseStats] = await db.select({
    opened:    count(),
    closed:    count(sql`CASE WHEN ${cases.status} = 'CLOSED'     THEN 1 END`),
    escalated: count(sql`CASE WHEN ${cases.status} = 'ESCALATED'  THEN 1 END`),
    avgDays: avg(
      sql`CASE WHEN ${cases.decisionAt} IS NOT NULL
          THEN EXTRACT(EPOCH FROM (${cases.decisionAt} - ${cases.createdAt})) / 86400
          END`
    ),
  }).from(cases).where(caseFilter);

  // ── 7. SLA & Compliance ────────────────────────────────────────────────────
  const SLA_DAYS = 5;
  const slaThreshold = new Date();
  slaThreshold.setDate(slaThreshold.getDate() - SLA_DAYS);

  const [slaStats] = await db.select({
    breaches: count(
      sql`CASE WHEN ${alerts.status} = 'OPEN'
               AND ${alerts.createdAt} < ${slaThreshold}
          THEN 1 END`
    ),
    avgAgeOpen: avg(
      sql`CASE WHEN ${alerts.status} = 'OPEN'
          THEN EXTRACT(EPOCH FROM (NOW() - ${alerts.createdAt})) / 86400
          END`
    ),
  }).from(alerts).where(alertFilter);

  // Taux MFA — depuis la table users
  const { users: usersTable } = await import("../../../drizzle/schema");
  const [mfaStats] = await db.select({
    total:   count(),
    enabled: count(sql`CASE WHEN ${usersTable.mfaEnabled} = true THEN 1 END`),
  }).from(usersTable).where(eq(usersTable.isActive, true));

  const mfaTotal   = Number(mfaStats?.total ?? 0);
  const mfaEnabled = Number(mfaStats?.enabled ?? 0);

  // ── Assemblage ─────────────────────────────────────────────────────────────
  return {
    period,
    generatedAt: new Date(),

    transactions: {
      total:         txTotal,
      totalAmount:   Math.round(txAmount * 100) / 100,
      suspicious:    txSuspicious,
      blocked:       txBlocked,
      detectionRate: txTotal > 0 ? Math.round(txSuspicious / txTotal * 1000) / 10 : 0,
    },

    alerts: {
      total:         alertTotal,
      byLevel: {
        critical: Number(alertStats?.critical ?? 0),
        high:     Number(alertStats?.high     ?? 0),
        medium:   Number(alertStats?.medium   ?? 0),
        low:      Number(alertStats?.low      ?? 0),
      },
      resolved:      alertResolved,
      dismissed:     alertDismissed,
      falsePositiveRate: alertTotal > 0
        ? Math.round(alertDismissed / alertTotal * 1000) / 10 : 0,
      avgResolutionDaysFiltered: Math.round(avgResolutionDays * 10) / 10,
    },

    declarations: {
      sarCount:      Number(reportStats?.sarCount  ?? 0),
      strCount:      Number(reportStats?.strCount  ?? 0),
      submitted:     Number(reportStats?.submitted ?? 0),
      avgDaysToSubmit: Math.round(Number(reportStats?.avgDays ?? 0) * 10) / 10,
    },

    customers: {
      total:         custTotal,
      byRiskLevel: {
        critical: Number(custStats?.critical ?? 0),
        high:     Number(custStats?.high     ?? 0),
        medium:   Number(custStats?.medium   ?? 0),
        low:      Number(custStats?.low      ?? 0),
      },
      pepActive:     Number(custStats?.pep            ?? 0),
      sanctionMatch: Number(custStats?.sanctionMatch  ?? 0),
      kycApproved:   custKycApproved,
      kycCoverage:   custTotal > 0
        ? Math.round(custKycApproved / custTotal * 1000) / 10 : 0,
    },

    screening: {
      total:      screenTotal,
      matchCount: screenMatch,
      reviewCount: Number(screenStats?.review ?? 0),
      clearCount:  Number(screenStats?.clear  ?? 0),
      matchRate:   screenTotal > 0
        ? Math.round(screenMatch / screenTotal * 1000) / 10 : 0,
    },

    cases: {
      opened:          Number(caseStats?.opened    ?? 0),
      closed:          Number(caseStats?.closed    ?? 0),
      escalated:       Number(caseStats?.escalated ?? 0),
      avgDurationDays: Math.round(Number(caseStats?.avgDays ?? 0) * 10) / 10,
    },

    compliance: {
      alertSlaBreaches:    Number(slaStats?.breaches    ?? 0),
      avgAlertAgeOpenDays: Math.round(Number(slaStats?.avgAgeOpen ?? 0) * 10) / 10,
      mfaAdoptionRate:     mfaTotal > 0
        ? Math.round(mfaEnabled / mfaTotal * 1000) / 10 : 0,
    },
  };
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

export function kpisToCsv(kpis: Amld6KpiResult): string {
  const rows: string[][] = [
    ["Indicateur", "Valeur", "Unité"],
    ["Période du", kpis.period.from.toISOString().split("T")[0]!, ""],
    ["Période au", kpis.period.to.toISOString().split("T")[0]!, ""],
    ["", "", ""],
    ["=== TRANSACTIONS ===", "", ""],
    ["Total analysées",       String(kpis.transactions.total),       "nb"],
    ["Montant total",         String(kpis.transactions.totalAmount),  "EUR"],
    ["Suspectes",             String(kpis.transactions.suspicious),   "nb"],
    ["Bloquées",              String(kpis.transactions.blocked),      "nb"],
    ["Taux de détection",     String(kpis.transactions.detectionRate), "%"],
    ["", "", ""],
    ["=== ALERTES ===", "", ""],
    ["Total alertes",         String(kpis.alerts.total),             "nb"],
    ["Critiques",             String(kpis.alerts.byLevel.critical),  "nb"],
    ["Hautes",                String(kpis.alerts.byLevel.high),      "nb"],
    ["Moyennes",              String(kpis.alerts.byLevel.medium),    "nb"],
    ["Basses",                String(kpis.alerts.byLevel.low),       "nb"],
    ["Résolues",              String(kpis.alerts.resolved),          "nb"],
    ["Taux faux positifs",    String(kpis.alerts.falsePositiveRate), "%"],
    ["Délai moyen résolution", String(kpis.alerts.avgResolutionDaysFiltered), "jours"],
    ["Violations SLA (>5j)",  String(kpis.compliance.alertSlaBreaches), "nb"],
    ["", "", ""],
    ["=== DÉCLARATIONS ===", "", ""],
    ["SAR émis",              String(kpis.declarations.sarCount),    "nb"],
    ["STR émis",              String(kpis.declarations.strCount),    "nb"],
    ["Soumis régulateur",     String(kpis.declarations.submitted),   "nb"],
    ["Délai moyen soumission", String(kpis.declarations.avgDaysToSubmit), "jours"],
    ["", "", ""],
    ["=== CLIENTS ===", "", ""],
    ["Total clients",         String(kpis.customers.total),          "nb"],
    ["Risque CRITICAL",       String(kpis.customers.byRiskLevel.critical), "nb"],
    ["Risque HIGH",           String(kpis.customers.byRiskLevel.high), "nb"],
    ["Risque MEDIUM",         String(kpis.customers.byRiskLevel.medium), "nb"],
    ["PEP actifs",            String(kpis.customers.pepActive),      "nb"],
    ["Correspondances sanctions", String(kpis.customers.sanctionMatch), "nb"],
    ["Couverture KYC",        String(kpis.customers.kycCoverage),   "%"],
    ["", "", ""],
    ["=== SCREENING ===", "", ""],
    ["Total screenings",      String(kpis.screening.total),          "nb"],
    ["Correspondances",       String(kpis.screening.matchCount),     "nb"],
    ["En révision",           String(kpis.screening.reviewCount),    "nb"],
    ["Taux de match",         String(kpis.screening.matchRate),      "%"],
    ["", "", ""],
    ["=== CONFORMITÉ ===", "", ""],
    ["Taux adoption MFA",     String(kpis.compliance.mfaAdoptionRate), "%"],
    ["Âge moyen alertes ouvertes", String(kpis.compliance.avgAlertAgeOpenDays), "jours"],
  ];

  return rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
}
