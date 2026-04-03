import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../drizzle/schema", () => ({ transactions: {}, alerts: {} }));
vi.mock("../../_core/db", () => ({ db: {} }));
vi.mock("../../_core/env", () => ({
  ENV: {
    AML_THRESHOLD_SINGLE_TX:        10000,
    AML_THRESHOLD_STRUCTURING:      3000,
    AML_STRUCTURING_WINDOW_HOURS:   24,
    AML_FREQUENCY_THRESHOLD:        10,
    AML_VOLUME_VARIATION_THRESHOLD: 300,
    APP_URL: "http://localhost:5173",
  },
}));
vi.mock("../../_core/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("../../_core/mailer", () => ({ notifyCriticalAlert: vi.fn() }));
vi.mock("../transactions/transactions.repository", () => ({
  findRecentByCustomer: vi.fn(),
  getVolumeStats:       vi.fn(),
  updateTransaction:    vi.fn(),
  insertAlert:          vi.fn(),
}));

import * as repo from "../transactions/transactions.repository";
import { runAmlRules } from "./aml.engine";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<typeof baseTx> = {}) {
  return { ...baseTx, ...overrides };
}

function makeCustomer(overrides: Partial<typeof baseCustomer> = {}) {
  return { ...baseCustomer, ...overrides };
}

const baseTx = {
  id: 1,
  transactionId: "TXN-TEST000001",
  customerId: 1,
  amount: "500.00",
  currency: "EUR",
  transactionType: "TRANSFER" as "TRANSFER" | "DEPOSIT" | "WITHDRAWAL" | "PAYMENT" | "EXCHANGE",
  channel: "ONLINE" as "ONLINE" | "MOBILE" | "BRANCH" | "ATM" | "API",
  counterparty: null as string | null,
  counterpartyCountry: null as string | null,
  counterpartyBank: null as string | null,
  purpose: null as string | null,
  riskScore: 0,
  riskRules: null,
  status: "PENDING" as const,
  isSuspicious: false,
  flagReason: null as string | null,
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

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findRecentByCustomer).mockResolvedValue([]);
  // getVolumeStats returns { totalAmount, count } — avgDaily = totalAmount / 30
  // 30000 / 30 = 1000 avg daily — so 2000 is 200%, below 300% threshold
  vi.mocked(repo.getVolumeStats).mockResolvedValue({ totalAmount: 30000, count: 10 });
  vi.mocked(repo.updateTransaction).mockResolvedValue(baseTx as any);
  vi.mocked(repo.insertAlert).mockResolvedValue({ id: 1 } as any);
});

// ─── Règle 1 : THRESHOLD_EXCEEDED ────────────────────────────────────────────

describe("Règle 1 — THRESHOLD_EXCEEDED", () => {
  it("transaction normale (500€) → pas déclenchée", async () => {
    const results = await runAmlRules(makeTx({ amount: "500.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "THRESHOLD_EXCEEDED");
    expect(rule?.triggered).toBe(false);
  });

  it("exactement au seuil (10000€) → déclenchée", async () => {
    const results = await runAmlRules(makeTx({ amount: "10000.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "THRESHOLD_EXCEEDED");
    expect(rule?.triggered).toBe(true);
    expect(rule?.priority).toBe("HIGH");
  });

  it("au-dessus du seuil (25000€) → déclenchée avec score élevé", async () => {
    const results = await runAmlRules(makeTx({ amount: "25000.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "THRESHOLD_EXCEEDED");
    expect(rule?.triggered).toBe(true);
    expect(rule?.score).toBeGreaterThanOrEqual(70);
  });

  it("légèrement sous le seuil (9999.99€) → pas déclenchée", async () => {
    const results = await runAmlRules(makeTx({ amount: "9999.99" }), makeCustomer());
    const rule = results.find(r => r.rule === "THRESHOLD_EXCEEDED");
    expect(rule?.triggered).toBe(false);
  });
});

// ─── Règle 2 : STRUCTURING ────────────────────────────────────────────────────

describe("Règle 2 — STRUCTURING", () => {
  it("pas de transactions récentes → pas déclenchée", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue([]);
    const results = await runAmlRules(makeTx({ amount: "2900.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "STRUCTURING");
    expect(rule?.triggered).toBe(false);
  });

  it("2 tx récentes + nouvelle tx = total > 10k → déclenchée", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue([
      makeTx({ id: 2, amount: "4000.00" }),
      makeTx({ id: 3, amount: "4500.00" }),
    ] as any);
    const results = await runAmlRules(makeTx({ amount: "2500.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "STRUCTURING");
    expect(rule?.triggered).toBe(true);
    expect(rule?.priority).toBe("HIGH");
  });

  it("transactions récentes mais total < seuil → pas déclenchée", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue([
      makeTx({ id: 2, amount: "1000.00" }),
    ] as any);
    const results = await runAmlRules(makeTx({ amount: "2000.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "STRUCTURING");
    expect(rule?.triggered).toBe(false);
  });
});

// ─── Règle 3 : HIGH_FREQUENCY ─────────────────────────────────────────────────

describe("Règle 3 — HIGH_FREQUENCY", () => {
  it("9 transactions récentes → pas déclenchée (seuil = 10)", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue(
      Array(9).fill(null).map((_, i) => makeTx({ id: i + 2, amount: "100.00" })) as any
    );
    const results = await runAmlRules(makeTx(), makeCustomer());
    const rule = results.find(r => r.rule === "HIGH_FREQUENCY");
    expect(rule?.triggered).toBe(false);
  });

  it("10 transactions récentes → déclenchée (seuil atteint)", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue(
      Array(10).fill(null).map((_, i) => makeTx({ id: i + 2, amount: "100.00" })) as any
    );
    const results = await runAmlRules(makeTx(), makeCustomer());
    const rule = results.find(r => r.rule === "HIGH_FREQUENCY");
    expect(rule?.triggered).toBe(true);
  });

  it("15 transactions récentes → déclenchée avec score élevé", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue(
      Array(15).fill(null).map((_, i) => makeTx({ id: i + 2, amount: "100.00" })) as any
    );
    const results = await runAmlRules(makeTx(), makeCustomer());
    const rule = results.find(r => r.rule === "HIGH_FREQUENCY");
    expect(rule?.triggered).toBe(true);
    expect(rule?.score).toBeGreaterThan(50);
  });
});

// ─── Règle 4 : VOLUME_SPIKE ───────────────────────────────────────────────────

describe("Règle 4 — VOLUME_SPIKE", () => {
  it("volume normal → pas déclenchée", async () => {
    // totalAmount=30000, count=10 → avgDaily=1000 → 2000/1000 = 200% < 300% threshold
    vi.mocked(repo.getVolumeStats).mockResolvedValue({ totalAmount: 30000, count: 10 });
    const results = await runAmlRules(makeTx({ amount: "2000.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "VOLUME_SPIKE");
    expect(rule?.triggered).toBe(false);
  });

  it("volume 400% de la moyenne → déclenchée", async () => {
    // totalAmount=30000, count=10 → avgDaily=1000 → 5000/1000 = 500% > 300% threshold
    vi.mocked(repo.getVolumeStats).mockResolvedValue({ totalAmount: 30000, count: 10 });
    const results = await runAmlRules(makeTx({ amount: "5000.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "VOLUME_SPIKE");
    expect(rule?.triggered).toBe(true);
  });

  it("volume moyen nul → pas déclenchée (division par zéro)", async () => {
    vi.mocked(repo.getVolumeStats).mockResolvedValue({ totalAmount: 0, count: 0 });
    const results = await runAmlRules(makeTx({ amount: "50000.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "VOLUME_SPIKE");
    expect(rule?.triggered).toBe(false);
  });
});

// ─── Règle 5 : HIGH_RISK_COUNTRY ─────────────────────────────────────────────

describe("Règle 5 — HIGH_RISK_COUNTRY", () => {
  it("contrepartie en France (FR) → pas déclenchée", async () => {
    const results = await runAmlRules(
      makeTx({ counterpartyCountry: "FR" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "HIGH_RISK_COUNTRY");
    expect(rule?.triggered).toBe(false);
  });

  it("contrepartie en Iran (IR) → déclenchée CRITICAL", async () => {
    const results = await runAmlRules(
      makeTx({ counterpartyCountry: "IR" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "HIGH_RISK_COUNTRY");
    expect(rule?.triggered).toBe(true);
    expect(rule?.priority).toBe("CRITICAL");
  });

  it("contrepartie en Russie (RU) → déclenchée", async () => {
    const results = await runAmlRules(
      makeTx({ counterpartyCountry: "RU" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "HIGH_RISK_COUNTRY");
    expect(rule?.triggered).toBe(true);
  });

  it("contrepartie en Corée du Nord (KP) → déclenchée CRITICAL", async () => {
    const results = await runAmlRules(
      makeTx({ counterpartyCountry: "KP" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "HIGH_RISK_COUNTRY");
    expect(rule?.triggered).toBe(true);
    expect(rule?.priority).toBe("CRITICAL");
  });

  it("pas de pays contrepartie → pas déclenchée", async () => {
    const results = await runAmlRules(makeTx({ counterpartyCountry: null }), makeCustomer());
    const rule = results.find(r => r.rule === "HIGH_RISK_COUNTRY");
    expect(rule?.triggered).toBe(false);
  });
});

// ─── Règle 6 : PEP_TRANSACTION ───────────────────────────────────────────────

describe("Règle 6 — PEP_TRANSACTION", () => {
  it("client non PEP → pas déclenchée", async () => {
    const results = await runAmlRules(makeTx(), makeCustomer({ pepStatus: false }));
    const rule = results.find(r => r.rule === "PEP_TRANSACTION");
    expect(rule?.triggered).toBe(false);
  });

  it("client PEP transaction normale → déclenchée", async () => {
    const results = await runAmlRules(makeTx({ amount: "1000.00" }), makeCustomer({ pepStatus: true }));
    const rule = results.find(r => r.rule === "PEP_TRANSACTION");
    expect(rule?.triggered).toBe(true);
    expect(rule?.priority).toBe("HIGH");
  });

  it("client PEP + montant > 10k → score très élevé", async () => {
    const results = await runAmlRules(
      makeTx({ amount: "50000.00" }),
      makeCustomer({ pepStatus: true })
    );
    const rule = results.find(r => r.rule === "PEP_TRANSACTION");
    expect(rule?.triggered).toBe(true);
    expect(rule?.score).toBeGreaterThanOrEqual(70);
  });
});

// ─── Règle 7 : ROUND_AMOUNT ───────────────────────────────────────────────────

describe("Règle 7 — ROUND_AMOUNT", () => {
  it("montant précis (1234.56€) → pas déclenchée", async () => {
    const results = await runAmlRules(makeTx({ amount: "1234.56" }), makeCustomer());
    const rule = results.find(r => r.rule === "ROUND_AMOUNT");
    expect(rule?.triggered).toBe(false);
  });

  it("montant rond ≥ 5000€ (10000€) → déclenchée", async () => {
    const results = await runAmlRules(makeTx({ amount: "10000.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "ROUND_AMOUNT");
    expect(rule?.triggered).toBe(true);
  });

  it("montant rond mais < 5000€ (1000€) → pas déclenchée", async () => {
    const results = await runAmlRules(makeTx({ amount: "1000.00" }), makeCustomer());
    const rule = results.find(r => r.rule === "ROUND_AMOUNT");
    expect(rule?.triggered).toBe(false);
  });
});

// ─── Règle 8 : UNUSUAL_CHANNEL ───────────────────────────────────────────────

describe("Règle 8 — UNUSUAL_CHANNEL", () => {
  it("canal ONLINE montant normal → pas déclenchée", async () => {
    const results = await runAmlRules(
      makeTx({ channel: "ONLINE", amount: "1000.00" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "UNUSUAL_CHANNEL");
    expect(rule?.triggered).toBe(false);
  });

  it("canal ATM + montant ≥ 5000€ → déclenchée", async () => {
    const results = await runAmlRules(
      makeTx({ channel: "ATM", amount: "5000.00" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "UNUSUAL_CHANNEL");
    expect(rule?.triggered).toBe(true);
  });

  it("canal API + montant ≥ 5000€ → déclenchée", async () => {
    const results = await runAmlRules(
      makeTx({ channel: "API", amount: "7500.00" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "UNUSUAL_CHANNEL");
    expect(rule?.triggered).toBe(true);
  });
});

// ─── Règle 9 : HAWALA_PATTERN (Sprint 6 MENA) ────────────────────────────────

describe("Règle 9 — HAWALA_PATTERN (MENA)", () => {
  it("virement ONLINE vers pays non-MENA → pas déclenchée", async () => {
    const results = await runAmlRules(
      makeTx({ channel: "ONLINE", counterpartyCountry: "DE", amount: "1000.00" }),
      makeCustomer({ residenceCountry: "FR" })
    );
    const rule = results.find(r => r.rule === "HAWALA_PATTERN");
    expect(rule?.triggered).toBe(false);
  });

  it("cash BRANCH + pays MENA (MA) + fréquence élevée → déclenchée", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue(
      Array(6).fill(null).map((_, i) => ({
        ...makeTx({ id: i + 2, channel: "BRANCH", amount: "500.00", counterpartyCountry: "MA" }),
      })) as any
    );
    const results = await runAmlRules(
      makeTx({ channel: "BRANCH", counterpartyCountry: "MA", amount: "800.00" }),
      makeCustomer({ residenceCountry: "FR" })
    );
    const rule = results.find(r => r.rule === "HAWALA_PATTERN");
    expect(rule?.triggered).toBe(true);
    expect(rule?.priority).toBe("HIGH");
  });

  it("client résident Maroc → pas déclenchée (non hawala local)", async () => {
    const results = await runAmlRules(
      makeTx({ channel: "BRANCH", counterpartyCountry: "MA", amount: "800.00" }),
      makeCustomer({ residenceCountry: "MA" })
    );
    const rule = results.find(r => r.rule === "HAWALA_PATTERN");
    expect(rule?.triggered).toBe(false);
  });
});

// ─── Règle 10 : MENA_STRUCTURING ─────────────────────────────────────────────

describe("Règle 10 — MENA_STRUCTURING", () => {
  it("transaction vers pays non-MENA → pas déclenchée", async () => {
    const results = await runAmlRules(
      makeTx({ amount: "9200.00", counterpartyCountry: "DE" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "MENA_STRUCTURING");
    expect(rule?.triggered).toBe(false);
  });

  it("montant 95% du seuil vers MENA → déclenchée", async () => {
    const results = await runAmlRules(
      makeTx({ amount: "9500.00", counterpartyCountry: "AE" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "MENA_STRUCTURING");
    expect(rule?.triggered).toBe(true);
    expect(rule?.priority).toBe("HIGH");
  });

  it("montant exactement au seuil → pas MENA_STRUCTURING (c'est THRESHOLD)", async () => {
    const results = await runAmlRules(
      makeTx({ amount: "10000.00", counterpartyCountry: "SA" }),
      makeCustomer()
    );
    const mena = results.find(r => r.rule === "MENA_STRUCTURING");
    expect(mena?.triggered).toBe(false);
  });
});

// ─── Règle 11 : CASH_INTENSIVE ────────────────────────────────────────────────

describe("Règle 11 — CASH_INTENSIVE", () => {
  it("transactions ONLINE uniquement → pas déclenchée", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue(
      Array(12).fill(null).map((_, i) => ({
        ...makeTx({ id: i + 2, channel: "ONLINE", transactionType: "DEPOSIT" }),
      })) as any
    );
    const results = await runAmlRules(
      makeTx({ channel: "ONLINE", transactionType: "DEPOSIT" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "CASH_INTENSIVE");
    expect(rule?.triggered).toBe(false);
  });

  it("≥ 10 dépôts/retraits cash → déclenchée", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue(
      Array(11).fill(null).map((_, i) => ({
        ...makeTx({ id: i + 2, channel: "BRANCH", transactionType: "DEPOSIT" }),
      })) as any
    );
    const results = await runAmlRules(
      makeTx({ channel: "BRANCH", transactionType: "DEPOSIT", amount: "500.00" }),
      makeCustomer()
    );
    const rule = results.find(r => r.rule === "CASH_INTENSIVE");
    expect(rule?.triggered).toBe(true);
  });
});

// ─── Scénarios multi-règles ───────────────────────────────────────────────────

describe("Scénarios combinés multi-règles", () => {
  it("PEP + montant élevé → plusieurs règles déclenchées", async () => {
    const results = await runAmlRules(
      makeTx({ amount: "15000.00" }),
      makeCustomer({ pepStatus: true })
    );
    const triggered = results.filter(r => r.triggered).map(r => r.rule);
    expect(triggered).toContain("THRESHOLD_EXCEEDED");
    expect(triggered).toContain("PEP_TRANSACTION");
    expect(triggered).toContain("ROUND_AMOUNT");
  });

  it("score total cappé à 100", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue(
      Array(12).fill(null).map((_, i) => makeTx({ id: i + 2, amount: "500.00" })) as any
    );
    const results = await runAmlRules(
      makeTx({ amount: "50000.00", counterpartyCountry: "KP" }),
      makeCustomer({ pepStatus: true })
    );
    const triggered = results.filter(r => r.triggered);
    expect(triggered.length).toBeGreaterThan(2);
    // Chaque score individuel doit être dans 0-100
    triggered.forEach(r => {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    });
  });

  it("transaction normale → aucune règle déclenchée", async () => {
    vi.mocked(repo.findRecentByCustomer).mockResolvedValue([]);
    vi.mocked(repo.getVolumeStats).mockResolvedValue({ totalAmount: 30000, count: 10 });
    const results = await runAmlRules(makeTx({ amount: "200.00" }), makeCustomer());
    const triggered = results.filter(r => r.triggered);
    expect(triggered).toHaveLength(0);
  });
});

// ─── Gestion des erreurs ──────────────────────────────────────────────────────

describe("Robustesse — gestion d'erreurs", () => {
  it("erreur repo → moteur continue sans crash", async () => {
    vi.mocked(repo.findRecentByCustomer).mockRejectedValue(new Error("DB down"));
    await expect(
      runAmlRules(makeTx({ amount: "15000.00" }), makeCustomer())
    ).resolves.toBeDefined();
  });

  it("montant invalide → pas de crash", async () => {
    await expect(
      runAmlRules(makeTx({ amount: "NaN" }), makeCustomer())
    ).resolves.toBeDefined();
  });
});
