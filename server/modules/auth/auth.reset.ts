/**
 * Password Reset — token JWT 15min + envoi email via Resend.com
 *
 * Flow :
 *   1. POST /auth.requestReset   → génère token JWT 15min, stocke dans Redis, envoie email
 *   2. POST /auth.confirmReset   → vérifie token, met à jour passwordHash, invalide token
 *
 * Sécurité :
 *   - Token à usage unique (supprimé de Redis après usage)
 *   - TTL 15 minutes
 *   - Réponse identique que l'email existe ou non (pas d'user enumeration)
 *   - Nouveau mot de passe haché bcrypt rounds=12
 */

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../_core/db";
import { redis } from "../../_core/redis";
import { users } from "../../../drizzle/schema";
import { ENV } from "../../_core/env";
import { createLogger } from "../../_core/logger";

const log = createLogger("auth-reset");

const RESET_SECRET = new TextEncoder().encode(
  ENV.JWT_ACCESS_SECRET + ":reset"   // secret distinct des access tokens
);
const RESET_TTL_SECONDS = 15 * 60;   // 15 minutes

// ─── Génération du token ──────────────────────────────────────────────────────

async function generateResetToken(userId: number): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${RESET_TTL_SECONDS}s`)
    .sign(RESET_SECRET);
}

async function verifyResetToken(token: string): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, RESET_SECRET);
    return { userId: payload["userId"] as number };
  } catch {
    return null;
  }
}

// ─── Envoi email via Resend.com ───────────────────────────────────────────────

async function sendResetEmail(
  email: string,
  resetUrl: string,
): Promise<void> {
  const resendApiKey = process.env["RESEND_API_KEY"];

  if (!resendApiKey) {
    // Dev sans RESEND_API_KEY → logger le lien (utile en dev)
    log.warn({ email, resetUrl }, "RESEND_API_KEY manquant — lien de reset affiché en log (dev uniquement)");
    return;
  }

  const body = {
    from:    process.env["EMAIL_FROM"] ?? "noreply@kyc-aml.local",
    to:      [email],
    subject: "Réinitialisation de votre mot de passe KYC-AML",
    html: `
      <div style="font-family:monospace;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#0d1117;font-size:18px;margin-bottom:16px;">
          Réinitialisation du mot de passe
        </h2>
        <p style="color:#484f58;font-size:14px;margin-bottom:24px;">
          Vous avez demandé la réinitialisation de votre mot de passe.<br/>
          Ce lien est valable <strong>15 minutes</strong>.
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#1f6feb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">
          Réinitialiser le mot de passe
        </a>
        <p style="color:#7d8590;font-size:12px;margin-top:24px;">
          Si vous n'avez pas fait cette demande, ignorez cet email.<br/>
          Ce lien expirera automatiquement dans 15 minutes.
        </p>
        <hr style="border:none;border-top:1px solid #21262d;margin:24px 0;" />
        <p style="color:#484f58;font-size:11px;">
          Plateforme KYC/AML — Accès restreint
        </p>
      </div>
    `,
  };

  const response = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    log.error({ status: response.status, err }, "Erreur envoi email reset");
    throw new Error("Erreur envoi email");
  }

  log.info({ email }, "Email de reset envoyé");
}

// ─── API publique ─────────────────────────────────────────────────────────────

export async function requestPasswordReset(email: string): Promise<void> {
  const [user] = await db
    .select({ id: users.id, email: users.email, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  // Toujours retourner sans erreur — pas d'enumeration d'email
  if (!user || !user.isActive) {
    log.warn({ email }, "Reset demandé pour email inconnu/inactif (ignoré silencieusement)");
    return;
  }

  const token    = await generateResetToken(user.id);
  const redisKey = `reset:token:${user.id}`;

  // Stocker le token (un seul actif à la fois par user)
  await redis.setex(redisKey, RESET_TTL_SECONDS, token);

  const baseUrl  = process.env["APP_URL"] ?? "http://localhost:5173";
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  await sendResetEmail(user.email, resetUrl);
  log.info({ userId: user.id }, "Reset password demandé");
}

export async function confirmPasswordReset(
  token:       string,
  newPassword: string,
): Promise<void> {
  const payload = await verifyResetToken(token);
  if (!payload) {
    throw new Error("Lien de réinitialisation invalide ou expiré");
  }

  const { userId } = payload;
  const redisKey   = `reset:token:${userId}`;

  // Vérifier que le token est celui stocké (pas un token révoqué ou réutilisé)
  const stored = await redis.get(redisKey);
  if (!stored || stored !== token) {
    throw new Error("Lien de réinitialisation déjà utilisé ou expiré");
  }

  // Invalider le token immédiatement (usage unique)
  await redis.del(redisKey);

  // Hacher et mettre à jour le mot de passe
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  log.info({ userId }, "Mot de passe réinitialisé avec succès");
}
