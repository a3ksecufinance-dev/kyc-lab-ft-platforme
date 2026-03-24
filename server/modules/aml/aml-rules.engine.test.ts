import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../drizzle/schema", () => ({ transactions: {}, alerts: {}, amlRules: {}, amlRuleExecutions: {} }));
vi.mock("../../_core/db",         () => ({ db: {} }));
vi.mock("../../_core/logger",     () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("../transactions/transactions.repository", () => ({
  findRecentByCustomer: vi.fn(),
  getVolumeStats:       vi.fn(),
  updateTransaction:    vi.fn(),
  insertAlert:          vi.fn(),
}));

vi.mock("./aml-rules.repository", () => ({
  getAllExecutableRules: vi.fn(),
  insertExecution:      vi.fn(),
}));

import * as repo     from "../transactions/transactions.repository";
import * as rulesRepo from "./aml-rules.repository";
import { runDynamicAmlRules } from "./aml-rules.engine";
import type { AmlRule } from "../../../drizzle/schema";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseTx = {
  id: 1, transactionId: "TXN-DYN000001", customerId: 1,
  amount: "500.00", currency: "EUR",
  transactionType: "TRANSFER" as const,
  channel: "ONLINE" as const,
  counterparty: null, counterpartyCountry: null, counterpartyBank: null,
  purpose: null, riskScore: 0, riskRules: null, status: "PENDING" as const,
  isSuspicious: false, flagReason: null,
  transactionDate: new Date("2024-06-01T10:00:00Z"),
  createdAt: new Date("2024-06-01T10:00:00Z"),
};

const baseCustomer = {
  id: 1, customerId: "KYC-DYN0001",
  firstName: "Test", lastName: "Utilisateur",
  email: null, phone: null, dateOfBirth: null,
  nationality: "FR", residenceCountry: "FR",
  address: null, city: null, profession: null, employer: null,
  sourceOfFunds: "Salaire", monthlyIncome: "5000.00",
  customerType: "INDIVIDUAL" as const,
  kycStatus: "APPROVED" as const,
  riskLevel: "LOW" as const,
  riskScore: 10, pepStatus: false,
  sanctionStatus: "CLEAR" as const,
  lastReviewDate: null, nextReviewDate: null,
  assignedAnalyst: null, notes: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const baseAlertReturn = {
  id: 1, alertId: "ALT-DYN1234", customerId: 1, transactionId: 1,
  scenario: "TEST", alertType: "THRESHOLD" as const, priority: "HIGH" as const,
  status: "OPEN" as const, riskScore: 60, reason: "test",
  enrichmentData: null, assignedTo: null, resolvedBy: null,
  resolvedAt: null, resolution: null,
  createdAt: new Date(), updatedAt: new Date(),
};

// Helper pour créer une règle AML de test
function makeRule(overrides: Partial<AmlRule> = {}): AmlRule {
  return {
    id: 1, ruleId: "AML-TEST001",
    name: "Règle test",
    description: "Règle de test",
    category: "THRESHOLD",
    status: "ACTIVE",
    conditions: { field: "amount", op: ">=", value: 10000 },
    baseScore: 70,
    priority: "HIGH",
    alertType: "THRESHOLD",
    thresholdValue: "10000",
    windowMinutes: null,
    countThreshold: null,
    version: 1,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AmlRule;
}

const tx       = (o: Partial<typeof baseTx> = {})       => ({ ...baseTx, ...o });
const customer = (o: Partial<typeof baseCustomer> = {}) => ({ ...baseCustomer, ...o });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findRecentByCustomer).mockResolvedValue([]);
  vi.mocked(repo.getVolumeStats).mockResolvedValue({ totalAmount: 0, count: 0 });
  vi.mocked(repo.updateTransaction).mockResolvedValue(baseTx);
  vi.mocked(repo.insertAlert).mockResolvedValue(baseAlertReturn);
  vi.mocked(rulesRepo.insertExecution).mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("aml-rules.engine — runDynamicAmlRules", () => {

  it("aucune règle active → COMPLETED, pas d'alerte", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([]);

    const results = await runDynamicAmlRules(tx(), customer());

    expect(results).toHaveLength(0);
    expect(repo.insertAlert).not.toHaveBeenCalled();
  });

  it("règle THRESHOLD amount >= 10000 — tx 500€ → non déclenchée", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({ conditions: { field: "amount", op: ">=", value: 10000 } as never }),
    ]);

    const results = await runDynamicAmlRules(tx({ amount: "500.00" }), customer());

    expect(results.every((r) => !r.triggered)).toBe(true);
    expect(repo.insertAlert).not.toHaveBeenCalled();
    expect(repo.updateTransaction).toHaveBeenCalledWith(1,
      expect.objectContaining({ status: "COMPLETED", riskScore: 0 })
    );
  });

  it("règle THRESHOLD amount >= 10000 — tx 15000€ → déclenchée + alerte", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({ conditions: { field: "amount", op: ">=", value: 10000 } as never }),
    ]);

    const results = await runDynamicAmlRules(tx({ amount: "15000.00" }), customer());

    expect(results.some((r) => r.triggered)).toBe(true);
    expect(repo.insertAlert).toHaveBeenCalledOnce();
    expect(repo.updateTransaction).toHaveBeenCalledWith(1,
      expect.objectContaining({ status: "FLAGGED", isSuspicious: true })
    );
  });

  it("règle pepStatus == true — client non-PEP → non déclenchée", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({
        conditions: { field: "pepStatus", op: "==", value: true } as never,
        baseScore: 55, priority: "HIGH", alertType: "PEP",
      }),
    ]);

    const results = await runDynamicAmlRules(tx(), customer({ pepStatus: false }));
    expect(results.every((r) => !r.triggered)).toBe(true);
  });

  it("règle pepStatus == true — client PEP → déclenchée", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({
        conditions: { field: "pepStatus", op: "==", value: true } as never,
        baseScore: 55, alertType: "PEP",
      }),
    ]);

    const results = await runDynamicAmlRules(tx({ amount: "100.00" }), customer({ pepStatus: true }));
    expect(results.some((r) => r.triggered)).toBe(true);
    expect(repo.insertAlert).toHaveBeenCalledOnce();
  });

  it("règle GEOGRAPHY counterpartyCountry in [KP,IR] — pays à risque → déclenchée", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({
        conditions: { field: "counterpartyCountry", op: "in", value: ["KP", "IR", "RU"] } as never,
        baseScore: 75, alertType: "SANCTIONS",
      }),
    ]);

    const results = await runDynamicAmlRules(
      tx({ counterpartyCountry: "KP" as unknown as null }),
      customer()
    );
    expect(results.some((r) => r.triggered)).toBe(true);
  });

  it("règle AND composée : channel in [ATM,API] ET amount >= 5000", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({
        conditions: {
          logic: "AND",
          rules: [
            { field: "channel", op: "in",  value: ["ATM", "API"] },
            { field: "amount",  op: ">=",  value: 5000 },
          ],
        } as never,
        baseScore: 35,
      }),
    ]);

    // canal ONLINE + montant élevé → non déclenchée
    const r1 = await runDynamicAmlRules(tx({ amount: "8000.00", channel: "ONLINE" }), customer());
    expect(r1.every((r) => !r.triggered)).toBe(true);

    vi.clearAllMocks();
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue([]);
    vi.mocked(repo.getVolumeStats).mockResolvedValue({ totalAmount: 0, count: 0 });
    vi.mocked(repo.updateTransaction).mockResolvedValue(baseTx);
    vi.mocked(repo.insertAlert).mockResolvedValue(baseAlertReturn);
    vi.mocked(rulesRepo.insertExecution).mockResolvedValue(undefined);
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({
        conditions: {
          logic: "AND",
          rules: [
            { field: "channel", op: "in",  value: ["ATM", "API"] },
            { field: "amount",  op: ">=",  value: 5000 },
          ],
        } as never,
        baseScore: 35,
      }),
    ]);

    // canal ATM + montant élevé → déclenchée
    const r2 = await runDynamicAmlRules(tx({ amount: "8000.00", channel: "ATM" as "ONLINE" }), customer());
    expect(r2.some((r) => r.triggered)).toBe(true);
  });

  it("règle OR composée : amount >= 10000 OU pepStatus == true", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({
        conditions: {
          logic: "OR",
          rules: [
            { field: "amount",    op: ">=", value: 10000 },
            { field: "pepStatus", op: "==", value: true },
          ],
        } as never,
        baseScore: 65,
      }),
    ]);

    // Client PEP avec petit montant → déclenchée (via OR)
    const results = await runDynamicAmlRules(
      tx({ amount: "200.00" }),
      customer({ pepStatus: true })
    );
    expect(results.some((r) => r.triggered)).toBe(true);
  });

  it("règle TESTING → exécutée mais n'alerte pas", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({
        status: "TESTING",
        conditions: { field: "amount", op: ">=", value: 500 } as never,
        baseScore: 60,
      }),
    ]);

    const results = await runDynamicAmlRules(tx({ amount: "1000.00" }), customer());

    // La règle est bien évaluée
    expect(results.some((r) => r.triggered)).toBe(true);
    // Mais aucune alerte créée (TESTING)
    expect(repo.insertAlert).not.toHaveBeenCalled();
    // Transaction marquée COMPLETED (pas d'alerte réelle)
    expect(repo.updateTransaction).toHaveBeenCalledWith(1,
      expect.objectContaining({ status: "COMPLETED" })
    );
    // Exécution persistée pour le monitoring
    expect(rulesRepo.insertExecution).toHaveBeenCalled();
  });

  it("plusieurs règles — score plafonné à 100", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({ id: 1, ruleId: "AML-A", baseScore: 70,
        conditions: { field: "amount", op: ">=", value: 10000 } as never }),
      makeRule({ id: 2, ruleId: "AML-B", baseScore: 75,
        conditions: { field: "counterpartyCountry", op: "in", value: ["KP"] } as never }),
      makeRule({ id: 3, ruleId: "AML-C", baseScore: 55,
        conditions: { field: "pepStatus", op: "==", value: true } as never }),
    ]);

    const results = await runDynamicAmlRules(
      tx({ amount: "15000.00", counterpartyCountry: "KP" as unknown as null }),
      customer({ pepStatus: true })
    );

    expect(results.filter((r) => r.triggered).length).toBe(3);
    const updateCall = vi.mocked(repo.updateTransaction).mock.calls[0]?.[1];
    expect(Number(updateCall?.riskScore)).toBeLessThanOrEqual(100);
    expect(Number(updateCall?.riskScore)).toBeGreaterThan(0);
  });

  it("règle recentTxCount >= 10 — fréquence élevée détectée", async () => {
    // Simuler 10 transactions récentes
    const recentTxs = Array.from({ length: 9 }, (_, i) => ({
      ...baseTx, id: i + 2, transactionId: `TXN-RECENT${i}`,
    }));
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue(recentTxs);
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({
        conditions: { field: "recentTxCount", op: ">=", value: 10 } as never,
        baseScore: 50, alertType: "VELOCITY",
      }),
    ]);

    const results = await runDynamicAmlRules(tx(), customer());
    // 9 récentes + 1 en cours = 10 → déclenchée
    expect(results.some((r) => r.triggered)).toBe(true);
  });

  it("règle amountIsRound — montant 10000€ → déclenchée", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockResolvedValue([
      makeRule({
        conditions: { field: "amountIsRound", op: "==", value: true } as never,
        baseScore: 20, priority: "LOW",
      }),
    ]);

    const r1 = await runDynamicAmlRules(tx({ amount: "10000.00" }), customer());
    expect(r1.some((r) => r.triggered)).toBe(true);
  });

  it("erreur dans getAllExecutableRules → retourne [] sans planter", async () => {
    vi.mocked(rulesRepo.getAllExecutableRules).mockRejectedValue(new Error("DB down"));

    const results = await runDynamicAmlRules(tx(), customer());
    expect(results).toHaveLength(0);
    expect(repo.insertAlert).not.toHaveBeenCalled();
  });
});
