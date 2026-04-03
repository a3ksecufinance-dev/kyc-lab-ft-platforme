import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../drizzle/schema", () => ({
  customers: {},
  documents: {},
  ubos: {},
  screeningResults: {},
  transactions: {},
}));

vi.mock("../../_core/db", () => ({ db: {} }));
vi.mock("../../_core/audit", () => ({
  audit: vi.fn().mockResolvedValue(undefined),
  createAuditFromContext: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
}));

// Mock du repository
vi.mock("./customers.repository", () => ({
  findManyCustomers: vi.fn(),
  findCustomerById: vi.fn(),
  findCustomerByCustomerId: vi.fn(),
  insertCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  getCustomerStats: vi.fn(),
  findDocumentsByCustomer: vi.fn(),
  findUBOsByCustomer: vi.fn(),
  findScreeningByCustomer: vi.fn(),
  findTransactionsByCustomer: vi.fn(),
  insertUBO: vi.fn(),
}));

import * as repo from "./customers.repository";
import {
  listCustomers,
  getCustomerOrThrow,
  createCustomer,
  updateCustomerStatus,
  calculateRiskScore,
  getCustomerStats,
} from "./customers.service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCustomer = {
  id: 1,
  customerId: "KYC-ABC12345",
  firstName: "Jean",
  lastName: "Dupont",
  email: "jean.dupont@example.com",
  phone: null,
  dateOfBirth: null,
  nationality: "FR",
  residenceCountry: "FR",
  address: null,
  city: "Paris",
  profession: "Ingénieur",
  employer: "Tech Corp",
  sourceOfFunds: "Salaire",
  monthlyIncome: "5000.00",
  customerType: "INDIVIDUAL" as const,
  kycStatus: "PENDING" as const,
  riskLevel: "LOW" as const,
  riskScore: 0,
  pepStatus: false,
  sanctionStatus: "PENDING" as const,
  frozenAt: null,
  frozenReason: null,
  frozenBy: null,
  erasureRequestedAt: null,
  erasureCompletedAt: null,
  erasureRequestedBy: null,
  erasureCompletedBy: null,
  lastReviewDate: null,
  nextReviewDate: null,
  assignedAnalyst: null,
  notes: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("customers.service — listCustomers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne les clients paginés", async () => {
    const mockResult = {
      data: [mockCustomer],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };
    vi.mocked(repo.findManyCustomers).mockResolvedValue(mockResult);

    const result = await listCustomers({ page: 1, limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(repo.findManyCustomers).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("passe les filtres au repository", async () => {
    vi.mocked(repo.findManyCustomers).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    await listCustomers({
      page: 1,
      limit: 20,
      search: "dupont",
      riskLevel: "HIGH",
      kycStatus: "IN_REVIEW",
    });

    expect(repo.findManyCustomers).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "dupont",
        riskLevel: "HIGH",
        kycStatus: "IN_REVIEW",
      })
    );
  });
});

describe("customers.service — getCustomerOrThrow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne le customer si trouvé", async () => {
    vi.mocked(repo.findCustomerById).mockResolvedValue(mockCustomer);
    const result = await getCustomerOrThrow(1);
    expect(result.customerId).toBe("KYC-ABC12345");
  });

  it("lève NOT_FOUND si absent", async () => {
    vi.mocked(repo.findCustomerById).mockResolvedValue(null);
    await expect(getCustomerOrThrow(999)).rejects.toThrow(TRPCError);
    await expect(getCustomerOrThrow(999)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("customers.service — createCustomer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crée un client INDIVIDUAL avec risque LOW", async () => {
    vi.mocked(repo.insertCustomer).mockResolvedValue({
      ...mockCustomer,
      customerType: "INDIVIDUAL",
      riskLevel: "LOW",
      riskScore: 0,
    });

    const result = await createCustomer({
      firstName: "Jean",
      lastName: "Dupont",
      customerType: "INDIVIDUAL",
    });

    expect(repo.insertCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        kycStatus: "PENDING",
        riskLevel: "LOW",
        riskScore: 0,
        pepStatus: false,
      })
    );
    expect(result.riskLevel).toBe("LOW");
  });

  it("crée un client PEP avec risque HIGH et score 60", async () => {
    vi.mocked(repo.insertCustomer).mockResolvedValue({
      ...mockCustomer,
      customerType: "PEP",
      riskLevel: "HIGH",
      riskScore: 60,
      pepStatus: true,
    });

    await createCustomer({
      firstName: "Alice",
      lastName: "Martin",
      customerType: "PEP",
    });

    expect(repo.insertCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        riskLevel: "HIGH",
        riskScore: 60,
        pepStatus: true,
      })
    );
  });

  it("crée un client FOREIGN avec risque MEDIUM et score 25", async () => {
    vi.mocked(repo.insertCustomer).mockResolvedValue({
      ...mockCustomer,
      customerType: "FOREIGN",
      riskLevel: "MEDIUM",
      riskScore: 25,
    });

    await createCustomer({
      firstName: "Bob",
      lastName: "Smith",
      customerType: "FOREIGN",
    });

    expect(repo.insertCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ riskLevel: "MEDIUM", riskScore: 25 })
    );
  });

  it("génère un customerId unique au format KYC-XXXXXXXX", async () => {
    vi.mocked(repo.insertCustomer).mockResolvedValue(mockCustomer);

    await createCustomer({ firstName: "Test", lastName: "User", customerType: "INDIVIDUAL" });

    const call = vi.mocked(repo.insertCustomer).mock.calls[0]?.[0];
    expect(call?.customerId).toMatch(/^KYC-[A-Za-z0-9_-]{8}$/);
  });
});

describe("customers.service — updateCustomerStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("analyst peut changer kycStatus", async () => {
    vi.mocked(repo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(repo.updateCustomer).mockResolvedValue({
      ...mockCustomer,
      kycStatus: "IN_REVIEW",
    });

    const result = await updateCustomerStatus(
      1,
      { kycStatus: "IN_REVIEW" },
      "analyst"
    );
    expect(result.kycStatus).toBe("IN_REVIEW");
  });

  it("analyst ne peut PAS changer riskLevel → FORBIDDEN", async () => {
    await expect(
      updateCustomerStatus(1, { riskLevel: "HIGH" }, "analyst")
    ).rejects.toThrow(TRPCError);

    await expect(
      updateCustomerStatus(1, { riskLevel: "HIGH" }, "analyst")
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("supervisor peut changer riskLevel", async () => {
    vi.mocked(repo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(repo.updateCustomer).mockResolvedValue({
      ...mockCustomer,
      riskLevel: "HIGH",
    });

    const result = await updateCustomerStatus(
      1,
      { riskLevel: "HIGH" },
      "supervisor"
    );
    expect(result.riskLevel).toBe("HIGH");
  });

  it("APPROVED ajoute automatiquement nextReviewDate dans 1 an", async () => {
    vi.mocked(repo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(repo.updateCustomer).mockResolvedValue({
      ...mockCustomer,
      kycStatus: "APPROVED",
    });

    await updateCustomerStatus(1, { kycStatus: "APPROVED" }, "supervisor");

    const call = vi.mocked(repo.updateCustomer).mock.calls[0]?.[1];
    expect(call?.nextReviewDate).toBeDefined();
    expect(call?.lastReviewDate).toBeDefined();

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    // Vérifie que la date est dans l'année prochaine (± 1 jour)
    const diff = Math.abs(
      (call!.nextReviewDate!.getTime() - nextYear.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diff).toBeLessThan(1);
  });
});

describe("customers.service — calculateRiskScore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("client INDIVIDUAL standard → score 10 (source of funds manquant)", async () => {
    const customer = { ...mockCustomer, sourceOfFunds: null, sanctionStatus: "CLEAR" as const };
    vi.mocked(repo.findCustomerById).mockResolvedValue(customer);
    vi.mocked(repo.updateCustomer).mockResolvedValue({ ...customer, riskScore: 10 });

    const result = await calculateRiskScore(1);

    expect(result.riskScore).toBe(10);
    expect(result.riskLevel).toBe("LOW");
    expect(result.factors).toHaveLength(1);
    expect(result.factors[0]?.rule).toBe("NO_SOURCE_OF_FUNDS");
  });

  it("client PEP → score minimum 40 + level HIGH", async () => {
    const customer = {
      ...mockCustomer,
      customerType: "PEP" as const,
      pepStatus: true,
      sanctionStatus: "CLEAR" as const,
      sourceOfFunds: "Salaire",
    };
    vi.mocked(repo.findCustomerById).mockResolvedValue(customer);
    vi.mocked(repo.updateCustomer).mockResolvedValue({ ...customer, riskScore: 40 });

    const result = await calculateRiskScore(1);

    expect(result.riskScore).toBeGreaterThanOrEqual(40);
    expect(result.factors.map((f) => f.rule)).toContain("PEP_STATUS");
  });

  it("match sanctions → score += 50 → level CRITICAL", async () => {
    const customer = {
      ...mockCustomer,
      sanctionStatus: "MATCH" as const,
      sourceOfFunds: "Salaire",
    };
    vi.mocked(repo.findCustomerById).mockResolvedValue(customer);
    vi.mocked(repo.updateCustomer).mockResolvedValue({ ...customer, riskScore: 50 });

    const result = await calculateRiskScore(1);

    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(result.factors.map((f) => f.rule)).toContain("SANCTION_MATCH");
  });

  it("score plafonné à 100 même avec plusieurs règles cumulées", async () => {
    const customer = {
      ...mockCustomer,
      customerType: "PEP" as const,
      pepStatus: true,
      sanctionStatus: "MATCH" as const,
      sourceOfFunds: null,
      profession: null,
      monthlyIncome: "100000.00",
      nationality: "MA",
      residenceCountry: "FR",
    };
    vi.mocked(repo.findCustomerById).mockResolvedValue(customer);
    vi.mocked(repo.updateCustomer).mockResolvedValue({ ...customer, riskScore: 100 });

    const result = await calculateRiskScore(1);

    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.riskLevel).toBe("CRITICAL");
  });

  it("lève NOT_FOUND si customer inexistant", async () => {
    vi.mocked(repo.findCustomerById).mockResolvedValue(null);
    await expect(calculateRiskScore(999)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("le score est DÉTERMINISTE — même inputs → même output", async () => {
    const customer = {
      ...mockCustomer,
      customerType: "FOREIGN" as const,
      nationality: "MA",
      residenceCountry: "FR",
      sanctionStatus: "CLEAR" as const,
      sourceOfFunds: null,
    };
    vi.mocked(repo.findCustomerById).mockResolvedValue(customer);
    vi.mocked(repo.updateCustomer).mockResolvedValue(customer);

    const result1 = await calculateRiskScore(1);
    vi.mocked(repo.findCustomerById).mockResolvedValue(customer);
    const result2 = await calculateRiskScore(1);

    // Score identique sur 2 appels successifs
    expect(result1.riskScore).toBe(result2.riskScore);
    expect(result1.riskLevel).toBe(result2.riskLevel);
  });
});

describe("customers.service — stats", () => {
  it("retourne les compteurs groupés", async () => {
    vi.mocked(repo.getCustomerStats).mockResolvedValue({
      total: 42,
      byRisk: { LOW: 20, MEDIUM: 15, HIGH: 5, CRITICAL: 2 },
      byStatus: { PENDING: 10, APPROVED: 25, REJECTED: 7 },
      byType: { INDIVIDUAL: 35, CORPORATE: 5, PEP: 2 },
    });

    const stats = await getCustomerStats();

    expect(stats.total).toBe(42);
    expect(stats.byRisk["HIGH"]).toBe(5);
    expect(stats.byStatus["APPROVED"]).toBe(25);
  });
});
