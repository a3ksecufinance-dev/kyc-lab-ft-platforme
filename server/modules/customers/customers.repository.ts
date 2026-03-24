import { eq, desc, like, and, or, count } from "drizzle-orm";
import { db } from "../../_core/db";
import {
  customers,
  documents,
  ubos,
  screeningResults,
  transactions,
  type Customer,
  type InsertCustomer,
} from "../../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListCustomersInput {
  page: number;
  limit: number;
  search?: string;
  riskLevel?: Customer["riskLevel"];
  kycStatus?: Customer["kycStatus"];
  country?: string;
  customerType?: Customer["customerType"];
}

export interface UpdateCustomerInput {
  kycStatus?: Customer["kycStatus"];
  riskLevel?: Customer["riskLevel"];
  riskScore?: number;
  pepStatus?: boolean;
  sanctionStatus?: Customer["sanctionStatus"];
  notes?: string;
  assignedAnalyst?: number | null;
  lastReviewDate?: Date;
  nextReviewDate?: Date;
}

// ─── Repository ───────────────────────────────────────────────────────────────

export async function findManyCustomers(input: ListCustomersInput) {
  const offset = (input.page - 1) * input.limit;

  const conditions = [];

  if (input.search) {
    conditions.push(
      or(
        like(customers.firstName, `%${input.search}%`),
        like(customers.lastName, `%${input.search}%`),
        like(customers.email, `%${input.search}%`),
        like(customers.customerId, `%${input.search}%`)
      )
    );
  }
  if (input.riskLevel)    conditions.push(eq(customers.riskLevel, input.riskLevel));
  if (input.kycStatus)    conditions.push(eq(customers.kycStatus, input.kycStatus));
  if (input.country)      conditions.push(eq(customers.residenceCountry, input.country));
  if (input.customerType) conditions.push(eq(customers.customerType, input.customerType));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt))
      .limit(input.limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(customers)
      .where(where),
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

export async function findCustomerById(id: number): Promise<Customer | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  return customer ?? null;
}

export async function findCustomerByCustomerId(customerId: string): Promise<Customer | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.customerId, customerId))
    .limit(1);
  return customer ?? null;
}

export async function insertCustomer(
  values: InsertCustomer
): Promise<Customer> {
  const [customer] = await db
    .insert(customers)
    .values(values)
    .returning();
  if (!customer) throw new Error("Échec insertion customer");
  return customer;
}

export async function updateCustomer(
  id: number,
  values: UpdateCustomerInput
): Promise<Customer> {
  const [updated] = await db
    .update(customers)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();
  if (!updated) throw new Error(`Customer ${id} introuvable`);
  return updated;
}

export async function getCustomerStats() {
  const [total, byRisk, byStatus, byType] = await Promise.all([
    db.select({ total: count() }).from(customers),
    db
      .select({ riskLevel: customers.riskLevel, count: count() })
      .from(customers)
      .groupBy(customers.riskLevel),
    db
      .select({ kycStatus: customers.kycStatus, count: count() })
      .from(customers)
      .groupBy(customers.kycStatus),
    db
      .select({ customerType: customers.customerType, count: count() })
      .from(customers)
      .groupBy(customers.customerType),
  ]);

  return {
    total: Number(total[0]?.total ?? 0),
    byRisk: Object.fromEntries(byRisk.map((r: { riskLevel: unknown; count: unknown }) => [r.riskLevel as string, Number(r.count)])),
    byStatus: Object.fromEntries(byStatus.map((r: { kycStatus: unknown; count: unknown }) => [r.kycStatus as string, Number(r.count)])),
    byType: Object.fromEntries(byType.map((r: { customerType: unknown; count: unknown }) => [r.customerType as string, Number(r.count)])),
  };
}

// ─── Relations ────────────────────────────────────────────────────────────────

export async function findDocumentsByCustomer(customerId: number) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.customerId, customerId))
    .orderBy(desc(documents.createdAt));
}

export async function findUBOsByCustomer(customerId: number) {
  return db
    .select()
    .from(ubos)
    .where(eq(ubos.customerId, customerId));
}

export async function findScreeningByCustomer(customerId: number) {
  return db
    .select()
    .from(screeningResults)
    .where(eq(screeningResults.customerId, customerId))
    .orderBy(desc(screeningResults.createdAt));
}

export async function findTransactionsByCustomer(
  customerId: number,
  limit?: number
) {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.customerId, customerId))
    .orderBy(desc(transactions.transactionDate))
    .limit(limit ?? 50);
}

export async function insertUBO(values: {
  customerId: number;
  firstName: string;
  lastName: string;
  nationality?: string;
  dateOfBirth?: string;
  ownershipPercentage?: string;
  role?: string;
  pepStatus: boolean;
}) {
  const [ubo] = await db.insert(ubos).values(values).returning();
  if (!ubo) throw new Error("Échec insertion UBO");
  return ubo;
}
