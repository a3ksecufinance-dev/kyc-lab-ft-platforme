import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../drizzle/schema", () => ({ cases: {}, caseTimeline: {} }));
vi.mock("../../_core/db", () => ({ db: {} }));
vi.mock("../../_core/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("./cases.repository", () => ({
  insertCase: vi.fn(),
  insertTimelineEntry: vi.fn(),
  findCaseById: vi.fn(),
  updateCase: vi.fn(),
  findManyCases: vi.fn(),
  getCaseStats: vi.fn(),
  findTimelineByCase: vi.fn(),
}));

import * as repo from "./cases.repository";
import {
  createCase, getCaseOrThrow, updateCaseStatus, assignCase, makeDecision,
} from "./cases.service";

const mockCase = {
  id: 1, caseId: "CASE-ABC12345", customerId: 1,
  title: "Suspicion de blanchiment", description: "Transactions structurées",
  status: "OPEN" as const, severity: "HIGH" as const,
  assignedTo: null, supervisorId: null,
  linkedAlerts: null, findings: null,
  decision: "PENDING" as const, decisionNotes: null, decisionBy: null, decisionAt: null,
  dueDate: null, createdAt: new Date("2024-01-15"), updatedAt: new Date("2024-01-15"),
};

describe("cases.service — createCase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crée un dossier avec caseId et entrée timeline", async () => {
    vi.mocked(repo.insertCase).mockResolvedValue(mockCase);
    vi.mocked(repo.insertTimelineEntry).mockResolvedValue({
      id: 1, caseId: 1, action: "CASE_OPENED", description: "Dossier créé",
      performedBy: 2, metadata: null, createdAt: new Date(),
    });

    const result = await createCase({ customerId: 1, title: "Suspicion blanchiment", severity: "HIGH" }, 2);

    expect(repo.insertCase).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 1, title: "Suspicion blanchiment" })
    );
    expect(repo.insertTimelineEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CASE_OPENED" })
    );
    expect(result.caseId).toBe("CASE-ABC12345");
  });

  it("le caseId a le format CASE-XXXXXXXX", async () => {
    vi.mocked(repo.insertCase).mockResolvedValue(mockCase);
    vi.mocked(repo.insertTimelineEntry).mockResolvedValue({
      id: 1, caseId: 1, action: "CASE_OPENED", description: null,
      performedBy: null, metadata: null, createdAt: new Date(),
    });

    await createCase({ customerId: 1, title: "Test" }, 1);

    const call = vi.mocked(repo.insertCase).mock.calls[0]?.[0];
    expect(call?.caseId).toMatch(/^CASE-[A-Za-z0-9_-]{8}$/);
  });
});

describe("cases.service — getCaseOrThrow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne le dossier si trouvé", async () => {
    vi.mocked(repo.findCaseById).mockResolvedValue(mockCase);
    const result = await getCaseOrThrow(1);
    expect(result.caseId).toBe("CASE-ABC12345");
  });

  it("lève NOT_FOUND si absent", async () => {
    vi.mocked(repo.findCaseById).mockResolvedValue(null);
    await expect(getCaseOrThrow(999)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cases.service — updateCaseStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("met à jour le statut et ajoute une entrée timeline", async () => {
    vi.mocked(repo.findCaseById).mockResolvedValue(mockCase);
    vi.mocked(repo.updateCase).mockResolvedValue({ ...mockCase, status: "UNDER_INVESTIGATION" });
    vi.mocked(repo.insertTimelineEntry).mockResolvedValue({
      id: 2, caseId: 1, action: "STATUS_CHANGED", description: null,
      performedBy: null, metadata: null, createdAt: new Date(),
    });

    const result = await updateCaseStatus(1, "UNDER_INVESTIGATION", 2);

    expect(repo.updateCase).toHaveBeenCalledWith(1, expect.objectContaining({ status: "UNDER_INVESTIGATION" }));
    expect(repo.insertTimelineEntry).toHaveBeenCalled();
    expect(result.status).toBe("UNDER_INVESTIGATION");
  });
});

describe("cases.service — assignCase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assigne le dossier à un analyste", async () => {
    vi.mocked(repo.findCaseById).mockResolvedValue(mockCase);
    vi.mocked(repo.updateCase).mockResolvedValue({ ...mockCase, assignedTo: 3 });
    vi.mocked(repo.insertTimelineEntry).mockResolvedValue({
      id: 3, caseId: 1, action: "CASE_ASSIGNED", description: null,
      performedBy: null, metadata: null, createdAt: new Date(),
    });

    const result = await assignCase(1, 3, undefined, 2);
    expect(result.assignedTo).toBe(3);
  });
});

describe("cases.service — makeDecision", () => {
  beforeEach(() => vi.clearAllMocks());

  it("décision SAR_FILED passe le statut en SAR_SUBMITTED", async () => {
    vi.mocked(repo.findCaseById).mockResolvedValue(mockCase);
    vi.mocked(repo.updateCase).mockResolvedValue({ ...mockCase, decision: "SAR_FILED", status: "SAR_SUBMITTED" });
    vi.mocked(repo.insertTimelineEntry).mockResolvedValue({
      id: 4, caseId: 1, action: "DECISION_MADE", description: null,
      performedBy: null, metadata: null, createdAt: new Date(),
    });

    await makeDecision(1, "SAR_FILED", "Signalement TRACFIN requis", 2);

    expect(repo.updateCase).toHaveBeenCalledWith(1, expect.objectContaining({
      decision: "SAR_FILED",
      status: "SAR_SUBMITTED",
    }));
  });

  it("décision CLOSED_NO_ACTION ferme le dossier", async () => {
    vi.mocked(repo.findCaseById).mockResolvedValue(mockCase);
    vi.mocked(repo.updateCase).mockResolvedValue({ ...mockCase, decision: "CLOSED_NO_ACTION", status: "CLOSED" });
    vi.mocked(repo.insertTimelineEntry).mockResolvedValue({
      id: 5, caseId: 1, action: "DECISION_MADE", description: null,
      performedBy: null, metadata: null, createdAt: new Date(),
    });

    await makeDecision(1, "CLOSED_NO_ACTION", "Aucune infraction détectée", 2);

    expect(repo.updateCase).toHaveBeenCalledWith(1, expect.objectContaining({
      decision: "CLOSED_NO_ACTION",
      status: "CLOSED",
    }));
  });
});
