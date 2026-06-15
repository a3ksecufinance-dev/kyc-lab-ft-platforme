/**
 * Dual Control / 4-eyes Service (ACPR art.13 / FATF R.20)
 *
 * Phase F — Multi-level approval chains :
 *   - Chaînes configurables par type d'action (1 à N niveaux)
 *   - Chaque niveau exige un rôle minimum différent
 *   - Délégation du pouvoir d'approbation (congés, absence)
 *   - Escalade automatique si timeout configurable
 *   - Rétrocompatible : si aucune chaîne configurée → single-level (legacy)
 */

import { eq, and, lt, count, desc, isNull } from "drizzle-orm";
import { db } from "../../_core/db";
import {
  approvalRequests,
  approvalChains,
  approvalSteps,
  approvalDelegations,
  type ApprovalRequest,
  type InsertApprovalRequest,
  type ApprovalChain,
  type ApprovalStep,
} from "../../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { createLogger } from "../../_core/logger";

const log = createLogger("approvals");

const EXPIRY_HOURS = 48;
const ESCALATION_HOURS = 24;

// ─── Chain level type ────────────────────────────────────────────────────────

export interface ChainLevel {
  level:   number;
  minRole: string;
  label:   string;
}

// ─── Chain CRUD ──────────────────────────────────────────────────────────────

export async function getChainForAction(action: ApprovalRequest["action"]): Promise<ApprovalChain | null> {
  const [chain] = await db
    .select()
    .from(approvalChains)
    .where(and(eq(approvalChains.action, action), eq(approvalChains.isActive, true)))
    .orderBy(desc(approvalChains.createdAt))
    .limit(1);
  return chain ?? null;
}

export async function listChains(): Promise<ApprovalChain[]> {
  return db.select().from(approvalChains).orderBy(approvalChains.action);
}

export async function createChain(input: {
  action:      ApprovalChain["action"];
  name:        string;
  description?: string;
  levels:      ChainLevel[];
  createdBy:   number;
}): Promise<ApprovalChain> {
  // Désactiver les chaînes existantes pour cette action
  await db
    .update(approvalChains)
    .set({ isActive: false })
    .where(eq(approvalChains.action, input.action));

  const [chain] = await db
    .insert(approvalChains)
    .values({
      action:      input.action,
      name:        input.name,
      description: input.description ?? null,
      levels:      input.levels,
      isActive:    true,
      createdBy:   input.createdBy,
    })
    .returning();

  if (!chain) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur création chaîne" });

  log.info({ id: chain.id, action: chain.action, levels: input.levels.length }, "Approval chain created");
  return chain;
}

export async function deactivateChain(chainId: number): Promise<void> {
  await db
    .update(approvalChains)
    .set({ isActive: false })
    .where(eq(approvalChains.id, chainId));
}

// ─── Create Approval Request (multi-level aware) ────────────────────────────

export async function createApprovalRequest(input: {
  action:        InsertApprovalRequest["action"];
  entityType:    string;
  entityId:      number;
  requestedBy:   number;
  payload?:      unknown;
  requesterNote?: string;
}): Promise<ApprovalRequest> {
  const chain = await getChainForAction(input.action);
  const levels = chain ? (chain.levels as ChainLevel[]) : [];
  const totalLevels = levels.length || 1;

  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 3_600_000);

  const [req] = await db
    .insert(approvalRequests)
    .values({
      action:        input.action,
      entityType:    input.entityType,
      entityId:      input.entityId,
      requestedBy:   input.requestedBy,
      status:        "PENDING",
      payload:       input.payload ?? null,
      requesterNote: input.requesterNote ?? null,
      expiresAt,
      chainId:       chain?.id ?? null,
      currentLevel:  1,
      totalLevels,
    })
    .returning();

  if (!req) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur création demande d'approbation" });

  // Créer les steps si chaîne multi-niveau
  if (chain && levels.length > 0) {
    await db.insert(approvalSteps).values(
      levels.map(l => ({
        approvalId: req.id,
        level:      l.level,
        minRole:    l.minRole,
        label:      l.label,
        status:     "PENDING" as const,
      }))
    );
  }

  log.info({ id: req.id, action: req.action, entityId: req.entityId, totalLevels }, "Approval request created");
  return req;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listApprovalRequests(opts: {
  status?: ApprovalRequest["status"];
  action?: ApprovalRequest["action"];
  page:    number;
  limit:   number;
}): Promise<{ items: ApprovalRequest[]; total: number }> {
  const conditions = [];
  if (opts.status) conditions.push(eq(approvalRequests.status, opts.status));
  if (opts.action) conditions.push(eq(approvalRequests.action, opts.action));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(approvalRequests)
      .where(where)
      .orderBy(desc(approvalRequests.createdAt))
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit),
    db
      .select({ total: count() })
      .from(approvalRequests)
      .where(where),
  ]);

  return { items, total: Number(totalRows[0]?.total ?? 0) };
}

// ─── Get by entity ──────────────────────────────────────────────────────────

export async function getPendingApproval(entityType: string, entityId: number): Promise<ApprovalRequest | null> {
  const [req] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.entityType, entityType),
        eq(approvalRequests.entityId,   entityId),
        eq(approvalRequests.status,     "PENDING"),
      )
    )
    .limit(1);

  return req ?? null;
}

// ─── Get steps for an approval ──────────────────────────────────────────────

export async function getApprovalSteps(approvalId: number): Promise<ApprovalStep[]> {
  return db
    .select()
    .from(approvalSteps)
    .where(eq(approvalSteps.approvalId, approvalId))
    .orderBy(approvalSteps.level);
}

// ─── Review (approve / reject) — multi-level ────────────────────────────────

export async function reviewApproval(input: {
  approvalId:   number;
  reviewedBy:   number;
  decision:     "APPROVED" | "REJECTED";
  reviewerNote?: string;
}): Promise<{ approval: ApprovalRequest; levelCompleted: number; isFullyApproved: boolean }> {
  const [existing] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, input.approvalId))
    .limit(1);

  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Demande d'approbation introuvable" });
  }

  if (existing.status !== "PENDING") {
    throw new TRPCError({ code: "CONFLICT", message: `Cette demande est déjà ${existing.status}` });
  }

  // 4-eyes: le reviewer ne peut pas être le demandeur
  if (existing.requestedBy === input.reviewedBy) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Principe des 4 yeux : vous ne pouvez pas approuver votre propre demande",
    });
  }

  // Vérifier expiration
  if (existing.expiresAt && existing.expiresAt < new Date()) {
    await db
      .update(approvalRequests)
      .set({ status: "EXPIRED" })
      .where(eq(approvalRequests.id, input.approvalId));

    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cette demande d'approbation a expiré" });
  }

  const currentLevel = existing.currentLevel;

  // ── Rejection at any level → entire request rejected
  if (input.decision === "REJECTED") {
    // Mark current step as rejected (if multi-level)
    if (existing.chainId) {
      await db
        .update(approvalSteps)
        .set({ status: "REJECTED", reviewedBy: input.reviewedBy, reviewerNote: input.reviewerNote ?? null, reviewedAt: new Date() })
        .where(and(eq(approvalSteps.approvalId, input.approvalId), eq(approvalSteps.level, currentLevel)));

      // Skip remaining steps
      await db
        .update(approvalSteps)
        .set({ status: "SKIPPED" })
        .where(and(
          eq(approvalSteps.approvalId, input.approvalId),
          eq(approvalSteps.status, "PENDING"),
        ));
    }

    const [updated] = await db
      .update(approvalRequests)
      .set({ status: "REJECTED", reviewedBy: input.reviewedBy, reviewerNote: input.reviewerNote ?? null, reviewedAt: new Date() })
      .where(eq(approvalRequests.id, input.approvalId))
      .returning();

    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur mise à jour" });

    log.info({ id: updated.id, decision: "REJECTED", level: currentLevel }, "Approval rejected");
    return { approval: updated, levelCompleted: currentLevel, isFullyApproved: false };
  }

  // ── Approval — mark current step, advance or finalize
  if (existing.chainId) {
    await db
      .update(approvalSteps)
      .set({ status: "APPROVED", reviewedBy: input.reviewedBy, reviewerNote: input.reviewerNote ?? null, reviewedAt: new Date() })
      .where(and(eq(approvalSteps.approvalId, input.approvalId), eq(approvalSteps.level, currentLevel)));
  }

  const isLastLevel = currentLevel >= existing.totalLevels;

  if (isLastLevel) {
    // All levels approved → finalize
    const [updated] = await db
      .update(approvalRequests)
      .set({ status: "APPROVED", reviewedBy: input.reviewedBy, reviewerNote: input.reviewerNote ?? null, reviewedAt: new Date() })
      .where(eq(approvalRequests.id, input.approvalId))
      .returning();

    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur mise à jour" });

    log.info({ id: updated.id, decision: "APPROVED", level: currentLevel, totalLevels: existing.totalLevels }, "Approval fully approved");
    return { approval: updated, levelCompleted: currentLevel, isFullyApproved: true };
  }

  // Advance to next level
  const [updated] = await db
    .update(approvalRequests)
    .set({ currentLevel: currentLevel + 1 })
    .where(eq(approvalRequests.id, input.approvalId))
    .returning();

  if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur avancement niveau" });

  log.info({ id: updated.id, level: currentLevel, nextLevel: currentLevel + 1, totalLevels: existing.totalLevels }, "Approval advanced to next level");
  return { approval: updated, levelCompleted: currentLevel, isFullyApproved: false };
}

// ─── Escalation ─────────────────────────────────────────────────────────────

export async function escalateApproval(approvalId: number, escalatedTo: number): Promise<ApprovalRequest> {
  const [updated] = await db
    .update(approvalRequests)
    .set({ escalatedAt: new Date(), escalatedTo })
    .where(eq(approvalRequests.id, approvalId))
    .returning();

  if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Demande introuvable" });

  log.info({ id: approvalId, escalatedTo }, "Approval escalated");
  return updated;
}

export async function autoEscalateStale(): Promise<number> {
  const threshold = new Date(Date.now() - ESCALATION_HOURS * 3_600_000);

  // Trouver les approbations PENDING vieilles de > ESCALATION_HOURS sans escalade
  const stale = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.status, "PENDING"),
        lt(approvalRequests.createdAt, threshold),
        isNull(approvalRequests.escalatedAt),
      )
    );

  for (const row of stale) {
    await db
      .update(approvalRequests)
      .set({ escalatedAt: new Date() })
      .where(eq(approvalRequests.id, row.id));
  }

  if (stale.length > 0) {
    log.warn({ count: stale.length }, "Auto-escalated stale approvals");
  }

  return stale.length;
}

// ─── Expire stale requests ──────────────────────────────────────────────────

export async function expireStaleApprovals(): Promise<number> {
  const result = await db
    .update(approvalRequests)
    .set({ status: "EXPIRED" })
    .where(
      and(
        eq(approvalRequests.status, "PENDING"),
        lt(approvalRequests.expiresAt, new Date()),
      )
    )
    .returning({ id: approvalRequests.id });

  return result.length;
}

// ─── Delegations ────────────────────────────────────────────────────────────

export async function createDelegation(input: {
  delegatorId: number;
  delegateId:  number;
  action?:     ApprovalRequest["action"] | null;
  validFrom:   Date;
  validUntil:  Date;
  reason?:     string;
}) {
  if (input.delegatorId === input.delegateId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Impossible de déléguer à soi-même" });
  }
  if (input.validUntil <= input.validFrom) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "La date de fin doit être postérieure à la date de début" });
  }

  const [deleg] = await db
    .insert(approvalDelegations)
    .values({
      delegatorId: input.delegatorId,
      delegateId:  input.delegateId,
      action:      input.action ?? null,
      validFrom:   input.validFrom,
      validUntil:  input.validUntil,
      reason:      input.reason ?? null,
      isActive:    true,
    })
    .returning();

  log.info({ id: deleg!.id, delegator: input.delegatorId, delegate: input.delegateId }, "Delegation created");
  return deleg!;
}

export async function revokeDelegation(delegationId: number): Promise<void> {
  await db
    .update(approvalDelegations)
    .set({ isActive: false })
    .where(eq(approvalDelegations.id, delegationId));
}

export async function listDelegations(opts?: { delegatorId?: number; activeOnly?: boolean }) {
  const conditions = [];
  if (opts?.delegatorId) conditions.push(eq(approvalDelegations.delegatorId, opts.delegatorId));
  if (opts?.activeOnly) conditions.push(eq(approvalDelegations.isActive, true));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.select().from(approvalDelegations).where(where).orderBy(desc(approvalDelegations.createdAt));
}

/**
 * Vérifie si un utilisateur a une délégation active pour une action donnée.
 * Retourne l'ID du délégateur si oui, null sinon.
 */
export async function checkDelegation(userId: number, action: ApprovalRequest["action"]): Promise<number | null> {
  const now = new Date();
  const [deleg] = await db
    .select()
    .from(approvalDelegations)
    .where(
      and(
        eq(approvalDelegations.delegateId, userId),
        eq(approvalDelegations.isActive, true),
        lt(approvalDelegations.validFrom, now),
      )
    )
    .limit(1);

  if (!deleg) return null;
  if (deleg.validUntil < now) return null;
  // null action = delegation pour toutes les actions
  if (deleg.action !== null && deleg.action !== action) return null;

  return deleg.delegatorId;
}

// ─── Get single approval ───────────────────────────────────────────────────

export async function getApprovalById(id: number): Promise<ApprovalRequest | null> {
  const [req] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, id))
    .limit(1);
  return req ?? null;
}
