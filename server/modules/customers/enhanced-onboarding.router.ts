/**
 * Router EDD (Enhanced Due Diligence) — tier RENFORCÉ
 * Protégé par le flag enhancedOnboarding.
 * Endpoints accessibles : analyst+ (lecture/checklist), supervisor+ (validation/rejet).
 */

import { z }         from "zod";
import { TRPCError } from "@trpc/server";
import { router, analystProc, supervisorProc } from "../../_core/trpc";
import { createAuditFromContext }               from "../../_core/audit";
import { getInstitutionFlags }                  from "../../_core/institution";
import {
  initEdd,
  getOpenEddCase,
  getEddCaseOrThrow,
  listEddCases,
  updateEddChecklistItem,
  recordEddInterview,
  completeEdd,
  rejectEdd,
  INITIAL_EDD_CHECKLIST,
} from "./enhanced-onboarding.service";

// ─── Guard ────────────────────────────────────────────────────────────────────

function requireEnhancedOnboarding(): void {
  if (!getInstitutionFlags().enhancedOnboarding) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Module EDD (enhanced onboarding) non activé pour cette institution",
    });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const enhancedOnboardingRouter = router({

  /**
   * Retourne la structure de checklist EDD (utilisée par le frontend pour rendu).
   */
  checklistTemplate: analystProc
    .query(() => {
      requireEnhancedOnboarding();
      return INITIAL_EDD_CHECKLIST;
    }),

  /**
   * Dossier EDD ouvert d'un client, ou null.
   */
  getOpen: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input }) => {
      requireEnhancedOnboarding();
      return getOpenEddCase(input.customerId);
    }),

  /**
   * Historique de tous les dossiers EDD d'un client.
   */
  history: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input }) => {
      requireEnhancedOnboarding();
      return listEddCases(input.customerId);
    }),

  /**
   * Détail d'un dossier EDD (avec checklist parsée).
   */
  getById: analystProc
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ input }) => {
      requireEnhancedOnboarding();
      const eddCase = await getEddCaseOrThrow(input.caseId);
      const checklist = eddCase.findings ? JSON.parse(eddCase.findings) : null;
      return { ...eddCase, checklist };
    }),

  /**
   * Ouvrir un dossier EDD pour un client (analyst+).
   */
  init: analystProc
    .input(z.object({
      customerId: z.number().int().positive(),
      walletId:   z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireEnhancedOnboarding();
      const log = createAuditFromContext(ctx);

      const eddCase = await initEdd({
        customerId: input.customerId,
        walletId:   input.walletId,
        analystId:  ctx.user.id,
      });

      await log({
        action:     "CASE_CREATED",
        entityType: "case",
        entityId:   eddCase.caseId,
        details:    { customerId: input.customerId, walletId: input.walletId, type: "EDD" },
      });

      return eddCase;
    }),

  /**
   * Mettre à jour un item de la checklist (analyst+).
   */
  updateItem: analystProc
    .input(z.object({
      caseId: z.number().int().positive(),
      itemId: z.string().min(1),
      done:   z.boolean(),
      notes:  z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireEnhancedOnboarding();

      const params = {
        caseId: input.caseId,
        itemId: input.itemId,
        done:   input.done,
        userId: ctx.user.id,
        ...(input.notes !== undefined && { notes: input.notes }),
      };

      return updateEddChecklistItem(params);
    }),

  /**
   * Enregistrer l'entretien EDD (analyst+).
   */
  recordInterview: analystProc
    .input(z.object({
      caseId:        z.number().int().positive(),
      interviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD requis"),
      notes:         z.string().min(20, "Notes d'entretien requises (min 20 car.)"),
    }))
    .mutation(async ({ input, ctx }) => {
      requireEnhancedOnboarding();
      const log = createAuditFromContext(ctx);

      const updated = await recordEddInterview({
        caseId:        input.caseId,
        interviewDate: input.interviewDate,
        notes:         input.notes,
        userId:        ctx.user.id,
      });

      await log({
        action:     "CASE_STATUS_CHANGED",
        entityType: "case",
        entityId:   String(input.caseId),
        details:    { event: "EDD_INTERVIEW_RECORDED", date: input.interviewDate },
      });

      return updated;
    }),

  /**
   * Valider l'EDD et promouvoir le wallet RENFORCÉ (supervisor+).
   */
  complete: supervisorProc
    .input(z.object({
      caseId:     z.number().int().positive(),
      walletId:   z.number().int().positive(),
      customerId: z.number().int().positive(),
      decision:   z.string().min(20, "Décision requise (min 20 car.)"),
    }))
    .mutation(async ({ input, ctx }) => {
      requireEnhancedOnboarding();
      const log = createAuditFromContext(ctx);

      const result = await completeEdd({
        caseId:     input.caseId,
        walletId:   input.walletId,
        customerId: input.customerId,
        decision:   input.decision,
        userId:     ctx.user.id,
      });

      await log({
        action:     "CASE_DECISION_MADE",
        entityType: "case",
        entityId:   result.eddCase.caseId,
        details:    {
          decision:   "APPROVED",
          walletId:   input.walletId,
          newTier:    "RENFORCE",
          decisionBy: ctx.user.id,
        },
      });

      return result;
    }),

  /**
   * Rejeter l'EDD (supervisor+).
   */
  reject: supervisorProc
    .input(z.object({
      caseId: z.number().int().positive(),
      reason: z.string().min(20, "Motif de rejet requis (min 20 car.)"),
    }))
    .mutation(async ({ input, ctx }) => {
      requireEnhancedOnboarding();
      const log = createAuditFromContext(ctx);

      const closed = await rejectEdd({
        caseId: input.caseId,
        reason: input.reason,
        userId: ctx.user.id,
      });

      await log({
        action:     "CASE_DECISION_MADE",
        entityType: "case",
        entityId:   closed.caseId,
        details:    { decision: "REJECTED", reason: input.reason },
      });

      return closed;
    }),
});
