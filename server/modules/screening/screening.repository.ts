import { eq, desc } from "drizzle-orm";
import { db } from "../../_core/db";
import { screeningResults, type InsertScreeningResult } from "../../../drizzle/schema";

export async function insertScreeningResult(values: InsertScreeningResult) {
  const [result] = await db.insert(screeningResults).values(values).returning();
  if (!result) throw new Error("Échec insertion screening result");
  return result;
}

export async function findScreeningByCustomer(customerId: number) {
  return db
    .select()
    .from(screeningResults)
    .where(eq(screeningResults.customerId, customerId))
    .orderBy(desc(screeningResults.createdAt));
}

export async function findScreeningById(id: number) {
  const [result] = await db
    .select()
    .from(screeningResults)
    .where(eq(screeningResults.id, id))
    .limit(1);
  return result ?? null;
}

export async function updateScreeningDecision(
  id: number,
  decision: "CONFIRMED" | "DISMISSED" | "ESCALATED",
  reviewedBy: number,
  decisionReason: string
) {
  const [updated] = await db
    .update(screeningResults)
    .set({
      decision,
      reviewedBy,
      reviewedAt: new Date(),
      decisionReason,
      status: decision === "CONFIRMED" ? "MATCH" : "CLEAR",
    })
    .where(eq(screeningResults.id, id))
    .returning();
  if (!updated) throw new Error(`Screening result ${id} introuvable`);
  return updated;
}

export async function getPendingScreenings() {
  return db
    .select()
    .from(screeningResults)
    .where(eq(screeningResults.status, "PENDING"))
    .orderBy(desc(screeningResults.createdAt));
}
