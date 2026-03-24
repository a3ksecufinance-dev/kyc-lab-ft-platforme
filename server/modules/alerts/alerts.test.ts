import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../drizzle/schema", () => ({ alerts: {} }));
vi.mock("../../_core/db", () => ({ db: {} }));
vi.mock("./alerts.repository", () => ({
  findManyAlerts: vi.fn(),
  findAlertById: vi.fn(),
  updateAlert: vi.fn(),
  getAlertStats: vi.fn(),
}));

import * as repo from "./alerts.repository";
import { listAlerts, getAlertOrThrow, assignAlert, resolveAlert } from "./alerts.service";

const mockAlert = {
  id: 1, alertId: "ALT-ABC12345", customerId: 1, transactionId: 1,
  scenario: "THRESHOLD_EXCEEDED", alertType: "THRESHOLD" as const,
  priority: "HIGH" as const, status: "OPEN" as const, riskScore: 60,
  reason: "Montant > 10 000€", enrichmentData: null,
  assignedTo: null, resolvedBy: null, resolvedAt: null, resolution: null,
  createdAt: new Date("2024-01-15"), updatedAt: new Date("2024-01-15"),
};

describe("alerts.service — list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne les alertes paginées", async () => {
    vi.mocked(repo.findManyAlerts).mockResolvedValue({ data: [mockAlert], total: 1, page: 1, limit: 20, totalPages: 1 });
    const result = await listAlerts({ page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("filtre par status", async () => {
    vi.mocked(repo.findManyAlerts).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    await listAlerts({ page: 1, limit: 20, status: "OPEN" });
    expect(repo.findManyAlerts).toHaveBeenCalledWith(expect.objectContaining({ status: "OPEN" }));
  });
});

describe("alerts.service — getAlertOrThrow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne l'alerte si trouvée", async () => {
    vi.mocked(repo.findAlertById).mockResolvedValue(mockAlert);
    const result = await getAlertOrThrow(1);
    expect(result.alertId).toBe("ALT-ABC12345");
  });

  it("lève NOT_FOUND si absente", async () => {
    vi.mocked(repo.findAlertById).mockResolvedValue(null);
    await expect(getAlertOrThrow(999)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("alerts.service — assignAlert", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assigne l'alerte à un analyste et passe en IN_REVIEW", async () => {
    vi.mocked(repo.findAlertById).mockResolvedValue(mockAlert);
    vi.mocked(repo.updateAlert).mockResolvedValue({ ...mockAlert, status: "IN_REVIEW", assignedTo: 5 });

    const result = await assignAlert(1, 5);

    expect(repo.updateAlert).toHaveBeenCalledWith(1, { assignedTo: 5, status: "IN_REVIEW" });
    expect(result.status).toBe("IN_REVIEW");
    expect(result.assignedTo).toBe(5);
  });
});

describe("alerts.service — resolveAlert", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ferme une alerte OPEN avec résolution CLOSED", async () => {
    vi.mocked(repo.findAlertById).mockResolvedValue(mockAlert);
    vi.mocked(repo.updateAlert).mockResolvedValue({ ...mockAlert, status: "CLOSED", resolution: "Vérifié légitime" });

    const result = await resolveAlert(1, "CLOSED", 2, "Vérifié légitime");

    expect(repo.updateAlert).toHaveBeenCalledWith(1, expect.objectContaining({
      status: "CLOSED", resolvedBy: 2, resolution: "Vérifié légitime",
    }));
    expect(result.status).toBe("CLOSED");
  });

  it("refuse de clore une alerte déjà CLOSED", async () => {
    vi.mocked(repo.findAlertById).mockResolvedValue({ ...mockAlert, status: "CLOSED" });
    await expect(resolveAlert(1, "CLOSED", 2, "Re-fermer")).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("ferme comme FALSE_POSITIVE", async () => {
    vi.mocked(repo.findAlertById).mockResolvedValue(mockAlert);
    vi.mocked(repo.updateAlert).mockResolvedValue({ ...mockAlert, status: "FALSE_POSITIVE" });
    const result = await resolveAlert(1, "FALSE_POSITIVE", 2, "Faux positif confirmé");
    expect(result.status).toBe("FALSE_POSITIVE");
  });
});
