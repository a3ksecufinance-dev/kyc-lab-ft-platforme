/**
 * Tests unitaires du CBS SDK — KycCbsClientMock
 *
 * Couvre :
 *   - CRUD clients (getCustomer, findCustomer)
 *   - Synchronisation KYC (pushKycUpdate)
 *   - Blocage/déblocage comptes (blockCustomerAccounts, unblockCustomerAccounts)
 *   - Transactions (getTransactions, getTransaction)
 *   - Alertes AML (pushAlert)
 *   - Connectivité (ping)
 *   - Singleton getCbsClient() (mock vs absent)
 *   - Erreurs : CbsApiError, CbsTimeoutError
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KycCbsClientMock } from "./mock";
import { CbsApiError, CbsTimeoutError } from "./types";
import type { CbsCustomer, CbsTransaction } from "./types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CUSTOMER: CbsCustomer = {
  id:         "C-001",
  externalRef: "EXT-001",
  firstName:  "Youssef",
  lastName:   "Benali",
  dateOfBirth: "1985-04-12",
  nationality: "MA",
  phone:      "+212661234567",
  email:      "youssef@example.ma",
  kycStatus:  "APPROVED",
  riskLevel:  "LOW",
  accounts: [
    {
      id:          "ACC-001",
      iban:        "MA64011519000001205000534921",
      currency:    "MAD",
      balance:     15000,
      isActive:    true,
      accountType: "CURRENT",
      openedAt:    "2023-01-15T00:00:00Z",
    },
  ],
  createdAt:  "2023-01-15T00:00:00Z",
  updatedAt:  "2024-06-01T00:00:00Z",
};

const TX: CbsTransaction = {
  id:          "TX-001",
  accountId:   "ACC-001",
  amount:      5000,
  currency:    "MAD",
  direction:   "DEBIT",
  type:        "WIRE",
  channel:     "ONLINE",
  status:      "COMPLETED",
  valueDate:   "2024-06-01",
  bookingDate: "2024-06-01",
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("KycCbsClientMock", () => {
  let cbs: KycCbsClientMock;

  beforeEach(() => {
    cbs = new KycCbsClientMock();
    cbs._customers.push({ ...CUSTOMER, accounts: [{ ...CUSTOMER.accounts[0]! }] });
    cbs._transactions.push({ ...TX });
  });

  // ─── Customers ─────────────────────────────────────────────────────────────

  describe("getCustomer", () => {
    it("retourne le client existant", async () => {
      const c = await cbs.getCustomer("C-001");
      expect(c.firstName).toBe("Youssef");
      expect(c.kycStatus).toBe("APPROVED");
    });

    it("lève une erreur si le client est inconnu", async () => {
      await expect(cbs.getCustomer("UNKNOWN")).rejects.toThrow("Customer UNKNOWN not found");
    });
  });

  describe("findCustomer", () => {
    it("trouve par email", async () => {
      const c = await cbs.findCustomer({ email: "youssef@example.ma" });
      expect(c?.id).toBe("C-001");
    });

    it("trouve par téléphone", async () => {
      const c = await cbs.findCustomer({ phone: "+212661234567" });
      expect(c?.id).toBe("C-001");
    });

    it("retourne null si aucun résultat", async () => {
      const c = await cbs.findCustomer({ email: "inconnu@test.ma" });
      expect(c).toBeNull();
    });
  });

  // ─── KYC Sync ──────────────────────────────────────────────────────────────

  describe("pushKycUpdate", () => {
    it("met à jour le statut KYC du client", async () => {
      const result = await cbs.pushKycUpdate({
        customerId: "C-001",
        kycStatus:  "REJECTED",
        riskLevel:  "HIGH",
        source:     "KYC_PLATFORM_V2",
        updatedAt:  new Date().toISOString(),
      });

      expect(result.acknowledged).toBe(true);

      const c = await cbs.getCustomer("C-001");
      expect(c.kycStatus).toBe("REJECTED");
      expect(c.riskLevel).toBe("HIGH");
    });

    it("acknowledged même si client inconnu (pas de plantage)", async () => {
      const result = await cbs.pushKycUpdate({
        customerId: "C-INEXISTANT",
        kycStatus:  "EXPIRED",
        riskLevel:  "MEDIUM",
        source:     "KYC_PLATFORM_V2",
        updatedAt:  new Date().toISOString(),
      });
      expect(result.acknowledged).toBe(true);
    });
  });

  // ─── Block / Unblock ───────────────────────────────────────────────────────

  describe("blockCustomerAccounts", () => {
    it("bloque tous les comptes du client", async () => {
      const result = await cbs.blockCustomerAccounts({
        customerId: "C-001",
        reason:     "SAR validé — FATF R.20",
        blockedBy:  "compliance@kyc.ma",
        reference:  "CASE-2024-001",
      });

      expect(result.success).toBe(true);
      expect(result.reference).toMatch(/^BLK-/);
      expect(result.frozenAt).toBeTruthy();

      const c = await cbs.getCustomer("C-001");
      expect(c.accounts.every(a => !a.isActive)).toBe(true);
    });

    it("enregistre le payload dans _blocks", async () => {
      await cbs.blockCustomerAccounts({
        customerId: "C-001",
        reason:     "Test blocage",
        blockedBy:  "admin@kyc.ma",
      });
      expect(cbs._blocks).toHaveLength(1);
      expect(cbs._blocks[0]?.customerId).toBe("C-001");
    });
  });

  describe("unblockCustomerAccounts", () => {
    it("réactive les comptes après blocage", async () => {
      await cbs.blockCustomerAccounts({ customerId: "C-001", reason: "test", blockedBy: "admin" });
      await cbs.unblockCustomerAccounts("C-001", "Levée de mesure conservatoire");

      const c = await cbs.getCustomer("C-001");
      expect(c.accounts.every(a => a.isActive)).toBe(true);
    });
  });

  // ─── Transactions ──────────────────────────────────────────────────────────

  describe("getTransactions", () => {
    it("retourne la liste paginée", async () => {
      const list = await cbs.getTransactions("ACC-001");
      expect(list.items).toHaveLength(1);
      expect(list.total).toBe(1);
      expect(list.hasMore).toBe(false);
    });

    it("filtre par accountId", async () => {
      const list = await cbs.getTransactions("ACC-999");
      expect(list.items).toHaveLength(0);
      expect(list.total).toBe(0);
    });

    it("applique la pagination (page 2 vide)", async () => {
      const list = await cbs.getTransactions("ACC-001", { page: 2, limit: 50 });
      expect(list.items).toHaveLength(0);
      expect(list.hasMore).toBe(false);
    });
  });

  describe("getTransaction", () => {
    it("retourne la transaction par ID", async () => {
      const tx = await cbs.getTransaction("TX-001");
      expect(tx.amount).toBe(5000);
      expect(tx.direction).toBe("DEBIT");
    });

    it("lève une erreur si la transaction est inconnue", async () => {
      await expect(cbs.getTransaction("TX-XXXX")).rejects.toThrow("Transaction TX-XXXX not found");
    });
  });

  // ─── Alertes ───────────────────────────────────────────────────────────────

  describe("pushAlert", () => {
    it("enregistre l'alerte AML et retourne un alertId", async () => {
      const result = await cbs.pushAlert({
        customerId:  "C-001",
        alertType:   "STRUCTURING",
        severity:    "HIGH",
        description: "Séquence de transactions inférieures au seuil sur 48h",
        reportedAt:  new Date().toISOString(),
      });

      expect(result.received).toBe(true);
      expect(result.alertId).toMatch(/^ALT-/);
      expect(cbs._alerts).toHaveLength(1);
    });

    it("accumule plusieurs alertes", async () => {
      await cbs.pushAlert({ customerId: "C-001", alertType: "P2P_VELOCITY", severity: "MEDIUM", description: "test", reportedAt: new Date().toISOString() });
      await cbs.pushAlert({ customerId: "C-001", alertType: "DORMANT",      severity: "LOW",    description: "test", reportedAt: new Date().toISOString() });
      expect(cbs._alerts).toHaveLength(2);
    });
  });

  // ─── Ping ──────────────────────────────────────────────────────────────────

  describe("ping", () => {
    it("retourne status ok et latency 0 en mock", async () => {
      const result = await cbs.ping();
      expect(result.status).toBe("ok");
      expect(result.latencyMs).toBe(0);
    });
  });
});

// ─── Classes d'erreur ─────────────────────────────────────────────────────────

describe("CbsApiError", () => {
  it("conserve statusCode, code et rawResponse", () => {
    const err = new CbsApiError("Not found", 404, "CUSTOMER_NOT_FOUND", { detail: "x" });
    expect(err.name).toBe("CbsApiError");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("CUSTOMER_NOT_FOUND");
    expect(err.rawResponse).toEqual({ detail: "x" });
    expect(err instanceof Error).toBe(true);
  });
});

describe("CbsTimeoutError", () => {
  it("conserve timeoutMs et message lisible", () => {
    const err = new CbsTimeoutError(5000);
    expect(err.name).toBe("CbsTimeoutError");
    expect(err.timeoutMs).toBe(5000);
    expect(err.message).toContain("5000ms");
    expect(err instanceof Error).toBe(true);
  });
});

// ─── Singleton getCbsClient ────────────────────────────────────────────────────

describe("getCbsClient singleton", () => {
  const ORIGINAL_MODE = process.env["CBS_MODE"];

  afterEach(async () => {
    // Réinitialiser l'état du singleton après chaque test
    process.env["CBS_MODE"] = ORIGINAL_MODE;
    const mod = await import("../../server/_core/cbs");
    mod._resetCbsClient();
  });

  it("CBS_MODE=mock → retourne KycCbsClientMock", async () => {
    process.env["CBS_MODE"] = "mock";
    const mod = await import("../../server/_core/cbs");
    mod._resetCbsClient();
    const client = mod.getCbsClient();
    expect(client).toBeInstanceOf(KycCbsClientMock);
  });

  it("CBS_MODE=absent → retourne null", async () => {
    process.env["CBS_MODE"] = "absent";
    const mod = await import("../../server/_core/cbs");
    mod._resetCbsClient();
    const client = mod.getCbsClient();
    expect(client).toBeNull();
  });

  it("CBS_MODE non défini → retourne null", async () => {
    delete process.env["CBS_MODE"];
    const mod = await import("../../server/_core/cbs");
    mod._resetCbsClient();
    const client = mod.getCbsClient();
    expect(client).toBeNull();
  });

  it("CBS_MODE=live sans CBS_BASE_URL → retourne null", async () => {
    process.env["CBS_MODE"]     = "live";
    process.env["CBS_BASE_URL"] = "";
    process.env["CBS_API_KEY"]  = "";
    const mod = await import("../../server/_core/cbs");
    mod._resetCbsClient();
    const client = mod.getCbsClient();
    expect(client).toBeNull();
  });
});
