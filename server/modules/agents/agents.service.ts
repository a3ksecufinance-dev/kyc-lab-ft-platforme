/**
 * Agents Service — MICROFINANCE / PAYMENT_INSTITUTION uniquement
 *
 * Actif uniquement si getInstitutionFlags().agentAccounts === true.
 * Gestion du réseau d'agents : CRUD, float, compteurs journaliers, risque.
 */

import { eq, and, desc, count, sum, gte, ilike, or, lt, inArray } from "drizzle-orm";
import { db } from "../../_core/db";
import { agentAccounts, transactions, alerts } from "../../../drizzle/schema";
import { nanoid } from "nanoid";
import { createLogger } from "../../_core/logger";

const log = createLogger("agents");

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

// ─── Scoring risque agent automatique (Phase E) ──────────────────────────────

/**
 * Calcule le score de risque d'un agent (0-100) sur 5 facteurs pondérés :
 *
 * | # | Facteur                        | Points max |
 * |---|--------------------------------|-----------|
 * | 1 | Volume anormal vs baseline 30j | +25       |
 * | 2 | Ratio cash-in/out déséquilibré | +20       |
 * | 3 | Transactions smurfing (<5000)  | +25       |
 * | 4 | Alertes AGENT_MULE ouvertes    | +15       |
 * | 5 | Dormance / réactivation        | +15       |
 */
export interface AgentRiskFactors {
  volumeAnomaly:   { ratio: number; points: number };
  cashInOutRatio:  { cashIn: number; cashOut: number; ratio: number; points: number };
  smurfing:        { smallTxCount: number; totalTxCount: number; pct: number; points: number };
  muleAlerts:      { openCount: number; points: number };
  dormancy:        { daysSinceLastActivity: number | null; points: number };
}

function riskLevelFromScore(score: number): string {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export async function calculateAgentRisk(agentId: number) {
  const [agent] = await db.select().from(agentAccounts).where(eq(agentAccounts.id, agentId)).limit(1);
  if (!agent) throw new Error(`Agent ${agentId} introuvable`);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  // ── Factor 1: Volume anomaly (7d vs 30d baseline) — max 25 pts
  const [vol7d] = await db
    .select({ vol: sum(transactions.amount), cnt: count() })
    .from(transactions)
    .where(and(eq(transactions.agentId, agentId), gte(transactions.transactionDate, sevenDaysAgo)));

  const [vol30d] = await db
    .select({ vol: sum(transactions.amount), cnt: count() })
    .from(transactions)
    .where(and(eq(transactions.agentId, agentId), gte(transactions.transactionDate, thirtyDaysAgo)));

  const weeklyVol = Number(vol7d?.vol ?? 0);
  const monthlyVol = Number(vol30d?.vol ?? 0);
  const expectedWeeklyVol = monthlyVol > 0 ? monthlyVol / 4.3 : 0;
  const volRatio = expectedWeeklyVol > 0 ? weeklyVol / expectedWeeklyVol : 0;
  let volPoints = 0;
  if (volRatio >= 5) volPoints = 25;
  else if (volRatio >= 3) volPoints = 18;
  else if (volRatio >= 2) volPoints = 10;
  else if (volRatio >= 1.5) volPoints = 5;

  // ── Factor 2: Cash-in/out ratio imbalance — max 20 pts
  const [cashIn] = await db
    .select({ cnt: count() })
    .from(transactions)
    .where(and(
      eq(transactions.agentId, agentId),
      eq(transactions.transactionType, "AGENT_CASH_IN"),
      gte(transactions.transactionDate, thirtyDaysAgo),
    ));
  const [cashOut] = await db
    .select({ cnt: count() })
    .from(transactions)
    .where(and(
      eq(transactions.agentId, agentId),
      eq(transactions.transactionType, "AGENT_CASH_OUT"),
      gte(transactions.transactionDate, thirtyDaysAgo),
    ));

  const ciCount = Number(cashIn?.cnt ?? 0);
  const coCount = Number(cashOut?.cnt ?? 0);
  const totalCiCo = ciCount + coCount;
  const ciCoRatio = totalCiCo > 0 ? Math.max(ciCount, coCount) / totalCiCo : 0;
  let ciCoPoints = 0;
  if (totalCiCo >= 10) {
    if (ciCoRatio >= 0.95) ciCoPoints = 20;
    else if (ciCoRatio >= 0.90) ciCoPoints = 15;
    else if (ciCoRatio >= 0.80) ciCoPoints = 8;
  }

  // ── Factor 3: Smurfing — tx < 5000 MAD proportion — max 25 pts
  const totalTx30d = Number(vol30d?.cnt ?? 0);
  const [smallTx] = await db
    .select({ cnt: count() })
    .from(transactions)
    .where(and(
      eq(transactions.agentId, agentId),
      gte(transactions.transactionDate, thirtyDaysAgo),
      lt(transactions.amount, "5000"),
      inArray(transactions.transactionType, ["AGENT_CASH_IN", "AGENT_CASH_OUT"]),
    ));
  const smallCount = Number(smallTx?.cnt ?? 0);
  const smurfPct = totalTx30d > 0 ? (smallCount / totalTx30d) * 100 : 0;
  let smurfPoints = 0;
  if (totalTx30d >= 20 && smurfPct >= 90) smurfPoints = 25;
  else if (totalTx30d >= 15 && smurfPct >= 80) smurfPoints = 18;
  else if (totalTx30d >= 10 && smurfPct >= 70) smurfPoints = 10;

  // ── Factor 4: Open AGENT_MULE alerts — max 15 pts
  const [muleAlerts] = await db
    .select({ cnt: count() })
    .from(alerts)
    .where(and(
      eq(alerts.alertType, "AGENT_MULE"),
      inArray(alerts.status, ["OPEN", "IN_REVIEW"]),
    ));
  const muleCount = Number(muleAlerts?.cnt ?? 0);
  const mulePoints = Math.min(muleCount * 8, 15);

  // ── Factor 5: Dormancy / reactivation — max 15 pts
  let dormancyPoints = 0;
  let daysSinceActivity: number | null = null;
  if (agent.lastActivityAt) {
    daysSinceActivity = Math.floor((now.getTime() - agent.lastActivityAt.getTime()) / 86_400_000);
    if (agent.reactivatedAt) {
      const daysSinceReactivation = Math.floor((now.getTime() - agent.reactivatedAt.getTime()) / 86_400_000);
      if (daysSinceReactivation < 7) dormancyPoints = 15;
      else if (daysSinceReactivation < 30) dormancyPoints = 8;
    } else if (daysSinceActivity > 90) {
      dormancyPoints = 5;
    }
  }

  const score = Math.min(100, volPoints + ciCoPoints + smurfPoints + mulePoints + dormancyPoints);
  const level = riskLevelFromScore(score);

  const factors: AgentRiskFactors = {
    volumeAnomaly:  { ratio: Math.round(volRatio * 100) / 100, points: volPoints },
    cashInOutRatio: { cashIn: ciCount, cashOut: coCount, ratio: Math.round(ciCoRatio * 100) / 100, points: ciCoPoints },
    smurfing:       { smallTxCount: smallCount, totalTxCount: totalTx30d, pct: Math.round(smurfPct), points: smurfPoints },
    muleAlerts:     { openCount: muleCount, points: mulePoints },
    dormancy:       { daysSinceLastActivity: daysSinceActivity, points: dormancyPoints },
  };

  // Persist
  await db
    .update(agentAccounts)
    .set({ riskScore: score, riskFlags: factors, updatedAt: now })
    .where(eq(agentAccounts.id, agentId));

  return { agentId, score, level, factors, agent: { ...agent, riskScore: score, riskFlags: factors } };
}

export async function recalculateAllAgentRisks() {
  const activeAgents = await db
    .select({ id: agentAccounts.id })
    .from(agentAccounts)
    .where(eq(agentAccounts.isActive, true));

  let updated = 0;
  let errors = 0;

  for (const a of activeAgents) {
    try {
      await calculateAgentRisk(a.id);
      updated++;
    } catch (err) {
      errors++;
      log.error({ err, agentId: a.id }, "Erreur calcul risque agent");
    }
  }

  log.info({ total: activeAgents.length, updated, errors }, "Recalcul risque agents terminé");
  return { total: activeAgents.length, updated, errors };
}

// ─── Daily counters update (Phase E) ─────────────────────────────────────────

export async function updateDailyCounters(agentId: number) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({ cnt: count(), vol: sum(transactions.amount) })
    .from(transactions)
    .where(and(
      eq(transactions.agentId, agentId),
      gte(transactions.transactionDate, startOfDay),
    ));

  await db
    .update(agentAccounts)
    .set({
      dailyTxCount:  Number(result?.cnt ?? 0),
      dailyTxVolume: String(Number(result?.vol ?? 0)),
      lastActivityAt: new Date(),
      updatedAt:     new Date(),
    })
    .where(eq(agentAccounts.id, agentId));
}
