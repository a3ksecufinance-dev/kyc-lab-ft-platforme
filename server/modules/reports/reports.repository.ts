import { eq, desc, and, count, gte, inArray } from "drizzle-orm";
import { db } from "../../_core/db";
import { reports, type Report, type InsertReport } from "../../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListReportsInput {
  page: number;
  limit: number;
  reportType?: Report["reportType"] | undefined;
  status?: Report["status"] | undefined;
  customerId?: number | undefined;
  caseId?: number | undefined;
  dateFrom?: Date | undefined;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function insertReport(values: InsertReport): Promise<Report> {
  const [report] = await db.insert(reports).values(values).returning();
  if (!report) throw new Error("Échec insertion report");
  return report;
}

export async function findReportById(id: number): Promise<Report | null> {
  const [r] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return r ?? null;
}

export async function findReportByReportId(reportId: string): Promise<Report | null> {
  const [r] = await db.select().from(reports).where(eq(reports.reportId, reportId)).limit(1);
  return r ?? null;
}

export async function findManyReports(input: ListReportsInput) {
  const offset = (input.page - 1) * input.limit;
  const conditions = [];

  if (input.reportType !== undefined) conditions.push(eq(reports.reportType, input.reportType));
  if (input.status !== undefined)     conditions.push(eq(reports.status, input.status));
  if (input.customerId !== undefined) conditions.push(eq(reports.customerId, input.customerId));
  if (input.caseId !== undefined)     conditions.push(eq(reports.caseId, input.caseId));
  if (input.dateFrom !== undefined)   conditions.push(gte(reports.createdAt, input.dateFrom));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select().from(reports).where(where).orderBy(desc(reports.createdAt)).limit(input.limit).offset(offset),
    db.select({ total: count() }).from(reports).where(where),
  ]);

  return {
    data,
    total: Number(countResult[0]?.total ?? 0),
    page: input.page,
    limit: input.limit,
    totalPages: Math.ceil(Number(countResult[0]?.total ?? 0) / input.limit),
  };
}

export async function updateReport(
  id: number,
  values: Partial<Pick<
    Report,
    | "status" | "title" | "content" | "suspicionType"
    | "amountInvolved" | "currency" | "regulatoryRef"
    | "submittedBy" | "submittedAt" | "approvedBy" | "approvedAt"
    | "updatedAt"
  >>
): Promise<Report> {
  const [updated] = await db
    .update(reports)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  if (!updated) throw new Error(`Report ${id} introuvable`);
  return updated;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getReportStats() {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [total, pending, byType, byStatus, ytd] = await Promise.all([
    db.select({ total: count() }).from(reports),
    db.select({ total: count() }).from(reports)
      .where(inArray(reports.status, ["DRAFT", "REVIEW"])),
    db.select({ type: reports.reportType, count: count() })
      .from(reports).groupBy(reports.reportType),
    db.select({ status: reports.status, count: count() })
      .from(reports).groupBy(reports.status),
    db.select({ total: count() }).from(reports)
      .where(gte(reports.createdAt, yearStart)),
  ]);

  return {
    total: Number(total[0]?.total ?? 0),
    pending: Number(pending[0]?.total ?? 0),
    ytd: Number(ytd[0]?.total ?? 0),
    byType: Object.fromEntries(
      byType.map((r: { type: string; count: number | bigint }) => [r.type, Number(r.count)])
    ),
    byStatus: Object.fromEntries(
      byStatus.map((r: { status: string; count: number | bigint }) => [r.status, Number(r.count)])
    ),
  };
}
