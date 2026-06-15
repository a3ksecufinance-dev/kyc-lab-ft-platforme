import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import type { Request, Response } from "express";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../_core/institution", () => ({
  getInstitutionFlags: vi.fn(),
}));
vi.mock("../../_core/env", () => ({
  ENV: { WEBHOOK_SECRET: "test_secret" },
}));
vi.mock("../../_core/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../../_core/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
  },
}));
vi.mock("../transactions/transactions.service", () => ({
  createTransaction: vi.fn(),
}));

import { getInstitutionFlags } from "../../_core/institution";
import type { InstitutionFeatureFlags } from "../../../shared/institution.types";
import { redis }               from "../../_core/redis";

const flags = (f: Partial<InstitutionFeatureFlags>) => f as unknown as InstitutionFeatureFlags;
import { createTransaction }   from "../transactions/transactions.service";
import { handleOrangeMoney, handleWave, handleCihMobile } from "./mobile-connectors.webhook";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signBuffer(buf: Buffer): string {
  return "sha256=" + createHmac("sha256", "test_secret").update(buf).digest("hex");
}

function mockReq(body: unknown, headers: Record<string, string> = {}): Request {
  const buf = Buffer.from(JSON.stringify(body));
  return {
    body: buf,
    headers: { "content-type": "application/json", "x-webhook-signature": signBuffer(buf), ...headers },
    ip: "127.0.0.1",
    rawBody: buf,
  } as unknown as Request;
}

function mockReqRaw(raw: string, headers: Record<string, string> = {}): Request {
  const buf = Buffer.from(raw, "utf8");
  return {
    body: buf,
    headers: { "content-type": "application/json", "x-webhook-signature": signBuffer(buf), ...headers },
    ip: "127.0.0.1",
    rawBody: buf,
  } as unknown as Request;
}

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    statusCode: 200,
  };
  return res as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

// ─── describe handleOrangeMoney ───────────────────────────────────────────────

describe("handleOrangeMoney", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInstitutionFlags).mockReturnValue(flags({ mobileConnectors: true }));
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.setex).mockResolvedValue("OK");
    vi.mocked(createTransaction).mockResolvedValue({
      transactionId: "TX-TEST-001",
      riskScore: 5,
      isSuspicious: false,
    } as never);
  });

  it("retourne 403 si mobileConnectors flag est false", async () => {
    vi.mocked(getInstitutionFlags).mockReturnValue(flags({ mobileConnectors: false }));
    const req = mockReq({ transactionRef: "REF-001", clientId: 1, amount: "100.00", operationType: "CASH_IN" });
    const res = mockRes();

    await handleOrangeMoney(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("non activés") }),
    );
  });

  it("retourne 400 si JSON invalide", async () => {
    const req = mockReqRaw("not-json{{");
    const res = mockRes();

    await handleOrangeMoney(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "JSON invalide" }));
  });

  it("retourne 200 et crée une transaction pour un payload valide", async () => {
    const payload = {
      transactionRef: "REF-ORANGE-001",
      clientId: 42,
      amount: "500.00",
      currency: "MAD",
      operationType: "TRANSFER" as const,
      counterparty: "0612345678",
      timestamp: Date.now(),
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleOrangeMoney(req, res);

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 42,
        amount: "500.00",
        currency: "MAD",
        channel: "MOBILE",
      }),
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, transactionId: "TX-TEST-001", riskScore: 5 }),
    );
  });

  it("retourne 200 avec duplicate:true si déjà traité (Redis)", async () => {
    vi.mocked(redis.get).mockResolvedValue("1");
    const payload = {
      transactionRef: "REF-DUP-001",
      clientId: 7,
      amount: "200.00",
      operationType: "PAYMENT" as const,
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleOrangeMoney(req, res);

    expect(createTransaction).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, duplicate: true });
  });

  it("mappe CASH_IN → AGENT_CASH_IN correctement", async () => {
    const payload = {
      transactionRef: "REF-CASHIN-001",
      clientId: 10,
      amount: "300.00",
      operationType: "CASH_IN" as const,
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleOrangeMoney(req, res);

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionType: "AGENT_CASH_IN" }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── describe handleWave ──────────────────────────────────────────────────────

describe("handleWave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInstitutionFlags).mockReturnValue(flags({ mobileConnectors: true }));
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.setex).mockResolvedValue("OK");
    vi.mocked(createTransaction).mockResolvedValue({
      transactionId: "TX-TEST-001",
      riskScore: 5,
      isSuspicious: false,
    } as never);
  });

  it("retourne 200 et crée une transaction pour un payload valide", async () => {
    // ts is Unix seconds — keep within ±5 min of now
    const payload = {
      id: "WAVE-001",
      customer_id: 55,
      amount: "1500.00",
      currency: "XOF",
      type: "receive" as const,
      recipient: "user@wave.com",
      ts: Math.floor(Date.now() / 1000),
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleWave(req, res);

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 55,
        amount: "1500.00",
        currency: "XOF",
        channel: "MOBILE",
        transactionType: "MOBILE_MONEY_IN",
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, transactionId: "TX-TEST-001" }),
    );
  });

  it("mappe type 'send' → MOBILE_MONEY_OUT", async () => {
    const payload = {
      id: "WAVE-SEND-001",
      customer_id: 20,
      amount: "800.00",
      type: "send" as const,
      ts: Math.floor(Date.now() / 1000),
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleWave(req, res);

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionType: "MOBILE_MONEY_OUT" }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("retourne 400 si champs obligatoires manquants", async () => {
    // Missing customer_id and amount — no timestamp field included
    const payload = {
      id: "WAVE-MISSING-001",
      type: "payment" as const,
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleWave(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Champs obligatoires manquants" }),
    );
    expect(createTransaction).not.toHaveBeenCalled();
  });
});

// ─── describe handleCihMobile ─────────────────────────────────────────────────

describe("handleCihMobile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInstitutionFlags).mockReturnValue(flags({ mobileConnectors: true }));
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.setex).mockResolvedValue("OK");
    vi.mocked(createTransaction).mockResolvedValue({
      transactionId: "TX-TEST-001",
      riskScore: 5,
      isSuspicious: false,
    } as never);
  });

  it("retourne 200 et crée une transaction pour un payload valide", async () => {
    const payload = {
      refOperacion: "CIH-OP-001",
      idCliente: 88,
      montant: "2500.00",
      devise: "MAD",
      typeOperation: "PAIEMENT" as const,
      beneficiaire: "MAROC_TELECOM",
      timestamp: Date.now(),
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleCihMobile(req, res);

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 88,
        amount: "2500.00",
        currency: "MAD",
        channel: "MOBILE",
        transactionType: "BILL_PAYMENT",
        counterparty: "MAROC_TELECOM",
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, transactionId: "TX-TEST-001" }),
    );
  });

  it("mappe VIREMENT → P2P_TRANSFER", async () => {
    // No timestamp field — handler must still succeed
    const payload = {
      refOperacion: "CIH-VIR-001",
      idCliente: 33,
      montant: "700.00",
      typeOperation: "VIREMENT" as const,
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleCihMobile(req, res);

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionType: "P2P_TRANSFER" }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("retourne 400 si champs obligatoires manquants", async () => {
    // Only typeOperation provided — no timestamp field included
    const payload = {
      typeOperation: "RETRAIT" as const,
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleCihMobile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Champs obligatoires manquants" }),
    );
    expect(createTransaction).not.toHaveBeenCalled();
  });
});
