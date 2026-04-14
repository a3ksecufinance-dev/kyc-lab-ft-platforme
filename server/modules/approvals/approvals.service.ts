/**
 * Dual Control / 4-eyes Service (ACPR art.13 / FATF R.20)
 *
 * Une action critique (SAR_TRANSMIT, CASE_DECIDE…) génère une `approval_request`.
 * Un second utilisateur (différent du demandeur) doit approuver ou rejeter.
 * L'approbateur doit avoir un rôle >= compliance_officer.
 */

import { eq, and, lt, count } from "drizzle-orm";
import { db } from "../../_core/db";
import { approvalRequests, type ApprovalRequest, type InsertApprovalRequest } from "../../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { createLogger } from "../../_core/logger";

const log = createLogger("approvals");

const EXPIRY_HOURS = 48;

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createApprovalRequest(input: {
  action:        InsertApprovalRequest["action"];
  entityType:    string;
  entityId:      number;
  requestedBy:   number;
  payload?:      unknown;
  requesterNote?: string;
}): Promise<ApprovalRequest> {
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
    })
    .returning();

  if (!req) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur création demande d'approbation" });

  log.info({ id: req.id, action: req.action, entityId: req.entityId }, "Approval request created");
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
      .orderBy(approvalRequests.createdAt)
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit),
    db
      .select({ total: count() })
      .from(approvalRequests)
      .where(where),
  ]);

  return { items, total: Number(totalRows[0]?.total ?? 0) };
}

// ─── Get by entity ─────────────────────────────────────────────────────────────

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

// ─── Review (approve / reject) ────────────────────────────────────────────────

export async function reviewApproval(input: {
  approvalId:   number;
  reviewedBy:   number;
  decision:     "APPROVED" | "REJECTED";
  reviewerNote?: string;
}): Promise<ApprovalRequest> {
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

  const [updated] = await db
    .update(approvalRequests)
    .set({
      status:       input.decision,
      reviewedBy:   input.reviewedBy,
      reviewerNote: input.reviewerNote ?? null,
      reviewedAt:   new Date(),
    })
    .where(eq(approvalRequests.id, input.approvalId))
    .returning();

  if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur mise à jour approbation" });

  log.info({ id: updated.id, decision: input.decision, reviewedBy: input.reviewedBy }, "Approval reviewed");
  return updated;
}

// ─── Expire stale requests ─────────────────────────────────────────────────────

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
