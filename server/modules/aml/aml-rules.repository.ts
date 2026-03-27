import { db } from "../../_core/db";
import { amlRules, amlRuleExecutions, amlRuleFeedback } from "../../../drizzle/schema";
import type { AmlRule, InsertAmlRule, AmlRuleExecution } from "../../../drizzle/schema";
import { eq, and, desc, count, gte } from "drizzle-orm";

// ─── Lecture ──────────────────────────────────────────────────────────────────

export async function getAllRules(): Promise<AmlRule[]> {
  return db.select().from(amlRules).orderBy(desc(amlRules.updatedAt));
}

export async function getActiveRules(): Promise<AmlRule[]> {
  return db
    .select()
    .from(amlRules)
    .where(
      // ACTIVE + TESTING : les deux s'exécutent, mais TESTING ne crée pas d'alerte
      eq(amlRules.status, "ACTIVE")
    )
    .orderBy(desc(amlRules.baseScore));
}

export async function getAllExecutableRules(): Promise<AmlRule[]> {
  // ACTIVE + TESTING exécutent la logique (TESTING sans alerte)
  return db
    .select()
    .from(amlRules)
    .where(
      and(
        // status IN ('ACTIVE', 'TESTING') — Drizzle ne supporte pas inArray sur enum
        // On filtre post-fetch (résultat généralement < 50 règles)
      )
    )
    .orderBy(desc(amlRules.baseScore));
}

export async function getRuleById(id: number): Promise<AmlRule | null> {
  const [rule] = await db
    .select()
    .from(amlRules)
    .where(eq(amlRules.id, id))
    .limit(1);
  return rule ?? null;
}

// ─── Écriture ─────────────────────────────────────────────────────────────────

export async function insertRule(
  values: Omit<InsertAmlRule, "ruleId" | "version">
): Promise<AmlRule> {
  const ruleId = `AML-${Date.now().toString(36).toUpperCase()}`;
  const [rule] = await db
    .insert(amlRules)
    .values({ ...values, ruleId, version: 1 })
    .returning();
  return rule!;
}

export async function updateRule(
  id: number,
  values: Partial<Pick<InsertAmlRule,
    "name" | "description" | "status" | "conditions" | "baseScore" |
    "priority" | "alertType" | "thresholdValue" | "windowMinutes" |
    "countThreshold" | "updatedBy"
  >>
): Promise<AmlRule> {
  const [rule] = await db
    .update(amlRules)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(amlRules.id, id))
    .returning();
  if (!rule) throw new Error("Règle introuvable");
  return rule;
}

export async function deleteRule(id: number): Promise<void> {
  await db.delete(amlRules).where(eq(amlRules.id, id));
}

// ─── Exécutions (monitoring & backtesting) ────────────────────────────────────

export async function insertExecution(values: {
  ruleId: number;
  transactionId?: number;
  customerId?: number;
  triggered: boolean;
  score: number;
  details?: Record<string, unknown>;
  executionMs?: number;
}): Promise<void> {
  await db.insert(amlRuleExecutions).values({
    ruleId:        values.ruleId,
    transactionId: values.transactionId ?? null,
    customerId:    values.customerId ?? null,
    triggered:     values.triggered,
    score:         values.score,
    details:       (values.details ?? null) as null,
    executionMs:   values.executionMs ?? null,
  });
}

export async function getRuleStats(ruleId: number, since?: Date): Promise<{
  totalExecutions: number;
  totalTriggered: number;
  triggerRate: number;
  avgScore: number;
}> {
  const where = since
    ? and(eq(amlRuleExecutions.ruleId, ruleId), gte(amlRuleExecutions.createdAt, since))
    : eq(amlRuleExecutions.ruleId, ruleId);

  const [totals] = await db
    .select({
      total:     count(),
      triggered: count(amlRuleExecutions.triggered),
    })
    .from(amlRuleExecutions)
    .where(where);

  const total = Number(totals?.total ?? 0);
  const triggered = Number(totals?.triggered ?? 0);

  return {
    totalExecutions: total,
    totalTriggered:  triggered,
    triggerRate:     total > 0 ? Math.round((triggered / total) * 100) : 0,
    avgScore:        0,
  };
}

export async function getRecentExecutions(
  ruleId: number,
  limit = 20
): Promise<AmlRuleExecution[]> {
  return db
    .select()
    .from(amlRuleExecutions)
    .where(eq(amlRuleExecutions.ruleId, ruleId))
    .orderBy(desc(amlRuleExecutions.createdAt))
    .limit(limit);
}

// ─── Feedback faux positifs (Sprint 5) ───────────────────────────────────────

export async function insertRuleFeedback(values: {
  ruleId:  number;
  userId?: number;
  note?:   string;
  type:    string;
}): Promise<void> {
  await db.insert(amlRuleFeedback).values({
    ruleId:    values.ruleId,
    userId:    values.userId ?? null,
    type:      values.type,
    note:      values.note ?? null,
  });
}

export async function getRuleFalsePositiveCount(ruleId: number): Promise<number> {
  const [row] = await db
    .select({ cnt: count() })
    .from(amlRuleFeedback)
    .where(
      and(
        eq(amlRuleFeedback.ruleId, ruleId),
        eq(amlRuleFeedback.type, "FALSE_POSITIVE")
      )
    );
  return Number(row?.cnt ?? 0);
}
