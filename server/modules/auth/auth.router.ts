import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProc, protectedProc } from "../../_core/trpc";
import { audit } from "../../_core/audit";
import { redis } from "../../_core/redis";
import {
  loginUser,
  loginAfterMfa,
  registerUser,
  refreshTokens,
  logoutUser,
  changePassword,
} from "./auth.service";
import {
  generateMfaSetup, confirmMfaSetup, verifyMfaLogin,
  disableMfa, regenerateBackupCodes,
} from "./auth.mfa";
import { requestPasswordReset, confirmPasswordReset } from "./auth.reset";

export const authRouter = router({
  /**
   * Connexion — retourne access + refresh tokens
   */
  login: publicProc
    .input(
      z.object({
        email: z.string().email("Email invalide"),
        password: z.string().min(1, "Mot de passe requis"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // ── Rate limiting par email : max 10 tentatives / 15 min ─────────────
      const attemptKey = `login:attempts:${input.email.toLowerCase()}`;
      const attempts   = await redis.incr(attemptKey).catch(() => 0);
      if (attempts === 1) await redis.expire(attemptKey, 900).catch(() => null);
      if (attempts > 10) {
        throw new TRPCError({
          code:    "TOO_MANY_REQUESTS",
          message: "Trop de tentatives de connexion — réessayez dans 15 minutes",
        });
      }

      try {
        const result = await loginUser(input);

        // Succès → réinitialiser le compteur
        await redis.del(attemptKey).catch(() => null);

        if (result.mfaRequired) {
          return { mfaRequired: true as const, userId: result.userId, user: null, tokens: null };
        }

        const { user, tokens } = result;

        await audit({
          userId: user.id,
          action: "AUTH_LOGIN",
          entityType: "user",
          entityId: user.id,
          ipAddress: ctx.req.ip ?? null,
          userAgent: ctx.req.headers["user-agent"] ?? null,
          details: { email: user.email, role: user.role },
        });

        return {
          mfaRequired: false as const,
          userId:      null,
          user: {
            id:    user.id,
            email: user.email,
            name:  user.name,
            role:  user.role,
          },
          tokens,
        };
      } catch (err) {
        await audit({
          action: "AUTH_LOGIN_FAILED",
          entityType: "user",
          ipAddress: ctx.req.ip ?? null,
          details: { email: input.email },
        });
        throw err;
      }
    }),

  /**
   * Finaliser le login après code MFA valide — publicProc (pas encore authentifié)
   */
  mfaLoginComplete: publicProc
    .input(z.object({
      userId: z.number().int().positive(),
      code:   z.string().min(6).max(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const { valid, usedBackup } = await verifyMfaLogin(input.userId, input.code);

      if (!valid) {
        await audit({
          action: "AUTH_MFA_VERIFY_FAILED",
          entityType: "user",
          entityId: String(input.userId),
          ipAddress: ctx.req.ip ?? null,
          details: { userId: input.userId },
        });
        throw new Error("Code MFA invalide");
      }

      const { user, tokens } = await loginAfterMfa(input.userId);

      await audit({
        userId:     user.id,
        action:     "AUTH_LOGIN",
        entityType: "user",
        entityId:   String(user.id),
        ipAddress:  ctx.req.ip ?? null,
        details: { email: user.email, mfa: true, usedBackup },
      });

      return {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        tokens,
      };
    }),
  register: publicProc
    .input(
      z.object({
        email: z.string().email("Email invalide"),
        password: z
          .string()
          .min(8, "Minimum 8 caractères")
          .regex(/[A-Z]/, "Doit contenir une majuscule")
          .regex(/[0-9]/, "Doit contenir un chiffre"),
        name: z.string().min(2, "Nom trop court").max(200),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await registerUser(input);

      await audit({
        userId: user.id,
        action: "AUTH_LOGIN",
        entityType: "user",
        entityId: user.id,
        ipAddress: ctx.req.ip ?? null,
        details: { email: user.email },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
    }),

  /**
   * Renouveler les tokens
   */
  refresh: publicProc
    .input(z.object({ refreshToken: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return refreshTokens(input.refreshToken);
    }),

  /**
   * Déconnexion
   */
  logout: protectedProc.mutation(async ({ ctx }) => {
    await logoutUser(ctx.user.id);

    await audit({
      userId: ctx.user.id,
      action: "AUTH_LOGOUT",
      entityType: "user",
      entityId: ctx.user.id,
      ipAddress: ctx.req.ip ?? null,
    });

    return { success: true };
  }),

  /**
   * Profil de l'utilisateur connecté
   */
  me: protectedProc.query(({ ctx }) => ({
    id: ctx.user.id,
    email: ctx.user.email,
    name: ctx.user.name,
    role: ctx.user.role,
    department: ctx.user.department,
    lastSignedIn: ctx.user.lastSignedIn,
  })),

  /**
   * Changer le mot de passe
   */
  changePassword: protectedProc
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z
          .string()
          .min(8, "Minimum 8 caractères")
          .regex(/[A-Z]/, "Doit contenir une majuscule")
          .regex(/[0-9]/, "Doit contenir un chiffre"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await changePassword(ctx.user.id, input.currentPassword, input.newPassword);

      await audit({
        userId: ctx.user.id,
        action: "AUTH_PASSWORD_CHANGED",
        entityType: "user",
        entityId: ctx.user.id,
        ipAddress: ctx.req.ip ?? null,
      });

      return { success: true };
    }),

  // ── MFA TOTP ────────────────────────────────────────────────────────────────

  /** Initier la configuration MFA — retourne QR URI + secret */
  mfaSetup: protectedProc
    .mutation(async ({ ctx }) => {
      const result = await generateMfaSetup(ctx.user.id, ctx.user.email);
      return result; // { secret, qrUri, issuer }
    }),

  /** Confirmer l'activation MFA avec le premier code TOTP */
  mfaConfirm: protectedProc
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ input, ctx }) => {
      const result = await confirmMfaSetup(ctx.user.id, input.code);
      await audit({
        userId:     ctx.user.id,
        action:     "AUTH_MFA_ENABLED",
        entityType: "user",
        entityId:   String(ctx.user.id),
        ipAddress:  ctx.req.ip ?? null,
      });
      return result; // { backupCodes: string[] }
    }),

  /** Vérifier le code MFA lors du login (étape 2) */
  mfaVerify: publicProc
    .input(z.object({
      userId: z.number().int().positive(),
      code:   z.string().min(6).max(8),  // 6 chiffres TOTP ou 8 hex backup
    }))
    .mutation(async ({ input }) => {
      const result = await verifyMfaLogin(input.userId, input.code);
      if (!result.valid) {
        throw new Error("Code MFA invalide");
      }
      return { success: true, usedBackup: result.usedBackup };
    }),

  /** Désactiver MFA (nécessite le mot de passe) */
  mfaDisable: protectedProc
    .input(z.object({ password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await disableMfa(ctx.user.id, input.password);
      await audit({
        userId:     ctx.user.id,
        action:     "AUTH_MFA_DISABLED",
        entityType: "user",
        entityId:   String(ctx.user.id),
        ipAddress:  ctx.req.ip ?? null,
      });
      return { success: true };
    }),

  /** Régénérer les codes de secours */
  mfaRegenerateBackup: protectedProc
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ input, ctx }) => {
      const result = await regenerateBackupCodes(ctx.user.id, input.code);
      await audit({
        userId:     ctx.user.id,
        action:     "AUTH_MFA_BACKUP_REGENERATED",
        entityType: "user",
        entityId:   String(ctx.user.id),
        ipAddress:  ctx.req.ip ?? null,
      });
      return result; // { backupCodes: string[] }
    }),

  /** Statut MFA de l'utilisateur connecté */
  mfaStatus: protectedProc
    .query(async ({ ctx }) => {
      const { db } = await import("../../_core/db");
      const { users } = await import("../../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
        columns: { mfaEnabled: true, mfaEnabledAt: true, mfaBackupCodes: true },
      });
      return {
        enabled:         user?.mfaEnabled ?? false,
        enabledAt:       user?.mfaEnabledAt ?? null,
        backupCodesLeft: ((user?.mfaBackupCodes ?? []) as string[]).length,
      };
    }),

  // ── Password Reset ────────────────────────────────────────────────────────

  /** Demander un lien de réinitialisation — public */
  requestReset: publicProc
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      await requestPasswordReset(input.email);
      // Toujours retourner success (pas d'enumeration email)
      return { success: true };
    }),

  /** Confirmer la réinitialisation avec le token reçu par email — public */
  confirmReset: publicProc
    .input(z.object({
      token:       z.string().min(10),
      newPassword: z.string()
        .min(8,  "Minimum 8 caractères")
        .regex(/[A-Z]/, "Doit contenir une majuscule")
        .regex(/[0-9]/, "Doit contenir un chiffre"),
    }))
    .mutation(async ({ input }) => {
      await confirmPasswordReset(input.token, input.newPassword);
      return { success: true };
    }),
});
