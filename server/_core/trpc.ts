import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { hasPermission, type Permission } from "../../shared/permissions";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Ne pas exposer les stack traces en production
        stack: process.env["NODE_ENV"] === "development" ? error.stack : undefined,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// ─── Middleware d'authentification ────────────────────────────────────────────

const requireAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentification requise",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// ─── Middleware RBAC ──────────────────────────────────────────────────────────

const ROLE_HIERARCHY = {
  analyst: 1,
  supervisor: 2,
  compliance_officer: 3,
  admin: 4,
  user: 0,
} as const;

type Role = keyof typeof ROLE_HIERARCHY;

function requireRole(minRole: Role) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise" });
    }

    const userLevel = ROLE_HIERARCHY[ctx.user.role as Role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (userLevel < requiredLevel) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Rôle insuffisant. Requis : ${minRole} (niveau ${requiredLevel}), vous avez : ${ctx.user.role} (niveau ${userLevel})`,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

// ─── Procedures exportées ─────────────────────────────────────────────────────

/**
 * Procédure publique — accessible sans authentification
 * Utilisation : login, register, health check
 */
export const publicProc = t.procedure;

/**
 * Procédure protégée — authentification requise (n'importe quel rôle)
 */
export const protectedProc = t.procedure.use(requireAuth);

/**
 * Procédure analyst — rôle minimum : analyst
 * Utilisation : consultation, création de clients, alertes, cas
 */
export const analystProc = t.procedure.use(requireRole("analyst"));

/**
 * Procédure supervisor — rôle minimum : supervisor
 * Utilisation : escalade, approbation intermédiaire, fermeture de cas
 */
export const supervisorProc = t.procedure.use(requireRole("supervisor"));

/**
 * Procédure compliance — rôle minimum : compliance_officer
 * Utilisation : soumission SAR/STR, approbation finale, exports réglementaires
 */
export const complianceProc = t.procedure.use(requireRole("compliance_officer"));

/**
 * Procédure admin — rôle admin uniquement
 * Utilisation : gestion des utilisateurs, logs d'audit, configuration système
 */
export const adminProc = t.procedure.use(requireRole("admin"));

// ─── Middleware MFA step-up ──────────────────────────────────────────────────

/**
 * Middleware requiring recent MFA verification for sensitive operations.
 * Checks that the user has verified MFA within the last 10 minutes.
 * The timestamp is stored in Redis as `mfa_verified:<userId>`.
 */
function requireRecentMfa() {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise" });
    }

    const { redis } = await import("./redis");
    const key = `mfa_verified:${ctx.user.id}`;
    const verified = await redis.get(key);

    if (!verified) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Vérification MFA requise pour cette opération. Veuillez confirmer votre code MFA.",
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/**
 * Procédure admin sensible — admin + MFA récent requis
 * Utilisation : reset MFA, reset password, création utilisateur, modification rôle
 */
export const adminMfaProc = t.procedure.use(requireRole("admin")).use(requireRecentMfa());

/**
 * Procédure avec permission granulaire
 * Usage : permissionProc("reports:transmit"), permissionProc("customers:export")
 */
export function permissionProc(permission: Permission) {
  return t.procedure.use(t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise" });
    }
    if (!hasPermission(ctx.user.role, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission requise : ${permission}`,
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }));
}
