import { eq, desc, gte, lte, and, or, count, sum, ilike } from "drizzle-orm";
import { db } from "../../_core/db";
import {
  transactions,
  alerts,
  type Transaction,
  type InsertTransaction,
  type InsertAlert,
  type Alert,
} from "../../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListTransactionsInput {
  page: number;
  limit: number;
  customerId?: number | undefined;
  status?: Transaction["status"] | undefined;
  isSuspicious?: boolean | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  amountMin?: number | undefined;
  amountMax?: number | undefined;
  search?: string | undefined;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function findManyTransactions(input: ListTransactionsInput) {
  const offset = (input.page - 1) * input.limit;
  const conditions = [];

  if (input.customerId)    conditions.push(eq(transactions.customerId, input.customerId));
  if (input.status)        conditions.push(eq(transactions.status, input.status));
  if (input.isSuspicious !== undefined) conditions.push(eq(transactions.isSuspicious, input.isSuspicious));
  if (input.dateFrom)      conditions.push(gte(transactions.transactionDate, input.dateFrom));
  if (input.dateTo)        conditions.push(lte(transactions.transactionDate, input.dateTo));
  if (input.amountMin !== undefined) conditions.push(gte(transactions.amount, String(input.amountMin)));
  if (input.amountMax !== undefined) conditions.push(lte(transactions.amount, String(input.amountMax)));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(
      ilike(transactions.counterparty, term),
      ilike(transactions.transactionId, term),
    )!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(desc(transactions.transactionDate))
      .limit(input.limit)
      .offset(offset),
    db.select({ total: count() }).from(transactions).where(where),
  ]);

  const total = countResult[0]?.total ?? 0;

  return {
    data,
    total: Number(total),
    page: input.page,
    limit: input.limit,
    totalPages: Math.ceil(Number(total) / input.limit),
  };
}

export async function findTransactionById(id: number): Promise<Transaction | null> {
  const [tx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  return tx ?? null;
}

export async function insertTransaction(values: InsertTransaction): Promise<Transaction> {
  const [tx] = await db.insert(transactions).values(values).returning();
  if (!tx) throw new Error("Échec insertion transaction");
  return tx;
}

export async function updateTransaction(
  id: number,
  values: Partial<Pick<Transaction, "status" | "isSuspicious" | "flagReason" | "riskScore" | "riskRules">>
): Promise<Transaction> {
  const [updated] = await db
    .update(transactions)
    .set(values)
    .where(eq(transactions.id, id))
    .returning();
  if (!updated) throw new Error(`Transaction ${id} introuvable`);
  return updated;
}

/**
 * Transactions récentes d'un customer dans une fenêtre de temps
 * Utilisé par le moteur AML pour détecter le structuring
 */
export async function findRecentByCustomer(
  customerId: number,
  since: Date
): Promise<Transaction[]> {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.customerId, customerId),
        gte(transactions.transactionDate, since)
      )
    )
    .orderBy(desc(transactions.transactionDate));
}

/**
 * Volume total et nombre de transactions sur une fenêtre
 * Utilisé pour détecter les variations de volume anormales
 */
export async function getVolumeStats(
  customerId: number,
  since: Date
): Promise<{ totalAmount: number; count: number }> {
  const [result] = await db
    .select({
      totalAmount: sum(transactions.amount),
      count: count(),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.customerId, customerId),
        gte(transactions.transactionDate, since),
        eq(transactions.status, "COMPLETED")
      )
    );

  return {
    totalAmount: Number(result?.totalAmount ?? 0),
    count: Number(result?.count ?? 0),
  };
}

/**
 * Stats globales pour le dashboard
 */
export async function getTransactionStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [total, suspicious, todayStats, byStatus] = await Promise.all([
    db.select({ total: count() }).from(transactions),
    db.select({ total: count() }).from(transactions).where(eq(transactions.isSuspicious, true)),
    db
      .select({ count: count(), volume: sum(transactions.amount) })
      .from(transactions)
      .where(gte(transactions.transactionDate, today)),
    db
      .select({ status: transactions.status, count: count() })
      .from(transactions)
      .groupBy(transactions.status),
  ]);

  return {
    total: Number(total[0]?.total ?? 0),
    suspicious: Number(suspicious[0]?.total ?? 0),
    todayCount: Number(todayStats[0]?.count ?? 0),
    todayVolume: Number(todayStats[0]?.volume ?? 0),
    byStatus: Object.fromEntries(byStatus.map((r: { status: unknown; count: unknown }) => [r.status as string, Number(r.count)])),
  };
}

// ─── Alerts (repository partagé avec le moteur AML) ──────────────────────────

export async function insertAlert(values: InsertAlert): Promise<Alert> {
  const [alert] = await db.insert(alerts).values(values).returning();
  if (!alert) throw new Error("Échec insertion alert");
  return alert;
}

export async function findAlertsByCustomer(customerId: number): Promise<Alert[]> {
  return db
    .select()
    .from(alerts)
    .where(eq(alerts.customerId, customerId))
    .orderBy(desc(alerts.createdAt));
}

export async function getAlertStats() {
  const [total, open, byPriority] = await Promise.all([
    db.select({ total: count() }).from(alerts),
    db.select({ total: count() }).from(alerts).where(eq(alerts.status, "OPEN")),
    db
      .select({ priority: alerts.priority, count: count() })
      .from(alerts)
      .where(eq(alerts.status, "OPEN"))
      .groupBy(alerts.priority),
  ]);

  return {
    total: Number(total[0]?.total ?? 0),
    open: Number(open[0]?.total ?? 0),
    byPriority: Object.fromEntries(byPriority.map((r: { priority: unknown; count: unknown }) => [r.priority as string, Number(r.count)])),
  };
}
