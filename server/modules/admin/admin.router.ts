import { z } from "zod";
import { router, adminProc, supervisorProc } from "../../_core/trpc";
import { db } from "../../_core/db";
import { users, auditLogs } from "../../../drizzle/schema";
import { eq, desc, ilike, and, gte, count, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createAuditFromContext } from "../../_core/audit";
import { forceMlRetrain, getMlRetrainStatus } from "../aml/ml-retrain.scheduler";

// ─── Router ───────────────────────────────────────────────────────────────────

export const adminRouter = router({

  // ── Utilisateurs ────────────────────────────────────────────────────────────

  listUsers: adminProc
    .input(z.object({
      page:   z.number().int().min(1).default(1),
      limit:  z.number().int().min(1).max(100).default(20),
      search: z.string().optional(),
      role:   z.enum(["user", "analyst", "supervisor", "compliance_officer", "admin"]).optional(),
      active: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.search) {
        conditions.push(or(
          ilike(users.email, `%${input.search}%`),
          ilike(users.name,  `%${input.search}%`),
        ));
      }
      if (input.role)   conditions.push(eq(users.role,     input.role));
      if (input.active !== undefined) conditions.push(eq(users.isActive, input.active));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, totalRows] = await Promise.all([
        db.select({
          id:           users.id,
          email:        users.email,
          name:         users.name,
          role:         users.role,
          department:   users.department,
          isActive:     users.isActive,
          lastSignedIn: users.lastSignedIn,
          createdAt:    users.createdAt,
        })
          .from(users)
          .where(where)
          .orderBy(desc(users.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ total: count() }).from(users).where(where),
      ]);

      return { data: rows, total: Number(totalRows[0]?.total ?? 0), page: input.page, limit: input.limit };
    }),

  getUser: adminProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [user] = await db
        .select({ id: users.id, email: users.email, name: users.name, role: users.role, department: users.department, isActive: users.isActive, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);
      if (!user) throw new Error("Utilisateur introuvable");
      return user;
    }),

  createUser: adminProc
    .input(z.object({
      email:      z.string().email(),
      name:       z.string().min(2).max(200),
      password:   z.string().min(8),
      role:       z.enum(["user", "analyst", "supervisor", "compliance_officer", "admin"]),
      department: z.string().max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const passwordHash = await bcrypt.hash(input.password, 12);

      const [user] = await db.insert(users).values({
        email:        input.email,
        name:         input.name,
        passwordHash,
        role:         input.role,
        ...(input.department ? { department: input.department } : {}),
        isActive:     true,
      }).returning({
        id: users.id, email: users.email, name: users.name, role: users.role,
      });

      await log({ action: "USER_ROLE_CHANGED", entityType: "user", entityId: String(user!.id),
        details: { email: input.email, role: input.role, action: "created" } });

      return user;
    }),

  updateUser: adminProc
    .input(z.object({
      id:         z.number().int().positive(),
      name:       z.string().min(2).max(200).optional(),
      role:       z.enum(["user", "analyst", "supervisor", "compliance_officer", "admin"]).optional(),
      department: z.string().max(100).optional(),
      isActive:   z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const { id, ...updates } = input;

      const patch: Partial<typeof updates> = {};
      if (updates.name       !== undefined) patch.name       = updates.name;
      if (updates.role       !== undefined) patch.role       = updates.role;
      if (updates.department !== undefined) patch.department = updates.department;
      if (updates.isActive   !== undefined) patch.isActive   = updates.isActive;

      const [updated] = await db.update(users).set({ ...patch, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive });

      if (!updated) throw new Error("Utilisateur introuvable");

      const auditAction = patch.isActive === false ? "USER_DEACTIVATED"
        : patch.role ? "USER_ROLE_CHANGED"
        : "USER_ROLE_CHANGED";

      await log({ action: auditAction, entityType: "user", entityId: String(id), details: patch });
      return updated;
    }),

  resetPassword: adminProc
    .input(z.object({
      id:          z.number().int().positive(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const passwordHash = await bcrypt.hash(input.newPassword, 12);

      await db.update(users).set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, input.id));

      await log({ action: "AUTH_PASSWORD_CHANGED", entityType: "user", entityId: String(input.id),
        details: { action: "admin_reset" } });

      return { success: true };
    }),

  // ── Logs d'audit ────────────────────────────────────────────────────────────

  listAuditLogs: supervisorProc
    .input(z.object({
      page:       z.number().int().min(1).default(1),
      limit:      z.number().int().min(1).max(100).default(50),
      userId:     z.number().int().positive().optional(),
      entityType: z.string().optional(),
      action:     z.string().optional(),
      since:      z.string().datetime().optional(),
    }))
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.limit;
      const conditions = [];

      if (input.userId)     conditions.push(eq(auditLogs.userId, input.userId));
      if (input.entityType) conditions.push(eq(auditLogs.entityType, input.entityType));
      if (input.action)     conditions.push(ilike(auditLogs.action, `%${input.action}%`));
      if (input.since)      conditions.push(gte(auditLogs.createdAt, new Date(input.since)));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, totalRows] = await Promise.all([
        db.select({
          id:         auditLogs.id,
          userId:     auditLogs.userId,
          action:     auditLogs.action,
          entityType: auditLogs.entityType,
          entityId:   auditLogs.entityId,
          details:    auditLogs.details,
          ipAddress:  auditLogs.ipAddress,
          createdAt:  auditLogs.createdAt,
        })
          .from(auditLogs)
          .where(where)
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ total: count() }).from(auditLogs).where(where),
      ]);

      return { data: rows, total: Number(totalRows[0]?.total ?? 0), page: input.page, limit: input.limit };
    }),

  auditStats: supervisorProc
    .query(async () => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const since7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);

      const [total, last24h, last7d, byEntity] = await Promise.all([
        db.select({ total: count() }).from(auditLogs),
        db.select({ total: count() }).from(auditLogs).where(gte(auditLogs.createdAt, since24h)),
        db.select({ total: count() }).from(auditLogs).where(gte(auditLogs.createdAt, since7d)),
        db.select({ entityType: auditLogs.entityType, total: count() })
          .from(auditLogs)
          .groupBy(auditLogs.entityType),
      ]);

      return {
        total:   Number(total[0]?.total ?? 0),
        last24h: Number(last24h[0]?.total ?? 0),
        last7d:  Number(last7d[0]?.total ?? 0),
        byEntity: Object.fromEntries(byEntity.map((r: { entityType: string; total: unknown }) => [r.entityType, Number(r.total)])),
      };
    }),

  // ── ML Retraining ────────────────────────────────────────────────────────────

  mlRetrainStatus: adminProc
    .query(() => getMlRetrainStatus()),

  mlRetrain: adminProc
    .input(z.object({
      force: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);

      try {
        const result = await forceMlRetrain();

        await log({
          action:     "ML_RETRAIN_TRIGGERED",
          entityType: "system",
          entityId:   "ml_scoring",
          details:    { trigger: "manual", force: input.force, status: result.status, message: result.message },
        });

        return { success: true, ...result };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await log({
          action:     "ML_RETRAIN_TRIGGERED",
          entityType: "system",
          entityId:   "ml_scoring",
          details:    { trigger: "manual", force: input.force, status: "error", error: message },
        });
        throw new Error(`Réentraînement ML échoué : ${message}`, { cause: err });
      }
    }),
});
