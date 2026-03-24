import { eq, desc, and, count } from "drizzle-orm";
import { db } from "../../_core/db";
import { cases, caseTimeline, type Case, type InsertCase } from "../../../drizzle/schema";

export interface ListCasesInput {
  page: number;
  limit: number;
  status?: Case["status"] | undefined;
  severity?: Case["severity"] | undefined;
  customerId?: number | undefined;
  assignedTo?: number | undefined;
}

export async function findManyCases(input: ListCasesInput) {
  const offset = (input.page - 1) * input.limit;
  const conditions = [];

  if (input.status)     conditions.push(eq(cases.status, input.status));
  if (input.severity)   conditions.push(eq(cases.severity, input.severity));
  if (input.customerId) conditions.push(eq(cases.customerId, input.customerId));
  if (input.assignedTo) conditions.push(eq(cases.assignedTo, input.assignedTo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select().from(cases).where(where).orderBy(desc(cases.createdAt)).limit(input.limit).offset(offset),
    db.select({ total: count() }).from(cases).where(where),
  ]);

  return {
    data,
    total: Number(countResult[0]?.total ?? 0),
    page: input.page,
    limit: input.limit,
    totalPages: Math.ceil(Number(countResult[0]?.total ?? 0) / input.limit),
  };
}

export async function findCaseById(id: number): Promise<Case | null> {
  const [c] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);
  return c ?? null;
}

export async function insertCase(values: InsertCase): Promise<Case> {
  const [c] = await db.insert(cases).values(values).returning();
  if (!c) throw new Error("Échec insertion case");
  return c;
}

export async function updateCase(
  id: number,
  values: Partial<Pick<Case,
    | "status" | "severity" | "assignedTo" | "supervisorId"
    | "findings" | "decision" | "decisionNotes" | "decisionBy" | "decisionAt"
    | "dueDate" | "linkedAlerts"
  >>
): Promise<Case> {
  const [updated] = await db
    .update(cases)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(cases.id, id))
    .returning();
  if (!updated) throw new Error(`Case ${id} introuvable`);
  return updated;
}

export async function insertTimelineEntry(values: {
  caseId: number;
  action: string;
  description?: string | undefined;
  performedBy?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}) {
  const [entry] = await db
    .insert(caseTimeline)
    .values({
      caseId: values.caseId,
      action: values.action,
      description: values.description ?? null,
      performedBy: values.performedBy ?? null,
      metadata: (values.metadata ?? null) as null,
    })
    .returning();
  return entry;
}

export async function findTimelineByCase(caseId: number) {
  return db
    .select()
    .from(caseTimeline)
    .where(eq(caseTimeline.caseId, caseId))
    .orderBy(caseTimeline.createdAt);
}

export async function getCaseStats() {
  const [total, byStatus, bySeverity] = await Promise.all([
    db.select({ total: count() }).from(cases),
    db.select({ status: cases.status, count: count() }).from(cases).groupBy(cases.status),
    db.select({ severity: cases.severity, count: count() }).from(cases).groupBy(cases.severity),
  ]);

  return {
    total: Number(total[0]?.total ?? 0),
    byStatus: Object.fromEntries(byStatus.map((r: { status: string; count: number | bigint }) => [r.status, Number(r.count)])),
    bySeverity: Object.fromEntries(bySeverity.map((r: { severity: string; count: number | bigint }) => [r.severity, Number(r.count)])),
  };
}
