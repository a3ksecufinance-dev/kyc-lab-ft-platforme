import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, analystProc, supervisorProc, complianceProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  listCases, getCaseOrThrow, createCase, updateCaseStatus,
  assignCase, addFindings, makeDecision, getCaseTimeline, getCaseStats,
} from "./cases.service";
import { createApprovalRequest, getPendingApproval } from "../approvals/approvals.service";

const caseStatusEnum = z.enum(["OPEN", "UNDER_INVESTIGATION", "PENDING_APPROVAL", "ESCALATED", "CLOSED", "SAR_SUBMITTED"]);
const caseSeverityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const caseDecisionEnum = z.enum(["CLOSED_NO_ACTION", "ESCALATED", "SAR_FILED", "STR_FILED"]);

export const casesRouter = router({

  list: analystProc
    .input(z.object({
      page:       z.number().int().positive().default(1),
      limit:      z.number().int().min(1).max(100).default(20),
      status:     caseStatusEnum.optional(),
      severity:   caseSeverityEnum.optional(),
      customerId: z.number().int().positive().optional(),
      assignedTo: z.number().int().positive().optional(),
    }))
    .query(async ({ input }) => listCases(input)),

  getById: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => getCaseOrThrow(input.id)),

  create: analystProc
    .input(z.object({
      customerId:    z.number().int().positive(),
      title:         z.string().min(5).max(300),
      description:   z.string().optional(),
      severity:      caseSeverityEnum.optional(),
      linkedAlerts:  z.array(z.number().int().positive()).optional(),
      dueDate:       z.string().datetime().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const c = await createCase(
        { ...input, dueDate: input.dueDate ? new Date(input.dueDate) : undefined },
        ctx.user.id
      );
      await log({ action: "CASE_CREATED", entityType: "case", entityId: c.caseId,
        details: { title: c.title, severity: c.severity, customerId: c.customerId } });
      return c;
    }),

  updateStatus: analystProc
    .input(z.object({
      id:     z.number().int().positive(),
      status: caseStatusEnum,
      note:   z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const c = await updateCaseStatus(input.id, input.status, ctx.user.id, input.note);
      await log({ action: "CASE_STATUS_CHANGED", entityType: "case", entityId: c.caseId,
        details: { status: input.status } });
      return c;
    }),

  assign: supervisorProc
    .input(z.object({
      id:           z.number().int().positive(),
      assignedTo:   z.number().int().positive(),
      supervisorId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const c = await assignCase(input.id, input.assignedTo, input.supervisorId, ctx.user.id);
      await log({ action: "CASE_ASSIGNED", entityType: "case", entityId: c.caseId,
        details: { assignedTo: input.assignedTo } });
      return c;
    }),

  addFindings: analystProc
    .input(z.object({
      id:       z.number().int().positive(),
      findings: z.string().min(20, "Les conclusions doivent faire au moins 20 caractères"),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const c = await addFindings(input.id, input.findings, ctx.user.id);
      await log({ action: "CASE_STATUS_CHANGED", entityType: "case", entityId: c.caseId });
      return c;
    }),

  // Décision finale — compliance officer (4 yeux obligatoires pour SAR_FILED / STR_FILED)
  decide: complianceProc
    .input(z.object({
      id:            z.number().int().positive(),
      decision:      caseDecisionEnum,
      decisionNotes: z.string().min(20, "Notes de décision requises (min 20 caractères)"),
      // Pour SAR_FILED/STR_FILED : inclure l'approvalId validé par un second utilisateur
      approvalId:    z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);

      // 4-eyes gate : SAR et STR exigent une approbation préalable d'un second utilisateur
      if (input.decision === "SAR_FILED" || input.decision === "STR_FILED") {
        const existing = await getPendingApproval("case", input.id);

        if (!existing) {
          // Aucune demande → créer une demande d'approbation et bloquer
          const req = await createApprovalRequest({
            action:        "CASE_DECIDE",
            entityType:    "case",
            entityId:      input.id,
            requestedBy:   ctx.user.id,
            payload:       { decision: input.decision, decisionNotes: input.decisionNotes },
            requesterNote: input.decisionNotes,
          });
          await log({ action: "CASE_STATUS_CHANGED", entityType: "case",
            entityId: String(input.id),
            details: { dualControl: "requested", approvalId: req.id } });
          return { requiresApproval: true as const, approvalId: req.id, decision: null };
        }

        if (existing.status === "PENDING") {
          return { requiresApproval: true as const, approvalId: existing.id, decision: null };
        }

        if (existing.status === "REJECTED") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cette décision a été rejetée par le second valideur" });
        }
        // status === "APPROVED" → continuer
      }

      const c = await makeDecision(input.id, input.decision, input.decisionNotes, ctx.user.id);
      await log({ action: "CASE_DECISION_MADE", entityType: "case", entityId: c.caseId,
        details: { decision: input.decision } });
      return { requiresApproval: false as const, approvalId: null, decision: c };
    }),

  getTimeline: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      await getCaseOrThrow(input.id);
      return getCaseTimeline(input.id);
    }),

  stats: analystProc
    .query(async () => getCaseStats()),
});
