import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (must come before imports that use them) ───────────────────────────

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../../drizzle/schema", () => ({ cases: {}, caseTimeline: {} }));
vi.mock("../../_core/db",          () => ({ db: mockDb }));
vi.mock("../../_core/logger",      () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("./kyc-tier.service", () => ({
  updateWalletTier: vi.fn().mockResolvedValue(undefined),
  getWalletTier:    vi.fn().mockResolvedValue("ALLEGED"),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import * as kycTier from "./kyc-tier.service";
import {
  initEdd,
  getOpenEddCase,
  getEddCaseOrThrow,
  updateEddChecklistItem,
  recordEddInterview,
  completeEdd,
  rejectEdd,
  listEddCases,
  INITIAL_EDD_CHECKLIST,
} from "./enhanced-onboarding.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a thenable chain for select queries.
 * Awaiting the chain (or any chained call) resolves to `result`.
 * Supports both terminal patterns: await select().from().where() AND
 * await select().from().where().limit(n).
 */
function makeSelectChain(result: unknown[]) {
  const base = Promise.resolve(result);
  const chain = Object.assign(base, {
    from:  () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result.slice(0, 1)),
  });
  return chain;
}

function makeInsertChain(result: unknown[]) {
  return {
    values: () => ({
      returning: () => Promise.resolve(result),
    }),
  };
}

function makeUpdateChain(result: unknown[]) {
  const chain = {
    set:   () => chain,
    where: () => ({
      returning: () => Promise.resolve(result),
    }),
  };
  return chain;
}

type CaseStatus   = "OPEN" | "UNDER_INVESTIGATION" | "CLOSED" | "SAR_SUBMITTED";
type CaseDecision = "PENDING" | "CLOSED_NO_ACTION" | "SAR_FILED" | "ESCALATED";
type CaseSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface CaseOverrides {
  id?:            number;
  caseId?:        string;
  customerId?:    number;
  title?:         string;
  description?:   string | null;
  status?:        CaseStatus;
  severity?:      CaseSeverity;
  assignedTo?:    number | null;
  supervisorId?:  number | null;
  linkedAlerts?:  unknown | null;
  findings?:      string | null;
  decision?:      CaseDecision;
  decisionNotes?: string | null;
  decisionBy?:    number | null;
  decisionAt?:    Date | null;
  dueDate?:       Date | null;
  createdAt?:     Date;
  updatedAt?:     Date;
}

/** Minimal valid Case fixture. */
function makeCase(overrides: CaseOverrides = {}) {
  return { ...baseCase(), ...overrides };
}

function baseCase() {
  return {
    id:            1,
    caseId:        "EDD-ABCD1234",
    customerId:    10,
    title:         "EDD: Diligence Renforcée — Wallet #5",
    description:   "Dossier EDD requis",
    status:        "OPEN" as const,
    severity:      "HIGH" as const,
    assignedTo:    2,
    supervisorId:  null,
    linkedAlerts:  null,
    findings:      JSON.stringify(INITIAL_EDD_CHECKLIST),
    decision:      "PENDING" as const,
    decisionNotes: null,
    decisionBy:    null,
    decisionAt:    null,
    dueDate:       null,
    createdAt:     new Date("2026-01-01"),
    updatedAt:     new Date("2026-01-01"),
  };
}

/** All checklist items marked done + interview recorded. */
function makeCompletedChecklist() {
  const cl = JSON.parse(JSON.stringify(INITIAL_EDD_CHECKLIST)) as typeof INITIAL_EDD_CHECKLIST;
  cl.interview = true;
  cl.interviewDate = "2026-03-01";
  cl.items = cl.items.map((i) => ({ ...i, done: true, doneAt: "2026-03-01T10:00:00.000Z" }));
  return cl;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("enhanced-onboarding.service — initEdd", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crée un dossier EDD avec préfixe EDD:", async () => {
    // First select (check existing) returns empty — no conflict.
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    // First insert (cases) returns the new EDD case.
    const newCase = makeCase();
    mockDb.insert
      .mockReturnValueOnce(makeInsertChain([newCase]))
      // Second insert (caseTimeline) — returning not chained here but values is.
      .mockReturnValueOnce({ values: () => Promise.resolve([]) });

    const result = await initEdd({ customerId: 10, walletId: 5, analystId: 2 });

    expect(result.caseId).toBe("EDD-ABCD1234");
    expect(result.title).toMatch(/^EDD:/);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it("le caseId généré a le format EDD-XXXXXXXX (8 chars majuscules)", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    // Capture the values passed to insert so we can inspect the caseId.
    let capturedValues: Record<string, unknown> | null = null;
    mockDb.insert.mockReturnValueOnce({
      values: (v: Record<string, unknown>) => {
        capturedValues = v;
        const createdCase = makeCase({ caseId: v["caseId"] as string });
        return { returning: () => Promise.resolve([createdCase]) };
      },
    });
    mockDb.insert.mockReturnValueOnce({ values: () => Promise.resolve([]) });

    await initEdd({ customerId: 10, walletId: 5, analystId: 2 });

    expect(capturedValues).not.toBeNull();
    expect((capturedValues! as Record<string, unknown>)["caseId"]).toMatch(/^EDD-[A-Z0-9_-]{8}$/);
  });

  it("lève CONFLICT si un dossier EDD ouvert existe déjà", async () => {
    const openEdd = makeCase(); // title starts with "EDD:", status "OPEN"
    mockDb.select.mockReturnValueOnce(makeSelectChain([openEdd]));

    await expect(initEdd({ customerId: 10, walletId: 5, analystId: 2 }))
      .rejects.toMatchObject({ code: "CONFLICT" });

    // No insert should have been called.
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("lève INTERNAL_SERVER_ERROR si l'insert ne retourne rien", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValueOnce(makeInsertChain([])); // empty result

    await expect(initEdd({ customerId: 10, walletId: 5, analystId: 2 }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("enhanced-onboarding.service — getEddCaseOrThrow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne le dossier s'il existe et est un EDD", async () => {
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));

    const result = await getEddCaseOrThrow(1);
    expect(result.id).toBe(1);
  });

  it("lève NOT_FOUND si le dossier est absent", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    await expect(getEddCaseOrThrow(999)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lève BAD_REQUEST si le dossier n'a pas le préfixe EDD:", async () => {
    const regularCase = makeCase({ title: "Suspicion de blanchiment" });
    mockDb.select.mockReturnValueOnce(makeSelectChain([regularCase]));

    await expect(getEddCaseOrThrow(1)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("enhanced-onboarding.service — updateEddChecklistItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("met à jour un item existant (done=true)", async () => {
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));

    const updatedFindings = JSON.parse(JSON.stringify(INITIAL_EDD_CHECKLIST)) as typeof INITIAL_EDD_CHECKLIST;
    const item = updatedFindings.items.find((i) => i.id === "ID_VERIFIED")!;
    item.done = true;
    item.doneAt = new Date().toISOString();

    const updatedCase = makeCase({ findings: JSON.stringify(updatedFindings) });
    mockDb.update.mockReturnValueOnce(makeUpdateChain([updatedCase]));
    mockDb.insert.mockReturnValueOnce({ values: () => Promise.resolve([]) });

    const result = await updateEddChecklistItem({
      caseId: 1,
      itemId: "ID_VERIFIED",
      done:   true,
      userId: 2,
    });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    const parsedFindings = JSON.parse(result.findings!) as typeof INITIAL_EDD_CHECKLIST;
    expect(parsedFindings.items.find((i) => i.id === "ID_VERIFIED")?.done).toBe(true);
  });

  it("met à jour un item avec notes", async () => {
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));

    const updatedCase = makeCase();
    mockDb.update.mockReturnValueOnce(makeUpdateChain([updatedCase]));
    mockDb.insert.mockReturnValueOnce({ values: () => Promise.resolve([]) });

    await updateEddChecklistItem({
      caseId: 1,
      itemId: "ADDRESS_PROOF",
      done:   true,
      notes:  "Facture EDF reçue",
      userId: 2,
    });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("lève BAD_REQUEST si itemId inconnu", async () => {
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));

    await expect(
      updateEddChecklistItem({ caseId: 1, itemId: "UNKNOWN_ITEM", done: true, userId: 2 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("lève INTERNAL_SERVER_ERROR si l'update ne retourne rien", async () => {
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));
    mockDb.update.mockReturnValueOnce(makeUpdateChain([]));

    await expect(
      updateEddChecklistItem({ caseId: 1, itemId: "ID_VERIFIED", done: true, userId: 2 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("enhanced-onboarding.service — recordEddInterview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enregistre l'entretien et marque INTERVIEW_REPORT comme done", async () => {
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));

    const updatedCase = makeCase();
    mockDb.update.mockReturnValueOnce(makeUpdateChain([updatedCase]));
    mockDb.insert.mockReturnValueOnce({ values: () => Promise.resolve([]) });

    await recordEddInterview({
      caseId:        1,
      interviewDate: "2026-03-15",
      notes:         "Entretien téléphonique — client coopératif",
      userId:        2,
    });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it("lève INTERNAL_SERVER_ERROR si l'update ne retourne rien", async () => {
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));
    mockDb.update.mockReturnValueOnce(makeUpdateChain([]));

    await expect(
      recordEddInterview({ caseId: 1, interviewDate: "2026-03-15", notes: "test", userId: 2 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("enhanced-onboarding.service — completeEdd", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lève BAD_REQUEST si des items ne sont pas validés", async () => {
    // findings with items NOT done (initial checklist)
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));

    await expect(
      completeEdd({ caseId: 1, walletId: 5, customerId: 10, decision: "Diligences complètes", userId: 2 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("lève BAD_REQUEST si l'entretien n'est pas enregistré", async () => {
    // All items done but interview=false
    const cl = makeCompletedChecklist();
    cl.interview = false;
    const eddCase = makeCase({ findings: JSON.stringify(cl) });
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));

    await expect(
      completeEdd({ caseId: 1, walletId: 5, customerId: 10, decision: "OK", userId: 2 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("valide l'EDD et promeut le wallet si tout est complet", async () => {
    const cl = makeCompletedChecklist();
    const eddCase = makeCase({ findings: JSON.stringify(cl) });
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));

    const closedCase = makeCase({ status: "CLOSED", decision: "CLOSED_NO_ACTION" });
    mockDb.update.mockReturnValueOnce(makeUpdateChain([closedCase]));
    mockDb.insert.mockReturnValueOnce({ values: () => Promise.resolve([]) });

    const result = await completeEdd({
      caseId:    1,
      walletId:  5,
      customerId: 10,
      decision:  "Diligences renforcées validées",
      userId:    2,
    });

    expect(result.promoted).toBe(true);
    expect(result.eddCase.status).toBe("CLOSED");
    expect(vi.mocked(kycTier.updateWalletTier)).toHaveBeenCalledWith(
      expect.objectContaining({ newTier: "RENFORCE", walletId: 5 })
    );
  });

  it("lève INTERNAL_SERVER_ERROR si la mise à jour ne retourne rien", async () => {
    const cl = makeCompletedChecklist();
    const eddCase = makeCase({ findings: JSON.stringify(cl) });
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));
    mockDb.update.mockReturnValueOnce(makeUpdateChain([]));

    await expect(
      completeEdd({ caseId: 1, walletId: 5, customerId: 10, decision: "OK", userId: 2 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("enhanced-onboarding.service — rejectEdd", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejette l'EDD et ferme le dossier avec décision ESCALATED", async () => {
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));

    const closedCase = makeCase({ status: "CLOSED", decision: "ESCALATED" });
    mockDb.update.mockReturnValueOnce(makeUpdateChain([closedCase]));
    mockDb.insert.mockReturnValueOnce({ values: () => Promise.resolve([]) });

    const result = await rejectEdd({ caseId: 1, reason: "Documents insuffisants", userId: 2 });

    expect(result.status).toBe("CLOSED");
    expect(result.decision).toBe("ESCALATED");
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("lève BAD_REQUEST si le dossier n'est plus OPEN", async () => {
    const closedEdd = makeCase({ status: "CLOSED" });
    mockDb.select.mockReturnValueOnce(makeSelectChain([closedEdd]));

    await expect(rejectEdd({ caseId: 1, reason: "Trop tard", userId: 2 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("lève INTERNAL_SERVER_ERROR si l'update ne retourne rien", async () => {
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce(makeSelectChain([eddCase]));
    mockDb.update.mockReturnValueOnce(makeUpdateChain([]));

    await expect(rejectEdd({ caseId: 1, reason: "Raison test", userId: 2 }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("enhanced-onboarding.service — getOpenEddCase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne le dossier EDD ouvert s'il existe", async () => {
    const eddCase = makeCase();
    mockDb.select.mockReturnValueOnce({
      from:  () => ({ where: () => Promise.resolve([eddCase]) }),
    });

    const result = await getOpenEddCase(10);
    expect(result).not.toBeNull();
    expect(result?.title).toMatch(/^EDD:/);
  });

  it("retourne null si aucun dossier EDD ouvert", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });

    const result = await getOpenEddCase(10);
    expect(result).toBeNull();
  });

  it("retourne null si seuls des dossiers non-EDD existent", async () => {
    const regularCase = makeCase({ title: "Alerte blanchiment standard", status: "OPEN" });
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([regularCase]) }),
    });

    const result = await getOpenEddCase(10);
    expect(result).toBeNull();
  });
});

describe("enhanced-onboarding.service — listEddCases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne uniquement les dossiers EDD d'un client", async () => {
    const eddCase1   = makeCase({ id: 1 });
    const eddCase2   = makeCase({ id: 2, status: "CLOSED" });
    const regularCase = makeCase({ id: 3, title: "Alerte simple", caseId: "CASE-00000001" });

    mockDb.select.mockReturnValueOnce({
      from:  () => ({ where: () => Promise.resolve([eddCase1, eddCase2, regularCase]) }),
    });

    const result = await listEddCases(10);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.title.startsWith("EDD:"))).toBe(true);
  });

  it("retourne un tableau vide si aucun dossier EDD", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });

    const result = await listEddCases(10);
    expect(result).toHaveLength(0);
  });
});
