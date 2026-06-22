import { eq, and, or, isNull, gte, sql } from "drizzle-orm";
import { db } from "../../_core/db";
import { goodGuysList } from "../../../drizzle/schema";

export async function getActiveGoodGuys(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const rows = await db
    .select()
    .from(goodGuysList)
    .where(eq(goodGuysList.isActive, true))
    .orderBy(goodGuysList.createdAt)
    .limit(limit)
    .offset(offset);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(goodGuysList)
    .where(eq(goodGuysList.isActive, true));
  return { rows, total: row?.count ?? 0 };
}

export async function getAllGoodGuys(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const rows = await db
    .select()
    .from(goodGuysList)
    .orderBy(goodGuysList.createdAt)
    .limit(limit)
    .offset(offset);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(goodGuysList);
  return { rows, total: row?.count ?? 0 };
}

/** Check if a customer is on the active Good Guys list */
export async function isCustomerExcluded(customerId: number): Promise<boolean> {
  const now = new Date();
  const [entry] = await db
    .select({ id: goodGuysList.id })
    .from(goodGuysList)
    .where(
      and(
        eq(goodGuysList.customerId, customerId),
        eq(goodGuysList.isActive, true),
        or(
          isNull(goodGuysList.validUntil),
          gte(goodGuysList.validUntil, now)
        )
      )
    )
    .limit(1);
  return !!entry;
}

export async function addToGoodGuys(data: {
  customerId: number;
  reason: string;
  category?: string;
  validUntil?: Date | null;
  addedBy: number;
}) {
  const [entry] = await db.insert(goodGuysList).values({
    customerId: data.customerId,
    reason: data.reason,
    category: data.category ?? "TRUSTED",
    validUntil: data.validUntil ?? null,
    addedBy: data.addedBy,
  }).returning();
  return entry;
}

export async function revokeGoodGuys(id: number, revokedBy: number, reason: string) {
  const [entry] = await db
    .update(goodGuysList)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
      revokeReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(goodGuysList.id, id))
    .returning();
  return entry;
}
