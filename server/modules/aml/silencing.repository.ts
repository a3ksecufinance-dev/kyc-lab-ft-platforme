import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../../_core/db";
import { silencingRules } from "../../../drizzle/schema";

export async function getActiveSilencingRules() {
  const now = new Date();
  return db
    .select()
    .from(silencingRules)
    .where(
      and(
        eq(silencingRules.isActive, true),
        lte(silencingRules.validFrom, now),
        gte(silencingRules.validUntil, now)
      )
    );
}

export async function getAllSilencingRules(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const rows = await db
    .select()
    .from(silencingRules)
    .orderBy(silencingRules.createdAt)
    .limit(limit)
    .offset(offset);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(silencingRules);
  return { rows, total: row?.count ?? 0 };
}

export type AlertContext = {
  scenario?: string | undefined;
  alertType?: string | undefined;
  priority?: string | undefined;
  customerId?: number | undefined;
  ruleId?: string | undefined;
  riskScore?: number | undefined;
};

/** Check if an alert should be silenced based on active silencing rules */
export async function shouldSilenceAlert(ctx: AlertContext): Promise<{ silenced: boolean; ruleId?: number; ruleName?: string }> {
  const rules = await getActiveSilencingRules();

  for (const rule of rules) {
    // Check max matches
    if (rule.maxMatches && rule.matchCount >= rule.maxMatches) continue;

    const matchers = rule.matchers as Record<string, unknown>;
    let matches = true;

    for (const [key, value] of Object.entries(matchers)) {
      const ctxValue = ctx[key as keyof AlertContext];
      if (ctxValue === undefined) continue;

      if (typeof value === "string" && typeof ctxValue === "string") {
        // Support partial match for scenario (contains)
        if (key === "scenario") {
          if (!ctxValue.includes(value)) { matches = false; break; }
        } else {
          if (ctxValue !== value) { matches = false; break; }
        }
      } else if (typeof value === "number") {
        if (ctxValue !== value) { matches = false; break; }
      } else {
        if (String(ctxValue) !== String(value)) { matches = false; break; }
      }
    }

    if (matches) {
      // Increment match counter (fire and forget)
      db.update(silencingRules)
        .set({ matchCount: sql`${silencingRules.matchCount} + 1`, updatedAt: new Date() })
        .where(eq(silencingRules.id, rule.id))
        .catch(() => {});
      return { silenced: true, ruleId: rule.id, ruleName: rule.name };
    }
  }

  return { silenced: false };
}

export async function createSilencingRule(data: {
  name: string;
  description?: string;
  matchers: Record<string, unknown>;
  validFrom?: Date;
  validUntil: Date;
  maxMatches?: number;
  createdBy: number;
}) {
  const [rule] = await db.insert(silencingRules).values({
    name: data.name,
    description: data.description ?? null,
    matchers: data.matchers,
    validFrom: data.validFrom ?? new Date(),
    validUntil: data.validUntil,
    maxMatches: data.maxMatches ?? null,
    createdBy: data.createdBy,
  }).returning();
  return rule;
}

export async function revokeSilencingRule(id: number, revokedBy: number) {
  const [rule] = await db
    .update(silencingRules)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
      updatedAt: new Date(),
    })
    .where(eq(silencingRules.id, id))
    .returning();
  return rule;
}
