import { eq, desc } from "drizzle-orm";
import { db } from "../../_core/db";
import { documents, type Document, type InsertDocument } from "../../../drizzle/schema";

export async function insertDocument(values: InsertDocument): Promise<Document> {
  const [doc] = await db.insert(documents).values(values).returning();
  if (!doc) throw new Error("Erreur insertion document");
  return doc;
}

export async function findDocumentById(id: number): Promise<Document | null> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return doc ?? null;
}

export async function findDocumentsByCustomer(customerId: number): Promise<Document[]> {
  return db.select().from(documents)
    .where(eq(documents.customerId, customerId))
    .orderBy(desc(documents.createdAt));
}

export async function updateDocument(
  id: number,
  values: Partial<InsertDocument>,
): Promise<Document> {
  const [doc] = await db.update(documents)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(documents.id, id))
    .returning();
  if (!doc) throw new Error(`Document #${id} introuvable`);
  return doc;
}

export async function deleteDocument(id: number): Promise<void> {
  await db.delete(documents).where(eq(documents.id, id));
}

export async function getDocumentStats(customerId: number): Promise<{
  total: number;
  verified: number;
  pending: number;
  ekycPass: number;
  ekycFail: number;
}> {
  const docs = await findDocumentsByCustomer(customerId);
  return {
    total:    docs.length,
    verified: docs.filter(d => d.status === "VERIFIED").length,
    pending:  docs.filter(d => d.status === "PENDING").length,
    ekycPass: docs.filter(d => d.ekycStatus === "PASS").length,
    ekycFail: docs.filter(d => d.ekycStatus === "FAIL").length,
  };
}
