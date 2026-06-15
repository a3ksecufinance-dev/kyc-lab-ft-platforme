/**
 * Approvals Router — Dual Control / 4-eyes (ACPR art.13)
 *
 * Phase F — Multi-level approval chains :
 *   - request / review (multi-step)
 *   - chain CRUD (admin)
 *   - delegations (supervisor+)
 *   - escalation manuelle
 *   - steps detail
 */

import { z } from "zod";
import { router, complianceProc, supervisorProc, adminProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  createApprovalRequest,
  listApprovalRequests,
  getPendingApproval,
  reviewApproval,
  getApprovalById,
  getApprovalSteps,
  listChains,
  createChain,
  deactivateChain,
  getChainForAction,
  createDelegation,
  revokeDelegation,
  listDelegations,
  escalateApproval,
  autoEscalateStale,
} from "./approvals.service";

const chainLevelSchema = z.object({
  level:   z.number().int().positive(),
  minRole: z.string().min(1).max(30),
  label:   z.string().min(1).max(200),
});

export const approvalsRouter = router({

  // ── Core ────────────────────────────────────────────────────────────────

  request: complianceProc
    .input(z.object({
      action:        z.enum(["SAR_TRANSMIT", "CASE_DECIDE", "CUSTOMER_BLOCK", "WALLET_SUSPEND"]),
      entityType:    z.string().min(1).max(50),
      entityId:      z.number().int().positive(),
      requesterNote: z.string().max(1000).optional(),
      payload:       z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const auditLog = createAuditFromContext(ctx);
      const result = await createApprovalRequest({
        action:        input.action,
        entityType:    input.entityType,
        entityId:      input.entityId,
        requestedBy:   ctx.user.id,
        ...(input.requesterNote !== undefined && { requesterNote: input.requesterNote }),
        ...(input.payload       !== undefined && { payload: input.payload }),
      });

      await auditLog({
        action:     "APPROVAL_REQUESTED",
        entityType: "approval",
        entityId:   String(result.id),
        details:    { action: input.action, entityType: input.entityType, entityId: input.entityId, totalLevels: result.totalLevels },
      });

      return result;
    }),

  list: complianceProc
    .input(z.object({
      status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]).optional(),
      action: z.enum(["SAR_TRANSMIT", "CASE_DECIDE", "CUSTOMER_BLOCK", "WALLET_SUSPEND"]).optional(),
      page:   z.number().int().positive().default(1),
      limit:  z.number().int().min(1).max(100).default(20),
    }))
    .query(({ input }) => listApprovalRequests({
      ...(input.status !== undefined && { status: input.status }),
      ...(input.action !== undefined && { action: input.action }),
      page:  input.page,
      limit: input.limit,
    })),

  get: complianceProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const approval = await getApprovalById(input.id);
      if (!approval) throw new Error("Demande introuvable");
      const steps = await getApprovalSteps(input.id);
      return { approval, steps };
    }),

  getPending: supervisorProc
    .input(z.object({
      entityType: z.string(),
      entityId:   z.number().int().positive(),
    }))
    .query(({ input }) => getPendingApproval(input.entityType, input.entityId)),

  steps: complianceProc
    .input(z.object({ approvalId: z.number().int().positive() }))
    .query(({ input }) => getApprovalSteps(input.approvalId)),

  review: complianceProc
    .input(z.object({
      approvalId:   z.number().int().positive(),
      decision:     z.enum(["APPROVED", "REJECTED"]),
      reviewerNote: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const auditLog = createAuditFromContext(ctx);
      const { approval, levelCompleted, isFullyApproved } = await reviewApproval({
        approvalId:   input.approvalId,
        reviewedBy:   ctx.user.id,
        decision:     input.decision,
        ...(input.reviewerNote !== undefined && { reviewerNote: input.reviewerNote }),
      });

      // Audit: step completion for multi-level
      if (approval.totalLevels > 1) {
        await auditLog({
          action:     "APPROVAL_STEP_COMPLETED",
          entityType: "approval",
          entityId:   String(approval.id),
          details:    { level: levelCompleted, decision: input.decision, totalLevels: approval.totalLevels },
        });
      }

      // Audit: final decision
      if (isFullyApproved || input.decision === "REJECTED") {
        await auditLog({
          action:     input.decision === "APPROVED" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
          entityType: "approval",
          entityId:   String(approval.id),
          details:    { approvalId: approval.id, decision: input.decision, action: approval.action, levelsCompleted: levelCompleted },
        });
      }

      return { approval, levelCompleted, isFullyApproved };
    }),

  // ── Escalation ──────────────────────────────────────────────────────────

  escalate: supervisorProc
    .input(z.object({
      approvalId:  z.number().int().positive(),
      escalatedTo: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const auditLog = createAuditFromContext(ctx);
      const result = await escalateApproval(input.approvalId, input.escalatedTo);

      await auditLog({
        action:     "APPROVAL_ESCALATED",
        entityType: "approval",
        entityId:   String(input.approvalId),
        details:    { escalatedTo: input.escalatedTo },
      });

      return result;
    }),

  autoEscalate: adminProc
    .mutation(async () => {
      const count = await autoEscalateStale();
      return { escalated: count };
    }),

  // ── Chains (admin) ──────────────────────────────────────────────────────

  listChains: supervisorProc
    .query(() => listChains()),

  getChain: supervisorProc
    .input(z.object({ action: z.enum(["SAR_TRANSMIT", "CASE_DECIDE", "CUSTOMER_BLOCK", "WALLET_SUSPEND"]) }))
    .query(({ input }) => getChainForAction(input.action)),

  createChain: adminProc
    .input(z.object({
      action:      z.enum(["SAR_TRANSMIT", "CASE_DECIDE", "CUSTOMER_BLOCK", "WALLET_SUSPEND"]),
      name:        z.string().min(2).max(200),
      description: z.string().max(500).optional(),
      levels:      z.array(chainLevelSchema).min(1).max(5),
    }))
    .mutation(async ({ input, ctx }) => {
      const auditLog = createAuditFromContext(ctx);
      const chain = await createChain({
        action:      input.action,
        name:        input.name,
        ...(input.description !== undefined && { description: input.description }),
        levels:      input.levels,
        createdBy:   ctx.user.id,
      });

      await auditLog({
        action:     "APPROVAL_CHAIN_CONFIGURED",
        entityType: "approval_chain",
        entityId:   String(chain.id),
        details:    { action: input.action, levels: input.levels.length },
      });

      return chain;
    }),

  deactivateChain: adminProc
    .input(z.object({ chainId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const auditLog = createAuditFromContext(ctx);
      await deactivateChain(input.chainId);

      await auditLog({
        action:     "APPROVAL_CHAIN_CONFIGURED",
        entityType: "approval_chain",
        entityId:   String(input.chainId),
        details:    { deactivated: true },
      });

      return { success: true };
    }),

  // ── Delegations ─────────────────────────────────────────────────────────

  listDelegations: supervisorProc
    .input(z.object({
      delegatorId: z.number().int().positive().optional(),
      activeOnly:  z.boolean().default(true),
    }))
    .query(({ input }) => listDelegations({
      ...(input.delegatorId !== undefined && { delegatorId: input.delegatorId }),
      activeOnly: input.activeOnly,
    })),

  createDelegation: supervisorProc
    .input(z.object({
      delegateId: z.number().int().positive(),
      action:     z.enum(["SAR_TRANSMIT", "CASE_DECIDE", "CUSTOMER_BLOCK", "WALLET_SUSPEND"]).optional(),
      validFrom:  z.string().datetime(),
      validUntil: z.string().datetime(),
      reason:     z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const auditLog = createAuditFromContext(ctx);
      const result = await createDelegation({
        delegatorId: ctx.user.id,
        delegateId:  input.delegateId,
        action:      input.action ?? null,
        validFrom:   new Date(input.validFrom),
        validUntil:  new Date(input.validUntil),
        ...(input.reason !== undefined && { reason: input.reason }),
      });

      await auditLog({
        action:     "APPROVAL_DELEGATED",
        entityType: "delegation",
        entityId:   String(result.id),
        details:    { delegateId: input.delegateId, action: input.action ?? "ALL", validUntil: input.validUntil },
      });

      return result;
    }),

  revokeDelegation: supervisorProc
    .input(z.object({ delegationId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const auditLog = createAuditFromContext(ctx);
      await revokeDelegation(input.delegationId);

      await auditLog({
        action:     "APPROVAL_DELEGATED",
        entityType: "delegation",
        entityId:   String(input.delegationId),
        details:    { revoked: true },
      });

      return { success: true };
    }),
});
