import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../drizzle/schema", () => ({ reports: {} }));
vi.mock("../../_core/db", () => ({ db: {} }));

vi.mock("./reports.repository", () => ({
  insertReport:    vi.fn(),
  findReportById:  vi.fn(),
  findManyReports: vi.fn(),
  updateReport:    vi.fn(),
  getReportStats:  vi.fn(),
}));

vi.mock("../customers/customers.repository", () => ({
  findCustomerById: vi.fn(),
}));

vi.mock("../cases/cases.repository", () => ({
  findCaseById: vi.fn(),
}));

import * as repo         from "./reports.repository";
import * as customerRepo from "../customers/customers.repository";
import * as casesRepo    from "../cases/cases.repository";
import {
  createSar, createStr,
  submitForReview,
  approveAndSubmit, rejectReport,
  updateReportContent,
} from "./reports.service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCustomer = {
  id: 1, customerId: "KYC-ABC12345", firstName: "Jean", lastName: "Dupont",
  email: null, phone: null, dateOfBirth: null, nationality: "FR", residenceCountry: "FR",
  address: null, city: null, profession: "Ingénieur", employer: null,
  sourceOfFunds: "Salaire", monthlyIncome: "5000.00",
  customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
  riskLevel: "HIGH" as const, riskScore: 75, pepStatus: false,
  sanctionStatus: "CLEAR" as const,
  frozenAt: null, frozenReason: null, frozenBy: null,
  erasureRequestedAt: null, erasureCompletedAt: null,
  erasureRequestedBy: null, erasureCompletedBy: null,
  lastReviewDate: null, nextReviewDate: null,
  assignedAnalyst: null, notes: null,
  createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01"),
};

const mockCase = {
  id: 1, caseId: "CASE-XYZ00001", customerId: 1, title: "Dossier AML",
  description: null, status: "UNDER_INVESTIGATION" as const, severity: "HIGH" as const,
  assignedTo: null, supervisorId: null, linkedAlerts: null, findings: null,
  decision: "PENDING" as const, decisionNotes: null, decisionBy: null, decisionAt: null,
  dueDate: null, createdAt: new Date(), updatedAt: new Date(),
};

const sarContent = {
  subjectDescription:   "Client effectuant des virements atypiques",
  suspiciousActivities: ["Structuring", "Transactions vers pays à risque"],
  evidenceSummary:      "3 transactions dépassant 10 000€ sur 7 jours",
  narrativeSummary:     "Le client présente un schéma de transactions incompatible avec son profil KYC déclaré, suggérant un possible blanchiment.",
};

const strContent = {
  transactionId:   "TXN-ABC1234567",
  transactionDate: "2024-06-15T10:00:00.000Z",
  transactionAmount: "15000.00",
  transactionType:   "TRANSFER",
  suspicionBasis:    "Montant dépassant le seuil TRACFIN",
  involvedParties:   ["Jean Dupont", "Société XYZ"],
  evidenceSummary:   "Transaction unique de 15 000€ vers un pays listé FATF",
  narrativeSummary:  "Transaction suspecte vers contrepartie dans pays à risque élevé, incompatible avec activité déclarée du client.",
};

const mockDraftSar = {
  id: 1, reportId: "SAR-ABC1234567890", reportType: "SAR" as const,
  customerId: 1, caseId: null, title: "SAR — Jean Dupont",
  status: "DRAFT" as const, suspicionType: "Structuring",
  amountInvolved: null, currency: "EUR",
  content: sarContent as unknown as null,
  submittedBy: 2, submittedAt: null, approvedBy: null, approvedAt: null,
  regulatoryRef: null, createdAt: new Date(), updatedAt: new Date(),
};

const mockDraftStr = {
  ...mockDraftSar,
  reportId: "STR-XYZ1234567890",
  reportType: "STR" as const,
  amountInvolved: "15000.00",
  content: strContent as unknown as null,
};

// ─── createSar ────────────────────────────────────────────────────────────────

describe("reports.service — createSar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crée un SAR en DRAFT avec reportId SAR-*", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(repo.insertReport).mockResolvedValue(mockDraftSar);

    const result = await createSar(
      { customerId: 1, title: "SAR — Jean Dupont", suspicionType: "Structuring", content: sarContent },
      2
    );

    expect(repo.insertReport).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: "SAR", status: "DRAFT", customerId: 1 })
    );
    const call = vi.mocked(repo.insertReport).mock.calls[0]?.[0];
    expect(call?.reportId).toMatch(/^SAR-[A-Za-z0-9_-]{10}$/);
    expect(result.status).toBe("DRAFT");
  });

  it("refuse si client introuvable", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue(null);
    await expect(
      createSar({ customerId: 999, title: "Test", suspicionType: "X", content: sarContent }, 1)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.insertReport).not.toHaveBeenCalled();
  });

  it("vérifie que le case existe si fourni", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(casesRepo.findCaseById).mockResolvedValue(null);
    await expect(
      createSar({ customerId: 1, caseId: 999, title: "Test", suspicionType: "X", content: sarContent }, 1)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lie correctement le dossier si caseId fourni", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(casesRepo.findCaseById).mockResolvedValue(mockCase);
    vi.mocked(repo.insertReport).mockResolvedValue({ ...mockDraftSar, caseId: 1 });

    await createSar(
      { customerId: 1, caseId: 1, title: "SAR avec dossier", suspicionType: "X", content: sarContent },
      2
    );

    const call = vi.mocked(repo.insertReport).mock.calls[0]?.[0];
    expect(call?.caseId).toBe(1);
  });
});

// ─── createStr ────────────────────────────────────────────────────────────────

describe("reports.service — createStr", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crée un STR en DRAFT avec reportId STR-*", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(repo.insertReport).mockResolvedValue(mockDraftStr);

    await createStr(
      { customerId: 1, title: "STR — TXN-ABC", suspicionType: "THRESHOLD", amountInvolved: "15000.00", content: strContent },
      2
    );

    const call = vi.mocked(repo.insertReport).mock.calls[0]?.[0];
    expect(call?.reportId).toMatch(/^STR-[A-Za-z0-9_-]{10}$/);
    expect(call?.reportType).toBe("STR");
    expect(call?.amountInvolved).toBe("15000.00");
  });
});

// ─── Workflow DRAFT → REVIEW → SUBMITTED ─────────────────────────────────────

describe("reports.service — workflow de validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submitForReview : DRAFT → REVIEW", async () => {
    vi.mocked(repo.findReportById).mockResolvedValue(mockDraftSar);
    vi.mocked(repo.updateReport).mockResolvedValue({ ...mockDraftSar, status: "REVIEW" });

    const result = await submitForReview(1);

    expect(repo.updateReport).toHaveBeenCalledWith(1, expect.objectContaining({ status: "REVIEW" }));
    expect(result.status).toBe("REVIEW");
  });

  it("submitForReview : refuse si déjà REVIEW", async () => {
    vi.mocked(repo.findReportById).mockResolvedValue({ ...mockDraftSar, status: "REVIEW" });
    await expect(submitForReview(1)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("approveAndSubmit : REVIEW → SUBMITTED avec référence réglementaire", async () => {
    vi.mocked(repo.findReportById).mockResolvedValue({ ...mockDraftSar, status: "REVIEW" });
    vi.mocked(repo.updateReport).mockResolvedValue({ ...mockDraftSar, status: "SUBMITTED", regulatoryRef: "TRACFIN-2024-001" });

    const result = await approveAndSubmit(1, 3, "TRACFIN-2024-001");

    expect(repo.updateReport).toHaveBeenCalledWith(1, expect.objectContaining({
      status:    "SUBMITTED",
      approvedBy: 3,
      regulatoryRef: "TRACFIN-2024-001",
    }));
    expect(result.status).toBe("SUBMITTED");
  });

  it("approveAndSubmit : refuse si pas en REVIEW", async () => {
    vi.mocked(repo.findReportById).mockResolvedValue(mockDraftSar); // DRAFT
    await expect(approveAndSubmit(1, 3)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejectReport : REVIEW → REJECTED", async () => {
    vi.mocked(repo.findReportById).mockResolvedValue({ ...mockDraftSar, status: "REVIEW" });
    vi.mocked(repo.updateReport).mockResolvedValue({ ...mockDraftSar, status: "REJECTED" });

    const result = await rejectReport(1);

    expect(repo.updateReport).toHaveBeenCalledWith(1, expect.objectContaining({ status: "REJECTED" }));
    expect(result.status).toBe("REJECTED");
  });

  it("updateReportContent : autorisé sur DRAFT", async () => {
    vi.mocked(repo.findReportById).mockResolvedValue(mockDraftSar);
    vi.mocked(repo.updateReport).mockResolvedValue({ ...mockDraftSar, title: "Titre mis à jour" });

    await updateReportContent(1, { title: "Titre mis à jour" });

    expect(repo.updateReport).toHaveBeenCalledWith(1, expect.objectContaining({ title: "Titre mis à jour" }));
  });

  it("updateReportContent : refusé sur SUBMITTED", async () => {
    vi.mocked(repo.findReportById).mockResolvedValue({ ...mockDraftSar, status: "SUBMITTED" });
    await expect(
      updateReportContent(1, { title: "Trop tard" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
