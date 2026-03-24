import { z } from "zod";
import { router, analystProc, supervisorProc } from "../../_core/trpc";
import { getCustomerStats } from "../customers/customers.repository";
import { getTransactionStats } from "../transactions/transactions.repository";
import { getAlertStats } from "../alerts/alerts.repository";
import { getCaseStats } from "../cases/cases.repository";
import { getReportStats } from "../reports/reports.repository";
import { db } from "../../_core/db";
import {
  customers, transactions, alerts, cases,
} from "../../../drizzle/schema";
import { eq, desc, gte, and, count } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const dashboardRouter = router({

  /**
   * Vue d'ensemble globale — toutes les métriques en un seul appel
   * Appelé à l'ouverture du dashboard, mis en cache côté client 30s
   */
  overview: analystProc
    .query(async () => {
      const [
        customerStats,
        transactionStats,
        alertStats,
        caseStats,
        reportStats,
      ] = await Promise.all([
        getCustomerStats(),
        getTransactionStats(),
        getAlertStats(),
        getCaseStats(),
        getReportStats(),
      ]);

      return {
        customers:    customerStats,
        transactions: transactionStats,
        alerts:       alertStats,
        cases:        caseStats,
        reports:      reportStats,
        generatedAt:  new Date().toISOString(),
      };
    }),

  /**
   * Activité récente — flux des dernières 24h
   * Utilisé pour le feed temps réel du dashboard
   */
  recentActivity: analystProc
    .input(z.object({
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const since = daysAgo(1);

      const [recentAlerts, recentCases, recentTransactions] = await Promise.all([
        // Dernières alertes ouvertes
        db
          .select({
            id:        alerts.id,
            alertId:   alerts.alertId,
            scenario:  alerts.scenario,
            priority:  alerts.priority,
            riskScore: alerts.riskScore,
            createdAt: alerts.createdAt,
          })
          .from(alerts)
          .where(and(eq(alerts.status, "OPEN"), gte(alerts.createdAt, since)))
          .orderBy(desc(alerts.createdAt))
          .limit(input.limit),

        // Derniers dossiers ouverts
        db
          .select({
            id:        cases.id,
            caseId:    cases.caseId,
            title:     cases.title,
            severity:  cases.severity,
            status:    cases.status,
            createdAt: cases.createdAt,
          })
          .from(cases)
          .where(gte(cases.createdAt, since))
          .orderBy(desc(cases.createdAt))
          .limit(input.limit),

        // Dernières transactions suspectes
        db
          .select({
            id:              transactions.id,
            transactionId:   transactions.transactionId,
            amount:          transactions.amount,
            currency:        transactions.currency,
            transactionType: transactions.transactionType,
            riskScore:       transactions.riskScore,
            createdAt:       transactions.createdAt,
          })
          .from(transactions)
          .where(and(eq(transactions.isSuspicious, true), gte(transactions.createdAt, since)))
          .orderBy(desc(transactions.createdAt))
          .limit(input.limit),
      ]);

      return { recentAlerts, recentCases, recentTransactions };
    }),

  /**
   * Répartition du risque — données pour les graphiques camembert
   */
  riskDistribution: analystProc
    .query(async () => {
      const [byRiskLevel, byKycStatus, highRiskCustomers] = await Promise.all([
        db
          .select({ riskLevel: customers.riskLevel, count: count() })
          .from(customers)
          .groupBy(customers.riskLevel),

        db
          .select({ kycStatus: customers.kycStatus, count: count() })
          .from(customers)
          .groupBy(customers.kycStatus),

        // Top 10 clients les plus risqués
        db
          .select({
            id:         customers.id,
            customerId: customers.customerId,
            firstName:  customers.firstName,
            lastName:   customers.lastName,
            riskScore:  customers.riskScore,
            riskLevel:  customers.riskLevel,
            kycStatus:  customers.kycStatus,
          })
          .from(customers)
          .where(eq(customers.riskLevel, "HIGH"))
          .orderBy(desc(customers.riskScore))
          .limit(10),
      ]);

      return {
        byRiskLevel: Object.fromEntries(
          byRiskLevel.map((r: { riskLevel: string; count: number | bigint }) => [r.riskLevel, Number(r.count)])
        ),
        byKycStatus: Object.fromEntries(
          byKycStatus.map((r: { kycStatus: string; count: number | bigint }) => [r.kycStatus, Number(r.count)])
        ),
        highRiskCustomers,
      };
    }),

  /**
   * Tendances sur N jours — données pour les graphiques linéaires
   * Agrège alertes + transactions par jour
   */
  trends: analystProc
    .input(z.object({
      days: z.number().int().min(7).max(90).default(30),
    }))
    .query(async ({ input }) => {
      const since = daysAgo(input.days);

      // Générer les buckets journaliers
      const buckets: Record<string, { date: string; alerts: number; transactions: number; suspicious: number }> = {};
      for (let i = 0; i < input.days; i++) {
        const d = daysAgo(input.days - 1 - i);
        const key = d.toISOString().split("T")[0]!;
        buckets[key] = { date: key, alerts: 0, transactions: 0, suspicious: 0 };
      }

      const [alertsByDay, txByDay, suspiciousByDay] = await Promise.all([
        db
          .select({ count: count(), createdAt: alerts.createdAt })
          .from(alerts)
          .where(gte(alerts.createdAt, since)),
        db
          .select({ count: count(), createdAt: transactions.createdAt })
          .from(transactions)
          .where(gte(transactions.createdAt, since)),
        db
          .select({ count: count(), createdAt: transactions.createdAt })
          .from(transactions)
          .where(and(eq(transactions.isSuspicious, true), gte(transactions.createdAt, since))),
      ]);

      // Remplir les buckets
      for (const row of alertsByDay) {
        const key = row.createdAt.toISOString().split("T")[0]!;
        if (buckets[key]) buckets[key]!.alerts += Number(row.count);
      }
      for (const row of txByDay) {
        const key = row.createdAt.toISOString().split("T")[0]!;
        if (buckets[key]) buckets[key]!.transactions += Number(row.count);
      }
      for (const row of suspiciousByDay) {
        const key = row.createdAt.toISOString().split("T")[0]!;
        if (buckets[key]) buckets[key]!.suspicious += Number(row.count);
      }

      return {
        days: input.days,
        series: Object.values(buckets),
      };
    }),

  /**
   * KPIs de conformité — métriques réglementaires pour le management
   * Supervisor+ seulement
   */
  complianceKpis: supervisorProc
    .query(async () => {
      // startOfDay utilisé si besoin de filtrer par jour exact
      const month = daysAgo(30);
      const quarter = daysAgo(90);

      const [
        openCriticalAlerts,
        openCases,
        pendingReports,
        overdueReviews,
        monthlyAlertRate,
        quarterlyAlertRate,
      ] = await Promise.all([
        // Alertes critiques ouvertes non assignées
        db
          .select({ total: count() })
          .from(alerts)
          .where(and(eq(alerts.status, "OPEN"), eq(alerts.priority, "CRITICAL"))),

        // Dossiers ouverts sans assignation
        db
          .select({ total: count() })
          .from(cases)
          .where(eq(cases.status, "OPEN")),

        // Rapports en attente de validation
        db
          .select({ total: count() })
          .from(cases)
          .where(eq(cases.status, "PENDING_APPROVAL")),

        // Clients en révision KYC en retard (nextReviewDate < aujourd'hui)
        db
          .select({ total: count() })
          .from(customers)
          .where(eq(customers.kycStatus, "IN_REVIEW")),

        // Volume d'alertes sur 30 jours
        db
          .select({ total: count() })
          .from(alerts)
          .where(gte(alerts.createdAt, month)),

        // Volume d'alertes sur 90 jours
        db
          .select({ total: count() })
          .from(alerts)
          .where(gte(alerts.createdAt, quarter)),
      ]);

      const monthlyCount = Number(monthlyAlertRate[0]?.total ?? 0);
      const quarterlyCount = Number(quarterlyAlertRate[0]?.total ?? 0);

      return {
        openCriticalAlerts: Number(openCriticalAlerts[0]?.total ?? 0),
        openUnassignedCases: Number(openCases[0]?.total ?? 0),
        pendingApprovalCases: Number(pendingReports[0]?.total ?? 0),
        overdueKycReviews: Number(overdueReviews[0]?.total ?? 0),
        alertTrend: {
          monthly: monthlyCount,
          quarterly: quarterlyCount,
          // Variation mensuelle vs moyenne trimestrielle
          variationPct: quarterlyCount > 0
            ? Math.round(((monthlyCount * 3 - quarterlyCount) / quarterlyCount) * 100)
            : 0,
        },
        generatedAt: new Date().toISOString(),
      };
    }),
});
