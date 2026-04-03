/**
 * Gestion centralisée des secrets
 * Dev  : lecture depuis ENV (variables d'environnement validées par Zod)
 * Prod : lecture depuis HashiCorp Vault (si VAULT_ADDR configuré)
 *
 * Usage :
 *   const secret = await getSecret("JWT_ACCESS_SECRET");
 */

import { ENV } from "./env";
import { createLogger } from "./logger";

const log = createLogger("secrets");

// Mapping clé applicative → clé ENV
type SecretKey =
  | "JWT_ACCESS_SECRET"
  | "JWT_REFRESH_SECRET"
  | "ML_INTERNAL_API_KEY"
  | "WEBHOOK_SECRET"
  | "MFA_ENCRYPTION_KEY"
  | "PII_ENCRYPTION_KEY"
  | "TRACFIN_API_KEY"
  | "RESEND_API_KEY";

// Cache en mémoire (TTL 5 minutes)
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Lire depuis HashiCorp Vault via HTTP API
async function fetchFromVault(key: SecretKey): Promise<string | null> {
  const vaultAddr  = ENV.VAULT_ADDR;
  const vaultToken = ENV.VAULT_TOKEN;
  const vaultPath  = ENV.VAULT_PATH ?? "secret/data/kyc-aml";

  if (!vaultAddr || !vaultToken) return null;

  try {
    const res = await fetch(`${vaultAddr}/v1/${vaultPath}`, {
      headers: { "X-Vault-Token": vaultToken },
      signal:  AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      log.warn({ status: res.status, key }, "Vault: secret non trouvé");
      return null;
    }

    const body = await res.json() as {
      data?: { data?: Record<string, string> };
    };

    const value = body.data?.data?.[key];
    return value ?? null;
  } catch (err) {
    log.warn({ err, key }, "Vault: erreur de lecture — fallback ENV");
    return null;
  }
}

// Lire depuis ENV comme fallback
function fromEnv(key: SecretKey): string {
  const map: Record<SecretKey, string | undefined> = {
    JWT_ACCESS_SECRET:   ENV.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET:  ENV.JWT_REFRESH_SECRET,
    ML_INTERNAL_API_KEY: ENV.ML_INTERNAL_API_KEY,
    WEBHOOK_SECRET:      ENV.WEBHOOK_SECRET,
    MFA_ENCRYPTION_KEY:  ENV.MFA_ENCRYPTION_KEY,
    PII_ENCRYPTION_KEY:  ENV.PII_ENCRYPTION_KEY,
    TRACFIN_API_KEY:     ENV.TRACFIN_API_KEY,
    RESEND_API_KEY:      ENV.RESEND_API_KEY,
  };
  const value = map[key];
  if (!value) throw new Error(`Secret "${key}" non configuré`);
  return value;
}

export async function getSecret(key: SecretKey): Promise<string> {
  // Vérifier le cache
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // Essayer Vault
  const fromVault = await fetchFromVault(key);
  const value     = fromVault ?? fromEnv(key);

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });

  if (fromVault) {
    log.debug({ key }, "Secret lu depuis Vault");
  }

  return value;
}

// Invalider le cache (rotation de secrets)
export function invalidateSecretCache(key?: SecretKey): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
    log.info("Cache secrets invalidé");
  }
}

// Statut Vault pour le health check
export async function checkVaultHealth(): Promise<{
  status: "healthy" | "unavailable" | "not_configured";
  addr?: string;
}> {
  if (!ENV.VAULT_ADDR) return { status: "not_configured" };

  try {
    const res = await fetch(`${ENV.VAULT_ADDR}/v1/sys/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return {
      status: res.ok ? "healthy" : "unavailable",
      addr:   ENV.VAULT_ADDR,
    };
  } catch {
    return { status: "unavailable", addr: ENV.VAULT_ADDR };
  }
}
