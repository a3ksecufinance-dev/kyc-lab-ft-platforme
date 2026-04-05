/**
 * Agents Service — MICROFINANCE / PAYMENT_INSTITUTION uniquement
 *
 * Actif uniquement si getInstitutionFlags().agentAccounts === true.
 * Gestion du réseau d'agents : CRUD, float, compteurs journaliers, risque.
 */

import { eq, and, desc, count, sum, gte, ilike, or } from "drizzle-orm";
import { db } from "../../_core/db";
import { agentAccounts, transactions } from "../../../drizzle/schema";
import { nanoid } from "nanoid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListAgentsInput {
  page:     number;
  limit:    number;
  region?:  string;
  isActive?: boolean;
  search?:  string;
  riskMin?: number;
}

export interface CreateAgentInput {
  name:          string;
  phone?:        string;
  region?:       string;
  city?:         string;
  licenseNumber?: string;
  currency?:     string;
  userId?:       number;
}

// ─── Requêtes ─────────────────────────────────────────────────────────────────

export async function listAgents(input: ListAgentsInput) {
  const offset = (input.page - 1) * input.limit;
  const conditions = [];

  if (input.region   !== undefined) conditions.push(eq(agentAccounts.region,   input.region));
  if (input.isActive !== undefined) conditions.push(eq(agentAccounts.isActive,  input.isActive));
  if (input.riskMin  !== undefined) conditions.push(gte(agentAccounts.riskScore, input.riskMin));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(
      ilike(agentAccounts.name,    term),
      ilike(agentAccounts.agentId, term),
      ilike(agentAccounts.phone ?? agentAccounts.name, term),
    )!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(agentAccounts)
      .where(where)
      .orderBy(desc(agentAccounts.riskScore), desc(agentAccounts.createdAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ total: count() }).from(agentAccounts).where(where),
  ]);

  return {
    data,
    total:      Number(countResult[0]?.total ?? 0),
    page:       input.page,
    limit:      input.limit,
    totalPages: Math.ceil(Number(countResult[0]?.total ?? 0) / input.limit),
  };
}

export async function getAgentById(id: number) {
  const [agent] = await db.select().from(agentAccounts).where(eq(agentAccounts.id, id)).limit(1);
  return agent ?? null;
}

export async function getAgentByAgentId(agentId: string) {
  const [agent] = await db.select().from(agentAccounts).where(eq(agentAccounts.agentId, agentId)).limit(1);
  return agent ?? null;
}

// ─── Création ─────────────────────────────────────────────────────────────────

export async function createAgent(input: CreateAgentInput) {
  const agentId = `AGT-${nanoid(8).toUpperCase()}`;

  const [agent] = await db.insert(agentAccounts).values({
    agentId,
    name:          input.name,
    phone:         input.phone         ?? null,
    region:        input.region        ?? null,
    city:          input.city          ?? null,
    licenseNumber: input.licenseNumber ?? null,
    currency:      input.currency      ?? "MAD",
    userId:        input.userId        ?? null,
    floatBalance:  "0",
    isActive:      true,
    riskScore:     0,
  }).returning();

  if (!agent) throw new Error("Échec création agent");
  return agent;
}

// ─── Gestion du float ─────────────────────────────────────────────────────────

export async function adjustFloat(agentId: number, delta: number) {
  const [current] = await db
    .select({ floatBalance: agentAccounts.floatBalance })
    .from(agentAccounts)
    .where(eq(agentAccounts.id, agentId))
    .limit(1);

  if (!current) throw new Error(`Agent ${agentId} introuvable`);

  const newBalance = Number(current.floatBalance) + delta;
  if (newBalance < 0) throw new Error("Float insuffisant");

  const [updated] = await db
    .update(agentAccounts)
    .set({ floatBalance: String(newBalance), updatedAt: new Date() })
    .where(eq(agentAccounts.id, agentId))
    .returning();

  return updated!;
}

// ─── Score de risque ──────────────────────────────────────────────────────────

export async function updateAgentRisk(agentId: number, riskScore: number, riskFlags?: unknown) {
  const [updated] = await db
    .update(agentAccounts)
    .set({
      riskScore:  Math.min(100, Math.max(0, riskScore)),
      riskFlags:  riskFlags as null ?? null,
      updatedAt:  new Date(),
    })
    .where(eq(agentAccounts.id, agentId))
    .returning();

  if (!updated) throw new Error(`Agent ${agentId} introuvable`);
  return updated;
}

// ─── Activation / désactivation ───────────────────────────────────────────────

export async function setAgentActive(agentId: number, isActive: boolean) {
  const [updated] = await db
    .update(agentAccounts)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(agentAccounts.id, agentId))
    .returning();

  if (!updated) throw new Error(`Agent ${agentId} introuvable`);
  return updated;
}

// ─── Statistiques ─────────────────────────────────────────────────────────────

export async function getAgentStats() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [total, active, highRisk, volume30d] = await Promise.all([
    db.select({ total: count() }).from(agentAccounts),
    db.select({ total: count() }).from(agentAccounts).where(eq(agentAccounts.isActive, true)),
    db.select({ total: count() }).from(agentAccounts).where(gte(agentAccounts.riskScore, 70)),
    db
      .select({ volume: sum(transactions.amount), txCount: count() })
      .from(transactions)
      .where(
        and(
          gte(transactions.transactionDate, thirtyDaysAgo),
        )
      ),
  ]);

  return {
    total:       Number(total[0]?.total     ?? 0),
    active:      Number(active[0]?.total    ?? 0),
    highRisk:    Number(highRisk[0]?.total  ?? 0),
    volume30d:   Number(volume30d[0]?.volume ?? 0),
    txCount30d:  Number(volume30d[0]?.txCount ?? 0),
  };
}

// ─── Activité récente par agent ───────────────────────────────────────────────

export async function getAgentActivity(agentInternalId: number, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const activity = await db
    .select({
      txCount: count(),
      volume:  sum(transactions.amount),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.agentId, agentInternalId),
        gte(transactions.transactionDate, since),
      )
    );

  return {
    agentId:  agentInternalId,
    days,
    txCount:  Number(activity[0]?.txCount ?? 0),
    volume:   Number(activity[0]?.volume  ?? 0),
  };
}
