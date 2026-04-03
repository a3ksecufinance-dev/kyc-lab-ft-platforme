/**
 * Chiffrement des données PII (Personally Identifiable Information)
 * Algorithme : AES-256-GCM (NIST SP 800-38D)
 * Clé        : PII_ENCRYPTION_KEY (32+ bytes, hex ou base64)
 * Encodage   : base64url (compact, URL-safe)
 *
 * Format stocké : "enc:v1:<iv_b64>.<ciphertext_b64>.<authtag_b64>"
 * Détection    : préfixe "enc:v1:" — les valeurs non chiffrées passent transparentes
 *
 * Usage :
 *   const encrypted = encryptPii("Jean Dupont");
 *   const plain     = decryptPii(encrypted); // "Jean Dupont"
 *   decryptPii("Jean Dupont");               // "Jean Dupont" (plain passthrough)
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { ENV } from "./env";
import { createLogger } from "./logger";

const log    = createLogger("pii");
const PREFIX = "enc:v1:";

// ─── Dériver la clé AES-256 depuis la variable d'environnement ────────────────

function getDerivedKey(): Buffer | null {
  const raw = ENV.PII_ENCRYPTION_KEY;
  if (!raw) return null;

  // Si la clé est en hex (64 chars) ou base64 (44 chars), convertir
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  if (raw.length >= 44)               return Buffer.from(raw, "base64").subarray(0, 32);

  // Sinon utiliser directement
  return Buffer.from(raw).subarray(0, 32);
}

// ─── Chiffrement ─────────────────────────────────────────────────────────────

export function encryptPii(plaintext: string | null | undefined): string {
  if (plaintext === null || plaintext === undefined) return plaintext as unknown as string;
  if (plaintext === "") return "";

  const key = getDerivedKey();
  if (!key) return plaintext; // PII_ENCRYPTION_KEY non configuré → passthrough

  try {
    const iv     = randomBytes(12); // 96 bits pour GCM
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const encoded =
      PREFIX +
      iv.toString("base64url") + "." +
      encrypted.toString("base64url") + "." +
      authTag.toString("base64url");

    return encoded;
  } catch (err) {
    log.error({ err }, "Erreur chiffrement PII — données retournées en clair");
    return plaintext;
  }
}

// ─── Déchiffrement ─────────────────────────────────────────────────────────────

export function decryptPii(value: string | null | undefined): string {
  if (value === null || value === undefined) return value as unknown as string;
  if (value === "") return "";
  if (!value.startsWith(PREFIX)) return value; // Valeur non chiffrée → passthrough

  const key = getDerivedKey();
  if (!key) {
    log.warn("PII_ENCRYPTION_KEY absent — valeur chiffrée retournée brute");
    return value;
  }

  try {
    const payload = value.slice(PREFIX.length);
    const parts   = payload.split(".");
    if (parts.length !== 3) throw new Error("Format invalide");

    const iv         = Buffer.from(parts[0]!, "base64url");
    const ciphertext = Buffer.from(parts[1]!, "base64url");
    const authTag    = Buffer.from(parts[2]!, "base64url");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (err) {
    log.error({ err }, "Erreur déchiffrement PII — valeur brute retournée");
    return value;
  }
}

// ─── Vérification ─────────────────────────────────────────────────────────────

export function isPiiEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function piiEncryptionEnabled(): boolean {
  return getDerivedKey() !== null;
}
