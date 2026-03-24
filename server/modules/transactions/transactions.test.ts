import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../drizzle/schema", () => ({ transactions: {}, alerts: {}, customers: {} }));
vi.mock("../../_core/db", () => ({ db: {} }));
vi.mock("../../_core/env", () => ({
  ENV: {
    AML_THRESHOLD_SINGLE_TX: 10000, AML_THRESHOLD_STRUCTURING: 3000,
    AML_STRUCTURING_WINDOW_HOURS: 24, AML_FREQUENCY_THRESHOLD: 10,
    AML_VOLUME_VARIATION_THRESHOLD: 300,
    ML_SERVICE_URL: "http://localhost:8000",
    ML_INTERNAL_API_KEY: "test_key",
  },
}));
vi.mock("../../_core/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("./transactions.repository", () => ({
  findManyTransactions: vi.fn(), findTransactionById: vi.fn(),
  insertTransaction: vi.fn(), updateTransaction: vi.fn(),
  findRecentByCustomer: vi.fn(), getVolumeStats: vi.fn(),
  insertAlert: vi.fn(), findAlertsByCustomer: vi.fn(),
  getTransactionStats: vi.fn(), getAlertStats: vi.fn(),
}));
vi.mock("../customers/customers.repository", () => ({ findCustomerById: vi.fn() }));
// Moteur AML statique (fallback)
vi.mock("../aml/aml.engine", () => ({ runAmlRules: vi.fn().mockResolvedValue([]) }));
// Moteur AML dynamique (prioritaire)
vi.mock("../aml/aml-rules.engine", () => ({ runDynamicAmlRules: vi.fn().mockResolvedValue([]) }));
// ML scoring (fire-and-forget)
vi.mock("../aml/ml-scoring.client", () => ({ callMlScoring: vi.fn().mockResolvedValue(null) }));

import * as repo from "./transactions.repository";
import * as customerRepo from "../customers/customers.repository";
import * as amlEngine from "../aml/aml.engine";
import * as amlRulesEngine from "../aml/aml-rules.engine";
import * as mlScoring from "../aml/ml-scoring.client";
import { listTransactions, getTransactionOrThrow, createTransaction, blockTransaction } from "./transactions.service";

const mockCustomer = {
  id: 1, customerId: "KYC-ABC12345", firstName: "Jean", lastName: "Dupont",
  email: null, phone: null, dateOfBirth: null, nationality: "FR", residenceCountry: "FR",
  address: null, city: null, profession: "Ingénieur", employer: null,
  sourceOfFunds: "Salaire", monthlyIncome: "5000.00",
  customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
  riskLevel: "LOW" as const, riskScore: 10, pepStatus: false,
  sanctionStatus: "CLEAR" as const, lastReviewDate: null, nextReviewDate: null,
  assignedAnalyst: null, notes: null,
  createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01"),
};

const mockTransaction = {
  id: 1, transactionId: "TXN-ABC1234567", customerId: 1,
  amount: "5000.00", currency: "EUR",
  transactionType: "TRANSFER" as const, channel: "ONLINE" as const,
  counterparty: null, counterpartyCountry: null, counterpartyBank: null,
  purpose: null, riskScore: 0, riskRules: null,
  status: "PENDING" as const, isSuspicious: false, flagReason: null,
  transactionDate: new Date("2024-01-15"), createdAt: new Date("2024-01-15"),
};

describe("transactions.service — list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne les transactions paginées", async () => {
    vi.mocked(repo.findManyTransactions).mockResolvedValue({ data: [mockTransaction], total: 1, page: 1, limit: 20, totalPages: 1 });
    const result = await listTransactions({ page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("filtre par customerId", async () => {
    vi.mocked(repo.findManyTransactions).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    await listTransactions({ page: 1, limit: 20, customerId: 42 });
    expect(repo.findManyTransactions).toHaveBeenCalledWith(expect.objectContaining({ customerId: 42 }));
  });
});

describe("transactions.service — getTransactionOrThrow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne la transaction si trouvée", async () => {
    vi.mocked(repo.findTransactionById).mockResolvedValue(mockTransaction);
    const result = await getTransactionOrThrow(1);
    expect(result.transactionId).toBe("TXN-ABC1234567");
  });

  it("lève NOT_FOUND si absente", async () => {
    vi.mocked(repo.findTransactionById).mockResolvedValue(null);
    await expect(getTransactionOrThrow(999)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("transactions.service — createTransaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crée une transaction et déclenche le moteur AML dynamique", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(repo.insertTransaction).mockResolvedValue(mockTransaction);

    await createTransaction({ customerId: 1, amount: "5000.00", transactionType: "TRANSFER" });

    expect(repo.insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING", isSuspicious: false })
    );
    // Le moteur dynamique est appelé en priorité
    expect(amlRulesEngine.runDynamicAmlRules).toHaveBeenCalledWith(mockTransaction, mockCustomer);
    // Le ML scoring est appelé en parallèle
    expect(mlScoring.callMlScoring).toHaveBeenCalledWith(mockTransaction, mockCustomer);
    // Le moteur statique ne doit PAS être appelé directement (seulement en fallback)
    expect(amlEngine.runAmlRules).not.toHaveBeenCalled();
  });

  it("refuse si client KYC rejeté", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue({ ...mockCustomer, kycStatus: "REJECTED" });
    await expect(createTransaction({ customerId: 1, amount: "100.00", transactionType: "TRANSFER" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.insertTransaction).not.toHaveBeenCalled();
  });

  it("refuse si client introuvable", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue(null);
    await expect(createTransaction({ customerId: 999, amount: "100.00", transactionType: "TRANSFER" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("le transactionId a le format TXN-XXXXXXXXXX", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(repo.insertTransaction).mockResolvedValue(mockTransaction);
    await createTransaction({ customerId: 1, amount: "100.00", transactionType: "DEPOSIT" });
    const call = vi.mocked(repo.insertTransaction).mock.calls[0]?.[0];
    expect(call?.transactionId).toMatch(/^TXN-[A-Za-z0-9_-]{10}$/);
  });
});

describe("transactions.service — blockTransaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloque une transaction PENDING", async () => {
    vi.mocked(repo.findTransactionById).mockResolvedValue(mockTransaction);
    vi.mocked(repo.updateTransaction).mockResolvedValue({ ...mockTransaction, status: "BLOCKED", isSuspicious: true });

    const result = await blockTransaction(1, "Suspicion de fraude documentée");

    expect(repo.updateTransaction).toHaveBeenCalledWith(1, {
      status: "BLOCKED", isSuspicious: true, flagReason: "Suspicion de fraude documentée",
    });
    expect(result.status).toBe("BLOCKED");
  });

  it("refuse de bloquer une transaction COMPLETED", async () => {
    vi.mocked(repo.findTransactionById).mockResolvedValue({ ...mockTransaction, status: "COMPLETED" });
    await expect(blockTransaction(1, "Trop tard")).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
