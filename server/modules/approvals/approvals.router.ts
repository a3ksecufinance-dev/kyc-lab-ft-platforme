/**
 * Approvals Router — Dual Control / 4-eyes (ACPR art.13)
 */

import { z } from "zod";
import { router, complianceProc, supervisorProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  listApprovalRequests,
  getPendingApproval,
  reviewApproval,
} from "./approvals.service";

export const approvalsRouter = router({

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

  getPending: supervisorProc
    .input(z.object({
      entityType: z.string(),
      entityId:   z.number().int().positive(),
    }))
    .query(({ input }) => getPendingApproval(input.entityType, input.entityId)),

  review: complianceProc
    .input(z.object({
      approvalId:   z.number().int().positive(),
      decision:     z.enum(["APPROVED", "REJECTED"]),
      reviewerNote: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const result = await reviewApproval({
        approvalId:   input.approvalId,
        reviewedBy:   ctx.user.id,
        decision:     input.decision,
        ...(input.reviewerNote !== undefined && { reviewerNote: input.reviewerNote }),
      });

      await log({
        action:     input.decision === "APPROVED" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
        entityType: "approval",
        entityId:   String(result.id),
        details:    { approvalId: result.id, decision: input.decision, action: result.action },
      });

      return result;
    }),
});
