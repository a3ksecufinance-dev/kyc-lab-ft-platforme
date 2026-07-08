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
import { encryptPii, decryptPii, piiEncryptionEnabled } from "../../_core/pii";

// ─── Champs PII chiffrés au repos ─────────────────────────────────────────────
// firstName/lastName/email restent en clair (nécessaires pour la recherche LIKE)
// phone/dateOfBirth/address/nationality chiffrés (pas de recherche LIKE dessus)
const PII_FIELDS_ENCRYPTED = ["phone", "dateOfBirth", "address"] as const;
type PiiField = (typeof PII_FIELDS_ENCRYPTED)[number];

function encryptCustomerPii<T extends Partial<Record<PiiField, string | null | undefined>>>(data: T): T {
  if (!piiEncryptionEnabled()) return data;
  const result = { ...data };
  for (const field of PII_FIELDS_ENCRYPTED) {
    if (field in result) {
      const val = result[field];
      if (typeof val === "string") (result as Record<string, unknown>)[field] = encryptPii(val);
    }
  }
  return result;
}

function decryptCustomerPii(customer: Customer): Customer {
  if (!piiEncryptionEnabled()) return customer;
  return {
    ...customer,
    phone:       decryptPii(customer.phone       ?? undefined) || customer.phone,
    dateOfBirth: decryptPii(customer.dateOfBirth ?? undefined) || customer.dateOfBirth,
    address:     decryptPii(customer.address     ?? undefined) || customer.address,
  };
}

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
  notes?: string | null;
  assignedAnalyst?: number | null;
  lastReviewDate?: Date;
  nextReviewDate?: Date;
  // PII fields (for erasure)
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  city?: string | null;
  profession?: string | null;
  employer?: string | null;
  sourceOfFunds?: string | null;
  // Asset freeze
  frozenAt?: Date | null;
  frozenReason?: string | null;
  frozenBy?: number | null;
  // RGPD erasure
  erasureRequestedAt?: Date | null;
  erasureRequestedBy?: number | null;
  erasureCompletedAt?: Date | null;
  erasureCompletedBy?: number | null;
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
    data: data.map(decryptCustomerPii),
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
  return customer ? decryptCustomerPii(customer) : null;
}

/** Throws TRPCError NOT_FOUND if the customer does not exist — use before FK-constrained inserts */
export async function requireCustomer(id: number): Promise<Customer> {
  const customer = await findCustomerById(id);
  if (!customer) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({ code: "NOT_FOUND", message: `Client #${id} introuvable` });
  }
  return customer;
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
  const encrypted = encryptCustomerPii(values as Record<string, unknown>) as InsertCustomer;
  const [customer] = await db
    .insert(customers)
    .values(encrypted)
    .returning();
  if (!customer) throw new Error("Échec insertion customer");
  return decryptCustomerPii(customer);
}

export async function updateCustomer(
  id: number,
  values: UpdateCustomerInput
): Promise<Customer> {
  const encrypted = encryptCustomerPii(values);
  const [updated] = await db
    .update(customers)
    .set({ ...encrypted, updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();
  if (!updated) throw new Error(`Customer ${id} introuvable`);
  return decryptCustomerPii(updated);
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

export async function deleteUBO(uboId: number, customerId: number): Promise<boolean> {
  const rows = await db.delete(ubos)
    .where(and(eq(ubos.id, uboId), eq(ubos.customerId, customerId)))
    .returning({ id: ubos.id });
  return rows.length > 0;
}
