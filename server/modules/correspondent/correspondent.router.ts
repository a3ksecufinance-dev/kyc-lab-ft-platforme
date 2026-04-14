/**
 * Correspondent Banking Router — FATF R.13
 *
 * Module conditionné au flag `correspondentBanking` (institution feature flag).
 * Onboarding, évaluation des risques, approbation senior management.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, analystProc, supervisorProc, complianceProc, adminProc } from "../../_core/trpc";
import { getInstitutionFlags } from "../../_core/institution";
import { createAuditFromContext } from "../../_core/audit";
import {
  listCorrespondentBanks,
  getCorrespondentBankById,
  getAssessments,
  createCorrespondentBank,
  submitAssessment,
  approveCorrespondentBank,
  suspendCorrespondentBank,
  terminateCorrespondentBank,
  getCorrespondentStats,
} from "./correspondent.service";
import { createApprovalRequest, getPendingApproval } from "../approvals/approvals.service";

function requireCorrespondent() {
  if (!(getInstitutionFlags() as unknown as Record<string, boolean>)["correspondentBanking"]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Module Correspondent Banking non activé" });
  }
}

const riskLevelEnum = z.enum(["LOW", "MEDIUM", "HIGH", "UNACCEPTABLE"]);
const statusEnum    = z.enum(["ACTIVE", "UNDER_REVIEW", "SUSPENDED", "TERMINATED"]);

export const correspondentRouter = router({

  list: analystProc
    .input(z.object({
      page:      z.number().int().positive().default(1),
      limit:     z.number().int().min(1).max(100).default(20),
      country:   z.string().length(3).optional(),
      riskLevel: riskLevelEnum.optional(),
      status:    statusEnum.optional(),
    }))
    .query(({ input }) => {
      requireCorrespondent();
      return listCorrespondentBanks({
        page:  input.page,
        limit: input.limit,
        ...(input.country   !== undefined && { country:   input.country }),
        ...(input.riskLevel !== undefined && { riskLevel: input.riskLevel }),
        ...(input.status    !== undefined && { status:    input.status }),
      });
    }),

  get: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      requireCorrespondent();
      const bank = await getCorrespondentBankById(input.id);
      if (!bank) throw new TRPCError({ code: "NOT_FOUND", message: `Banque correspondante #${input.id} introuvable` });
      return bank;
    }),

  getAssessments: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => {
      requireCorrespondent();
      return getAssessments(input.id);
    }),

  create: supervisorProc
    .input(z.object({
      name:         z.string().min(2).max(200),
      bic:          z.string().max(20).optional(),
      country:      z.string().length(3),
      jurisdiction: z.string().max(100).optional(),
      amlRegulator: z.string().max(200).optional(),
      fatfStatus:   z.enum(["compliant", "grey_list", "black_list"]).optional(),
      notes:        z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireCorrespondent();
      const log = createAuditFromContext(ctx);
      const bank = await createCorrespondentBank({
        name:         input.name,
        country:      input.country,
        onboardedBy:  ctx.user.id,
        ...(input.bic          !== undefined && { bic:          input.bic }),
        ...(input.jurisdiction !== undefined && { jurisdiction: input.jurisdiction }),
        ...(input.amlRegulator !== undefined && { amlRegulator: input.amlRegulator }),
        ...(input.fatfStatus   !== undefined && { fatfStatus:   input.fatfStatus }),
        ...(input.notes        !== undefined && { notes:        input.notes }),
      });
      await log({
        action:     "CORRESPONDENT_CREATED",
        entityType: "correspondent_bank",
        entityId:   String(bank.id),
        details:    { name: bank.name, country: bank.country, bic: bank.bic },
      });
      return bank;
    }),

  // Évaluation FATF R.13 — 4 critères (chacun 0-25)
  assess: complianceProc
    .input(z.object({
      bankId:               z.number().int().positive(),
      amlFrameworkScore:    z.number().int().min(0).max(25),
      ownershipTranspScore: z.number().int().min(0).max(25),
      supervisoryScore:     z.number().int().min(0).max(25),
      sanctionsRiskScore:   z.number().int().min(0).max(25),
      findings:             z.string().max(5000).optional(),
      recommendation:       z.enum(["approve", "conditional", "reject"]),
    }))
    .mutation(async ({ input, ctx }) => {
      requireCorrespondent();
      const log = createAuditFromContext(ctx);

      // Pour les recommendations "approve" ou "conditional", demander une approbation senior management
      if (input.recommendation !== "reject") {
        const existingApproval = await getPendingApproval("correspondent_bank", input.bankId);
        if (!existingApproval || existingApproval.status === "REJECTED") {
          const req = await createApprovalRequest({
            action:        "CASE_DECIDE",  // action la plus proche dans l'enum
            entityType:    "correspondent_bank",
            entityId:      input.bankId,
            requestedBy:   ctx.user.id,
            payload:       { recommendation: input.recommendation, amlScore: input.amlFrameworkScore },
            ...(input.findings !== undefined && { requesterNote: input.findings }),
          });
          await log({
            action:     "APPROVAL_REQUESTED",
            entityType: "correspondent_bank",
            entityId:   String(input.bankId),
            details:    { dualControl: "requested", approvalId: req.id, recommendation: input.recommendation },
          });
          return { requiresApproval: true as const, approvalId: req.id, assessment: null };
        }
        if (existingApproval.status === "PENDING") {
          return { requiresApproval: true as const, approvalId: existingApproval.id, assessment: null };
        }
      }

      const { bank, assessment } = await submitAssessment({
        bankId:               input.bankId,
        assessedBy:           ctx.user.id,
        amlFrameworkScore:    input.amlFrameworkScore,
        ownershipTranspScore: input.ownershipTranspScore,
        supervisoryScore:     input.supervisoryScore,
        sanctionsRiskScore:   input.sanctionsRiskScore,
        ...(input.findings !== undefined && { findings: input.findings }),
        recommendation:       input.recommendation,
      });

      await log({
        action:     "CORRESPONDENT_ASSESSED",
        entityType: "correspondent_bank",
        entityId:   String(input.bankId),
        details:    { riskScore: bank.riskScore, riskLevel: bank.riskLevel, recommendation: input.recommendation },
      });

      return { requiresApproval: false as const, approvalId: null, assessment, bank };
    }),

  // Approbation finale (senior management / admin)
  approve: adminProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireCorrespondent();
      const log = createAuditFromContext(ctx);
      const bank = await approveCorrespondentBank(input.id, ctx.user.id);
      await log({
        action:     "CORRESPONDENT_APPROVED",
        entityType: "correspondent_bank",
        entityId:   String(input.id),
        details:    { approvedBy: ctx.user.id },
      });
      return bank;
    }),

  suspend: supervisorProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireCorrespondent();
      const log = createAuditFromContext(ctx);
      const bank = await suspendCorrespondentBank(input.id);
      await log({ action: "CORRESPONDENT_SUSPENDED", entityType: "correspondent_bank", entityId: String(input.id) });
      return bank;
    }),

  terminate: adminProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireCorrespondent();
      const log = createAuditFromContext(ctx);
      const bank = await terminateCorrespondentBank(input.id);
      await log({ action: "CORRESPONDENT_SUSPENDED", entityType: "correspondent_bank", entityId: String(input.id),
        details: { action: "TERMINATED" } });
      return bank;
    }),

  stats: analystProc
    .query(() => {
      requireCorrespondent();
      return getCorrespondentStats();
    }),
});
