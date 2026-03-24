import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Moteur réel — seul le repo est mocké

vi.mock("../../../drizzle/schema", () => ({ transactions: {}, alerts: {} }));
vi.mock("../../_core/db", () => ({ db: {} }));
vi.mock("../../_core/env", () => ({
  ENV: {
    AML_THRESHOLD_SINGLE_TX: 10000,
    AML_THRESHOLD_STRUCTURING: 3000,
    AML_STRUCTURING_WINDOW_HOURS: 24,
    AML_FREQUENCY_THRESHOLD: 10,
    AML_VOLUME_VARIATION_THRESHOLD: 300,
  },
}));
vi.mock("../../_core/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Mock du repo transactions — le moteur appelle ces fonctions
vi.mock("../transactions/transactions.repository", () => ({
  findRecentByCustomer: vi.fn(),
  getVolumeStats: vi.fn(),
  updateTransaction: vi.fn(),
  insertAlert: vi.fn(),
}));

import * as repo from "../transactions/transactions.repository";
import { runAmlRules } from "./aml.engine";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseTx = {
  id: 1,
  transactionId: "TXN-TEST000001",
  customerId: 1,
  amount: "500.00",
  currency: "EUR",
  transactionType: "TRANSFER" as const,
  channel: "ONLINE" as const,
  counterparty: null,
  counterpartyCountry: null,
  counterpartyBank: null,
  purpose: null,
  riskScore: 0,
  riskRules: null,
  status: "PENDING" as const,
  isSuspicious: false,
  flagReason: null,
  transactionDate: new Date("2024-06-01T10:00:00Z"),
  createdAt: new Date("2024-06-01T10:00:00Z"),
};

const baseCustomer = {
  id: 1,
  customerId: "KYC-TEST0001",
  firstName: "Jean",
  lastName: "Dupont",
  email: null, phone: null, dateOfBirth: null,
  nationality: "FR",
  residenceCountry: "FR",
  address: null, city: null,
  profession: "Ingénieur",
  employer: null,
  sourceOfFunds: "Salaire",
  monthlyIncome: "5000.00",
  customerType: "INDIVIDUAL" as const,
  kycStatus: "APPROVED" as const,
  riskLevel: "LOW" as const,
  riskScore: 10,
  pepStatus: false,
  sanctionStatus: "CLEAR" as const,
  lastReviewDate: null,
  nextReviewDate: null,
  assignedAnalyst: null,
  notes: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const mockAlertReturn = {
  id: 1, alertId: "ALT-TEST1234", customerId: 1, transactionId: 1,
  scenario: "TEST", alertType: "THRESHOLD" as const, priority: "HIGH" as const,
  status: "OPEN" as const, riskScore: 60, reason: "test",
  enrichmentData: null, assignedTo: null, resolvedBy: null,
  resolvedAt: null, resolution: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const tx = (o: Partial<typeof baseTx> = {}) => ({ ...baseTx, ...o });
const customer = (o: Partial<typeof baseCustomer> = {}) => ({ ...baseCustomer, ...o });

// ─── Setup par défaut ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findRecentByCustomer).mockResolvedValue([]);
  vi.mocked(repo.getVolumeStats).mockResolvedValue({ totalAmount: 0, count: 0 });
  vi.mocked(repo.updateTransaction).mockResolvedValue(baseTx);
  vi.mocked(repo.insertAlert).mockResolvedValue(mockAlertReturn);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("aml.engine — runAmlRules", () => {
  it("transaction normale (500€) → aucune règle → statut COMPLETED", async () => {
    const triggered = await runAmlRules(tx(), customer());

    expect(triggered).toHaveLength(0);
    expect(repo.updateTransaction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "COMPLETED", riskScore: 0 })
    );
    expect(repo.insertAlert).not.toHaveBeenCalled();
  });

  it("montant ≥ 10 000€ → THRESHOLD_EXCEEDED → alerte FLAGGED", async () => {
    const triggered = await runAmlRules(tx({ amount: "15000.00" }), customer());

    expect(triggered.map((r) => r.rule)).toContain("THRESHOLD_EXCEEDED");
    expect(repo.insertAlert).toHaveBeenCalledOnce();
    expect(repo.updateTransaction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "FLAGGED", isSuspicious: true })
    );
  });

  it("contrepartie pays à risque FATF (KP) → HIGH_RISK_COUNTRY", async () => {
    // On force le type car le champ DB est `null` mais la valeur réelle est une string
    const triggered = await runAmlRules(
      tx({ counterpartyCountry: "KP" as unknown as null }),
      customer()
    );

    expect(triggered.map((r) => r.rule)).toContain("HIGH_RISK_COUNTRY");
    expect(repo.insertAlert).toHaveBeenCalledOnce();
  });

  it("client PEP → PEP_TRANSACTION toujours déclenché", async () => {
    const triggered = await runAmlRules(
      tx({ amount: "100.00" }),
      customer({ pepStatus: true })
    );

    expect(triggered.map((r) => r.rule)).toContain("PEP_TRANSACTION");
    expect(repo.insertAlert).toHaveBeenCalledOnce();
  });

  it("structuring : 2 tx sous seuil récentes + nouvelle tx → STRUCTURING", async () => {
    // Deux transactions antérieures entre 3 000€ et 10 000€
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue([
      { ...baseTx, id: 2, amount: "4500.00", transactionId: "TXN-OLD0000001" },
      { ...baseTx, id: 3, amount: "4500.00", transactionId: "TXN-OLD0000002" },
    ]);

    const triggered = await runAmlRules(tx({ amount: "3000.00" }), customer());

    // total = 4500 + 4500 + 3000 = 12 000€ > 10 000€ → structuring
    expect(triggered.map((r) => r.rule)).toContain("STRUCTURING");
  });

  it("plusieurs règles cumulées → score plafonné à 100", async () => {
    // THRESHOLD (80) + HIGH_RISK_COUNTRY (70) + PEP (50) → sans plafond = 200
    const triggered = await runAmlRules(
      tx({ amount: "25000.00", counterpartyCountry: "IR" as unknown as null }),
      customer({ pepStatus: true })
    );

    expect(triggered.length).toBeGreaterThan(1);

    // Le score enregistré en DB doit être ≤ 100
    const updateCall = vi.mocked(repo.updateTransaction).mock.calls[0]?.[1];
    expect(updateCall?.riskScore).toBeDefined();
    expect(Number(updateCall?.riskScore)).toBeLessThanOrEqual(100);
    expect(Number(updateCall?.riskScore)).toBeGreaterThan(0);
  });
});
