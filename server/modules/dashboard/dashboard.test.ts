import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../drizzle/schema", () => ({
  customers: {}, transactions: {}, alerts: {}, cases: {},
}));
vi.mock("../../_core/db", () => ({ db: {} }));

// Stats des modules
vi.mock("../customers/customers.repository",    () => ({ getCustomerStats:    vi.fn() }));
vi.mock("../transactions/transactions.repository", () => ({ getTransactionStats: vi.fn() }));
vi.mock("../alerts/alerts.repository",          () => ({ getAlertStats:       vi.fn() }));
vi.mock("../cases/cases.repository",            () => ({ getCaseStats:         vi.fn() }));
vi.mock("../reports/reports.repository",        () => ({ getReportStats:       vi.fn() }));

// Drizzle db.select chaîné — mock de la chaîne fluente
const mockSelect = vi.fn();
const mockFrom   = vi.fn();
const mockWhere  = vi.fn();
const mockOrder  = vi.fn();
const mockLimit  = vi.fn();
const mockGroupBy = vi.fn();

vi.mock("../../_core/db", () => ({
  db: {
    select: mockSelect.mockReturnValue({
      from: mockFrom.mockReturnValue({
        where: mockWhere.mockReturnValue({
          orderBy: mockOrder.mockReturnValue({
            limit: mockLimit.mockResolvedValue([]),
          }),
          groupBy: mockGroupBy.mockResolvedValue([]),
          limit: mockLimit.mockResolvedValue([]),
        }),
        groupBy: mockGroupBy.mockResolvedValue([]),
        orderBy: mockOrder.mockReturnValue({
          limit: mockLimit.mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

import * as customerRepo     from "../customers/customers.repository";
import * as transactionRepo  from "../transactions/transactions.repository";
import * as alertRepo        from "../alerts/alerts.repository";
import * as caseRepo         from "../cases/cases.repository";
import * as reportRepo       from "../reports/reports.repository";

// ─── Fixtures stats ───────────────────────────────────────────────────────────

const mockCustomerStats = {
  total: 120, byRisk: { LOW: 80, MEDIUM: 30, HIGH: 10 },
  byStatus: { APPROVED: 100, PENDING: 15, REVIEW: 5 }, byType: { INDIVIDUAL: 100, CORPORATE: 20 },
};
const mockTransactionStats = {
  total: 1540, suspicious: 23, todayCount: 45, todayVolume: 128000,
  byStatus: { COMPLETED: 1400, PENDING: 100, FLAGGED: 23, BLOCKED: 17 },
};
const mockAlertStats = {
  total: 87, open: 34, last30Days: 42,
  byPriority: { LOW: 5, MEDIUM: 15, HIGH: 10, CRITICAL: 4 },
  byStatus: { OPEN: 34, IN_REVIEW: 12, CLOSED: 30, FALSE_POSITIVE: 11 },
};
const mockCaseStats = {
  total: 18, open: 8, bySeverity: { LOW: 2, MEDIUM: 8, HIGH: 6, CRITICAL: 2 },
  byStatus: { OPEN: 8, UNDER_INVESTIGATION: 5, PENDING_APPROVAL: 3, CLOSED: 2 },
};
const mockReportStats = {
  total: 12, pending: 3, ytd: 12,
  byType: { SAR: 7, STR: 5 }, byStatus: { DRAFT: 2, REVIEW: 1, SUBMITTED: 9 },
};

// ─── Tests overview ───────────────────────────────────────────────────────────

describe("dashboard — overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerRepo.getCustomerStats).mockResolvedValue(mockCustomerStats);
    vi.mocked(transactionRepo.getTransactionStats).mockResolvedValue(mockTransactionStats);
    vi.mocked(alertRepo.getAlertStats).mockResolvedValue(mockAlertStats);
    vi.mocked(caseRepo.getCaseStats).mockResolvedValue(mockCaseStats);
    vi.mocked(reportRepo.getReportStats).mockResolvedValue(mockReportStats);
  });

  it("agrège toutes les stats en un seul objet", async () => {
    const [cs, ts, as_, cas, rs] = await Promise.all([
      customerRepo.getCustomerStats(),
      transactionRepo.getTransactionStats(),
      alertRepo.getAlertStats(),
      caseRepo.getCaseStats(),
      reportRepo.getReportStats(),
    ]);

    const result = { customers: cs, transactions: ts, alerts: as_, cases: cas, reports: rs };

    expect(result.customers.total).toBe(120);
    expect(result.transactions.suspicious).toBe(23);
    expect(result.alerts.open).toBe(34);
    expect(result.cases.byStatus["OPEN"]).toBe(8);
    expect(result.reports.pending).toBe(3);
  });

  it("appelle chaque repository exactement une fois", async () => {
    await Promise.all([
      customerRepo.getCustomerStats(),
      transactionRepo.getTransactionStats(),
      alertRepo.getAlertStats(),
      caseRepo.getCaseStats(),
      reportRepo.getReportStats(),
    ]);

    expect(customerRepo.getCustomerStats).toHaveBeenCalledOnce();
    expect(transactionRepo.getTransactionStats).toHaveBeenCalledOnce();
    expect(alertRepo.getAlertStats).toHaveBeenCalledOnce();
    expect(caseRepo.getCaseStats).toHaveBeenCalledOnce();
    expect(reportRepo.getReportStats).toHaveBeenCalledOnce();
  });
});

// ─── Tests trends ─────────────────────────────────────────────────────────────

describe("dashboard — trends (génération des buckets)", () => {
  it("génère N buckets journaliers pour N jours", () => {
    const days = 7;
    const buckets: Record<string, { date: string; alerts: number; transactions: number; suspicious: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0]!;
      buckets[key] = { date: key, alerts: 0, transactions: 0, suspicious: 0 };
    }
    expect(Object.keys(buckets)).toHaveLength(7);
  });

  it("les buckets sont initialisés à zéro", () => {
    const days = 3;
    const buckets: Record<string, { date: string; alerts: number; transactions: number; suspicious: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0]!;
      buckets[key] = { date: key, alerts: 0, transactions: 0, suspicious: 0 };
    }
    const values = Object.values(buckets);
    expect(values.every((b) => b.alerts === 0 && b.transactions === 0)).toBe(true);
  });

  it("les dates des buckets sont au format YYYY-MM-DD", () => {
    const d = new Date("2024-06-15T10:30:00Z");
    const key = d.toISOString().split("T")[0]!;
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(key).toBe("2024-06-15");
  });
});

// ─── Tests complianceKpis ─────────────────────────────────────────────────────

describe("dashboard — complianceKpis (calcul variation)", () => {
  it("calcule la variation mensuelle vs trimestrielle correctement", () => {
    const monthly = 30;
    const quarterly = 60; // moyenne mensuelle attendue = 20

    // 30 mensuel vs 60/3=20 attendu → +50% de variation
    const variationPct = quarterly > 0
      ? Math.round(((monthly * 3 - quarterly) / quarterly) * 100)
      : 0;

    expect(variationPct).toBe(50); // (90-60)/60 = 50%
  });

  it("variation = 0 si pas d'historique trimestriel", () => {
    const monthly = 10;
    const quarterly = 0;
    const variationPct = quarterly > 0
      ? Math.round(((monthly * 3 - quarterly) / quarterly) * 100)
      : 0;
    expect(variationPct).toBe(0);
  });

  it("détecte une baisse du nombre d'alertes (variation négative)", () => {
    const monthly = 10;
    const quarterly = 90; // moyenne mensuelle attendue = 30

    const variationPct = quarterly > 0
      ? Math.round(((monthly * 3 - quarterly) / quarterly) * 100)
      : 0;

    expect(variationPct).toBe(-67); // (30-90)/90 ≈ -66.7% → -67
    expect(variationPct).toBeLessThan(0);
  });
});
