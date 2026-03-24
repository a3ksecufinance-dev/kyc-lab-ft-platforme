import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../_core/db";
import { redis, RedisKeys } from "../../_core/redis";
import { ENV } from "../../_core/env";
import { users, type User, type InsertUser } from "../../../drizzle/schema";
import { createLogger } from "../../_core/logger";
import { TRPCError } from "@trpc/server";

const log = createLogger("auth");

const ACCESS_SECRET = new TextEncoder().encode(ENV.JWT_ACCESS_SECRET);
const REFRESH_SECRET = new TextEncoder().encode(ENV.JWT_REFRESH_SECRET);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // secondes
}

export interface JwtPayload {
  sub: string;     // userId
  email: string;
  role: string;
  jti: string;     // JWT ID unique (pour révocation)
}

// ─── Helpers JWT ──────────────────────────────────────────────────────────────

function generateJti(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function signAccessToken(user: User): Promise<string> {
  const jti = generateJti();
  return new SignJWT({
    email: user.email,
    role: user.role,
    name: user.name,
    jti,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(ENV.JWT_ACCESS_EXPIRES_IN)
    .sign(ACCESS_SECRET);
}

async function signRefreshToken(userId: number): Promise<string> {
  const jti = generateJti();
  return new SignJWT({ jti })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(ENV.JWT_REFRESH_EXPIRES_IN)
    .sign(REFRESH_SECRET);
}

// ─── Service Auth ─────────────────────────────────────────────────────────────

/**
 * Inscription d'un nouvel utilisateur
 */
export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  role?: InsertUser["role"];
}): Promise<User> {
  // Vérifier si l'email existe déjà
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Un compte avec cet email existe déjà",
    });
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const [user] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      role: input.role ?? "analyst",
      isActive: true,
    })
    .returning();

  if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur création utilisateur" });

  log.info({ userId: user.id, email: user.email }, "Nouvel utilisateur créé");
  return user;
}

/**
 * Connexion — vérifie email/password et retourne une paire de tokens
 */
export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<
  | { user: User; tokens: TokenPair; mfaRequired: false }
  | { userId: number; mfaRequired: true; tokens: null; user: null }
> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()))
    .limit(1);

  if (!user || !user.isActive) {
    await bcrypt.hash("dummy", 12);
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Email ou mot de passe incorrect",
    });
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Email ou mot de passe incorrect",
    });
  }

  // Si MFA activé → ne pas retourner les tokens, demander le code TOTP
  if (user.mfaEnabled) {
    log.info({ userId: user.id }, "MFA requis pour la connexion");
    return { userId: user.id, mfaRequired: true, tokens: null, user: null };
  }

  await db
    .update(users)
    .set({ lastSignedIn: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  const tokens = await generateTokenPair(user);
  log.info({ userId: user.id }, "Connexion réussie");

  return { user, tokens, mfaRequired: false };
}

/**
 * Finaliser le login après validation MFA réussie
 * Appelé depuis auth.router.mfaLoginComplete
 */
export async function loginAfterMfa(userId: number): Promise<{ user: User; tokens: TokenPair }> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Utilisateur introuvable" });
  }

  await db
    .update(users)
    .set({ lastSignedIn: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));

  const tokens = await generateTokenPair(user);
  log.info({ userId }, "Connexion MFA finalisée");
  return { user, tokens };
}

/**
 * Générer une nouvelle paire access + refresh tokens
 */
export async function generateTokenPair(user: User): Promise<TokenPair> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user),
    signRefreshToken(user.id),
  ]);

  // Stocker le refresh token dans Redis (1 seul actif par user)
  const refreshTtlSeconds = 7 * 24 * 60 * 60; // 7 jours
  await redis.setex(
    RedisKeys.refreshToken(user.id),
    refreshTtlSeconds,
    refreshToken
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes en secondes
  };
}

/**
 * Renouveler les tokens via le refresh token
 */
export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  let payload: JwtPayload & { sub: string };

  try {
    const { payload: p } = await jwtVerify(refreshToken, REFRESH_SECRET);
    payload = p as unknown as typeof payload;
  } catch {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Refresh token invalide ou expiré",
    });
  }

  const userId = Number(payload.sub);

  // Vérifier que ce refresh token correspond au token stocké en Redis
  const storedToken = await redis.get(RedisKeys.refreshToken(userId));
  if (!storedToken || storedToken !== refreshToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Refresh token révoqué",
    });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Utilisateur introuvable ou désactivé",
    });
  }

  return generateTokenPair(user);
}

/**
 * Déconnexion — révoque le refresh token Redis
 */
export async function logoutUser(userId: number): Promise<void> {
  await redis.del(RedisKeys.refreshToken(userId));
  log.info({ userId }, "Déconnexion");
}

/**
 * Vérifie un access token et retourne l'utilisateur depuis la DB
 * Utilisé dans le contexte tRPC à chaque requête
 */
export async function verifyAccessToken(token: string): Promise<User> {
  let payload: JwtPayload & { sub: string };

  try {
    const { payload: p } = await jwtVerify(token, ACCESS_SECRET);
    payload = p as unknown as typeof payload;
  } catch {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Token invalide ou expiré",
    });
  }

  const userId = Number(payload.sub);

  // Récupérer l'utilisateur depuis la DB (vérifie isActive)
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Utilisateur introuvable ou désactivé",
    });
  }

  return user;
}

/**
 * Changer le mot de passe
 */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Utilisateur introuvable" });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Mot de passe actuel incorrect",
    });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Révoquer tous les tokens actifs → force reconnexion
  await redis.del(RedisKeys.refreshToken(userId));
  log.info({ userId }, "Mot de passe changé");
}
