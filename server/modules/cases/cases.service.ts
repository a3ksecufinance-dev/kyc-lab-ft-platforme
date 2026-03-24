import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import {
  findManyCases, findCaseById, insertCase, updateCase,
  insertTimelineEntry, findTimelineByCase, getCaseStats,
  type ListCasesInput,
} from "./cases.repository";
import type { Case } from "../../../drizzle/schema";

export interface CreateCaseInput {
  customerId: number;
  title: string;
  description?: string | undefined;
  severity?: Case["severity"] | undefined;
  linkedAlerts?: number[] | undefined;
  dueDate?: Date | undefined;
}

export async function listCases(input: ListCasesInput) {
  return findManyCases(input);
}

export async function getCaseOrThrow(id: number): Promise<Case> {
  const c = await findCaseById(id);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: `Dossier #${id} introuvable` });
  return c;
}

export async function createCase(input: CreateCaseInput, createdBy: number): Promise<Case> {
  const caseId = `CASE-${nanoid(8).toUpperCase()}`;

  const c = await insertCase({
    caseId,
    customerId: input.customerId,
    title: input.title,
    description: input.description ?? null,
    severity: input.severity ?? "MEDIUM",
    assignedTo: createdBy,
    status: "OPEN",
    decision: "PENDING",
    linkedAlerts: (input.linkedAlerts ?? null) as null,
    dueDate: input.dueDate ?? null,
  });

  await insertTimelineEntry({
    caseId: c.id,
    action: "CASE_OPENED",
    description: `Dossier ouvert par l'analyste #${createdBy}`,
    performedBy: createdBy,
  });

  return c;
}

export async function updateCaseStatus(
  id: number,
  status: Case["status"],
  performedBy: number,
  note?: string | undefined
): Promise<Case> {
  const c = await getCaseOrThrow(id);

  // Règle métier : un dossier fermé ne peut plus être modifié
  if (c.status === "CLOSED" || c.status === "SAR_SUBMITTED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Dossier ${c.status} — ne peut plus être modifié`,
    });
  }

  const updated = await updateCase(id, { status });

  await insertTimelineEntry({
    caseId: id,
    action: `STATUS_CHANGED_TO_${status}`,
    description: note ?? `Statut changé → ${status}`,
    performedBy,
  });

  return updated;
}

export async function assignCase(
  id: number,
  assignedTo: number,
  supervisorId: number | undefined,
  performedBy: number
): Promise<Case> {
  await getCaseOrThrow(id);
  const updated = await updateCase(id, {
    assignedTo,
    ...(supervisorId !== undefined && { supervisorId }),
  });

  await insertTimelineEntry({
    caseId: id,
    action: "CASE_ASSIGNED",
    description: `Dossier assigné à l'utilisateur #${assignedTo}`,
    performedBy,
  });

  return updated;
}

export async function addFindings(
  id: number,
  findings: string,
  performedBy: number
): Promise<Case> {
  await getCaseOrThrow(id);
  const updated = await updateCase(id, { findings });

  await insertTimelineEntry({
    caseId: id,
    action: "FINDINGS_ADDED",
    description: "Conclusions d'investigation mises à jour",
    performedBy,
    metadata: { excerpt: findings.slice(0, 100) },
  });

  return updated;
}

export async function makeDecision(
  id: number,
  decision: Case["decision"],
  decisionNotes: string,
  decidedBy: number
): Promise<Case> {
  const c = await getCaseOrThrow(id);

  if (c.decision !== "PENDING") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Décision déjà prise : ${c.decision}`,
    });
  }

  // Mapper décision → statut
  const newStatus: Case["status"] =
    decision === "SAR_FILED" || decision === "STR_FILED" ? "SAR_SUBMITTED"
    : decision === "ESCALATED"                           ? "ESCALATED"
    : "CLOSED";

  const updated = await updateCase(id, {
    decision,
    decisionNotes,
    decisionBy: decidedBy,
    decisionAt: new Date(),
    status: newStatus,
  });

  await insertTimelineEntry({
    caseId: id,
    action: `DECISION_${decision}`,
    description: decisionNotes,
    performedBy: decidedBy,
  });

  return updated;
}

export const getCaseTimeline = (caseId: number) => findTimelineByCase(caseId);
export { getCaseStats };
