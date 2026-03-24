import { eq, desc, and, count, gte } from "drizzle-orm";
import { db } from "../../_core/db";
import { alerts, type Alert } from "../../../drizzle/schema";

export interface ListAlertsInput {
  page: number;
  limit: number;
  status?: Alert["status"] | undefined;
  priority?: Alert["priority"] | undefined;
  alertType?: Alert["alertType"] | undefined;
  customerId?: number | undefined;
  assignedTo?: number | undefined;
}

export async function findManyAlerts(input: ListAlertsInput) {
  const offset = (input.page - 1) * input.limit;
  const conditions = [];

  if (input.status)     conditions.push(eq(alerts.status, input.status));
  if (input.priority)   conditions.push(eq(alerts.priority, input.priority));
  if (input.alertType)  conditions.push(eq(alerts.alertType, input.alertType));
  if (input.customerId) conditions.push(eq(alerts.customerId, input.customerId));
  if (input.assignedTo) conditions.push(eq(alerts.assignedTo, input.assignedTo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select().from(alerts).where(where).orderBy(desc(alerts.createdAt)).limit(input.limit).offset(offset),
    db.select({ total: count() }).from(alerts).where(where),
  ]);

  return {
    data,
    total: Number(countResult[0]?.total ?? 0),
    page: input.page,
    limit: input.limit,
    totalPages: Math.ceil(Number(countResult[0]?.total ?? 0) / input.limit),
  };
}

export async function findAlertById(id: number): Promise<Alert | null> {
  const [alert] = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
  return alert ?? null;
}

export async function updateAlert(
  id: number,
  values: Partial<Pick<Alert, "status" | "assignedTo" | "resolvedBy" | "resolvedAt" | "resolution">>
): Promise<Alert> {
  const [updated] = await db
    .update(alerts)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(alerts.id, id))
    .returning();
  if (!updated) throw new Error(`Alerte ${id} introuvable`);
  return updated;
}

export async function getAlertStats() {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [total, open, byPriority, byStatus, recent] = await Promise.all([
    db.select({ total: count() }).from(alerts),
    db.select({ total: count() }).from(alerts).where(eq(alerts.status, "OPEN")),
    db.select({ priority: alerts.priority, count: count() }).from(alerts)
      .where(eq(alerts.status, "OPEN")).groupBy(alerts.priority),
    db.select({ status: alerts.status, count: count() }).from(alerts).groupBy(alerts.status),
    db.select({ total: count() }).from(alerts).where(gte(alerts.createdAt, since30d)),
  ]);

  return {
    total: Number(total[0]?.total ?? 0),
    open: Number(open[0]?.total ?? 0),
    last30Days: Number(recent[0]?.total ?? 0),
    byPriority: Object.fromEntries(byPriority.map((r: { priority: string; count: number | bigint }) => [r.priority, Number(r.count)])),
    byStatus: Object.fromEntries(byStatus.map((r: { status: string; count: number | bigint }) => [r.status, Number(r.count)])),
  };
}
