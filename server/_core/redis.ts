import Redis from "ioredis";
import { ENV } from "./env";
import { createLogger } from "./logger";

const log = createLogger("redis");

// Configuration Redis
const redisConfig = {
  lazyConnect: true,
  retryStrategy(times: number) {
    if (times > 10) {
      log.error("Redis : trop de tentatives de reconnexion — abandon");
      return null; // Arrêter les tentatives
    }
    const delay = Math.min(times * 100, 3000);
    log.warn({ attempt: times, delay }, "Redis : tentative de reconnexion");
    return delay;
  },
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  ...(ENV.REDIS_PASSWORD ? { password: ENV.REDIS_PASSWORD } : {}),
};

// Client principal
export const redis = new Redis(ENV.REDIS_URL, redisConfig);

redis.on("connect", () => log.info("Redis connecté"));
redis.on("ready", () => log.info("Redis prêt"));
redis.on("error", (err) => log.error({ err }, "Erreur Redis"));
redis.on("close", () => log.warn("Connexion Redis fermée"));
redis.on("reconnecting", () => log.info("Redis : reconnexion en cours..."));

// ─── Namespaces Redis ──────────────────────────────────────────────────────────
// Convention: prefix:key
// auth:refresh:{userId}     → refresh tokens
// auth:blacklist:{jti}      → tokens révoqués
// rl:{ip}                   → rate limiting
// cache:dashboard:{key}     → cache métriques dashboard
// cb:{service}              → circuit breaker state
// screening:lists:{provider} → listes de sanctions cachées

export const RedisKeys = {
  refreshToken: (userId: number) => `auth:refresh:${userId}`,
  tokenBlacklist: (jti: string) => `auth:blacklist:${jti}`,
  rateLimit: (ip: string) => `rl:${ip}`,
  dashboardCache: (key: string) => `cache:dashboard:${key}`,
  circuitBreaker: (service: string) => `cb:${service}`,
  screeningList:       (provider: string) => `screening:lists:${provider}`,
  screeningLastUpdate: (provider: string) => `screening:last_update:${provider}`,
  screeningListCount:  (provider: string) => `screening:count:${provider}`,
  screeningListStatus: () => `screening:status`,
  screeningCustomList: () => `screening:lists:custom`,    // liste personnalisée
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Cache avec TTL — wrapper typé sur Redis GET/SET
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Cache miss ou erreur Redis → continuer
  }

  const value = await fetcher();

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Échec du cache → pas grave, on retourne la valeur quand même
  }

  return value;
}

/**
 * Rate limiter basé sur Redis (sliding window)
 * Retourne true si la requête est autorisée
 */
export async function checkRateLimit(
  ip: string,
  maxRequests: number = ENV.RATE_LIMIT_MAX,
  windowSeconds: number = ENV.RATE_LIMIT_WINDOW_SECONDS
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = RedisKeys.rateLimit(ip);
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, "-inf", windowStart);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.zcard(key);
    pipeline.expire(key, windowSeconds);

    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) ?? 0;
    const remaining = Math.max(0, maxRequests - count);
    const resetAt = Math.floor((now + windowSeconds * 1000) / 1000);

    return {
      allowed: count <= maxRequests,
      remaining,
      resetAt,
    };
  } catch {
    // Si Redis down → autoriser (fail open)
    return { allowed: true, remaining: maxRequests, resetAt: 0 };
  }
}

// Health check
export async function checkRedisHealth(): Promise<{
  status: "healthy" | "unhealthy";
  latency?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await redis.ping();
    return { status: "healthy", latency: Date.now() - start };
  } catch (err) {
    return {
      status: "unhealthy",
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : "Ping échoué",
    };
  }
}

// Fermeture gracieuse
export async function closeRedis(): Promise<void> {
  await redis.quit();
  log.info("Redis fermé");
}
