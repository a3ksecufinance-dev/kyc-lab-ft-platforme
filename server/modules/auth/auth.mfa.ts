/**
 * Service MFA TOTP — RFC 6238 / Google Authenticator compatible
 *
 * Implémentation native sans dépendance externe :
 *  - HMAC-SHA1 via crypto.subtle (natif Node.js 18+)
 *  - Base32 encoding/decoding (standard TOTP)
 *  - QR code URL via otpauth:// URI (compatible GA, Authy, 1Password, Bitwarden)
 *
 * Sécurité :
 *  - Secret 160 bits (20 octets) — conforme RFC 4226
 *  - Fenêtre de tolérance ±1 période (30s) pour décalage horloge
 *  - 8 codes de secours à usage unique, hachés bcrypt
 *  - Le secret est stocké chiffré en base (AES-256-GCM via ENV.MFA_ENCRYPTION_KEY)
 */

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../_core/db";
import { users } from "../../../drizzle/schema";
import { ENV } from "../../_core/env";
import { createLogger } from "../../_core/logger";

const log = createLogger("mfa");

// ─── Base32 ───────────────────────────────────────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_CHARS[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str: string): Uint8Array {
  const s = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bytes = new Uint8Array(Math.floor(s.length * 5 / 8));
  let bits = 0, value = 0, idx = 0;
  for (const char of s) {
    const v = BASE32_CHARS.indexOf(char);
    if (v < 0) continue;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes[idx++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return bytes;
}

// ─── TOTP (RFC 6238) ──────────────────────────────────────────────────────────

async function hotp(secret: Uint8Array, counter: bigint): Promise<string> {
  // Encoder le counter en 8 octets big-endian
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = Number(c & 0xFFn);
    c >>= 8n;
  }

  const key = await crypto.subtle.importKey(
    "raw", secret.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false, ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));

  // Dynamic truncation
  const offset = sig[19]! & 0x0F;
  const code = (
    ((sig[offset]!   & 0x7F) << 24) |
    ((sig[offset+1]! & 0xFF) << 16) |
    ((sig[offset+2]! & 0xFF) << 8)  |
     (sig[offset+3]! & 0xFF)
  ) % 1_000_000;

  return code.toString().padStart(6, "0");
}

async function totp(secret: string, window = 0): Promise<string> {
  const counter = BigInt(Math.floor(Date.now() / 1000 / 30)) + BigInt(window);
  return hotp(base32Decode(secret), counter);
}

// ─── Chiffrement du secret MFA ────────────────────────────────────────────────

const ENC_KEY = ENV.MFA_ENCRYPTION_KEY || ENV.JWT_ACCESS_SECRET.slice(0, 32);

async function encryptSecret(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ENC_KEY.slice(0, 32).padEnd(32, "0")),
    { name: "AES-GCM" },
    false, ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret)
  );
  // Format : iv(base64).cipher(base64)
  const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `${b64(iv.buffer)}.${b64(enc)}`;
}

async function decryptSecret(stored: string): Promise<string> {
  const [ivB64, cipherB64] = stored.split(".");
  if (!ivB64 || !cipherB64) throw new Error("Format secret MFA invalide");

  const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ENC_KEY.slice(0, 32).padEnd(32, "0")),
    { name: "AES-GCM" },
    false, ["decrypt"]
  );
  const dec = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    key,
    fromB64(cipherB64)
  );
  return new TextDecoder().decode(dec);
}

// ─── Génération de codes de secours ──────────────────────────────────────────

function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 8).toUpperCase();
  });
}

async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map(c => bcrypt.hash(c, 10)));
}

async function verifyBackupCode(code: string, hashes: string[]): Promise<{
  valid: boolean; index: number;
}> {
  const normalised = code.replace(/[^A-F0-9]/gi, "").toUpperCase().slice(0, 8);
  for (let i = 0; i < hashes.length; i++) {
    const hash = hashes[i];
    if (hash && await bcrypt.compare(normalised, hash)) {
      return { valid: true, index: i };
    }
  }
  return { valid: false, index: -1 };
}

// ─── API publique ─────────────────────────────────────────────────────────────

export async function generateMfaSetup(userId: number, userEmail: string): Promise<{
  secret:       string;  // secret en clair pour affichage QR — JAMAIS persisté avant confirm
  qrUri:        string;  // otpauth:// URI pour QR code
  issuer:       string;
}> {
  // Générer un secret aléatoire 20 octets (160 bits)
  const rawSecret = crypto.getRandomValues(new Uint8Array(20));
  const secret    = base32Encode(rawSecret);
  const issuer    = "KYC-AML Platform";
  const account   = encodeURIComponent(userEmail);
  const qrUri     = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  // Stocker temporairement le secret en attente de confirmation (Redis ou champ pending)
  await db.update(users).set({
    mfaSecret:  await encryptSecret(secret),
    mfaEnabled: false,                          // pas encore activé
    updatedAt:  new Date(),
  }).where(eq(users.id, userId));

  log.info({ userId }, "MFA setup initié");
  return { secret, qrUri, issuer };
}

export async function confirmMfaSetup(userId: number, code: string): Promise<{
  backupCodes: string[];  // codes en clair — afficher UNE SEULE FOIS
}> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.mfaSecret) throw new Error("Aucun setup MFA en cours — relancer la configuration");

  const secret = await decryptSecret(user.mfaSecret);

  // Vérifier le code TOTP avec fenêtre ±1
  const valid = await verifyTotpCode(secret, code);
  if (!valid) throw new Error("Code invalide — vérifier l'heure de votre appareil");

  // Générer et hacher les codes de secours
  const plainCodes  = generateBackupCodes(8);
  const hashedCodes = await hashBackupCodes(plainCodes);

  await db.update(users).set({
    mfaEnabled:     true,
    mfaBackupCodes: hashedCodes,
    mfaEnabledAt:   new Date(),
    updatedAt:      new Date(),
  }).where(eq(users.id, userId));

  log.info({ userId }, "MFA activé avec succès");
  return { backupCodes: plainCodes };
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  const cleaned = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;

  // Vérifier fenêtre -1, 0, +1 (tolérance ±30s)
  for (const w of [-1, 0, 1]) {
    const expected = await totp(secret, w);
    if (expected === cleaned) return true;
  }
  return false;
}

export async function verifyMfaLogin(userId: number, code: string): Promise<{
  valid:         boolean;
  usedBackup:    boolean;
  backupIndex?:  number;
}> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.mfaEnabled || !user.mfaSecret) return { valid: false, usedBackup: false };

  const secret = await decryptSecret(user.mfaSecret);

  // Essayer TOTP d'abord
  if (await verifyTotpCode(secret, code)) {
    return { valid: true, usedBackup: false };
  }

  // Essayer les codes de secours
  const hashes = (user.mfaBackupCodes ?? []) as string[];
  if (hashes.length > 0) {
    const { valid, index } = await verifyBackupCode(code, hashes);
    if (valid) {
      // Invalider le code utilisé (one-time)
      const remaining = hashes.filter((_, i) => i !== index);
      await db.update(users).set({
        mfaBackupCodes: remaining,
        updatedAt: new Date(),
      }).where(eq(users.id, userId));

      log.warn({ userId, backupIndex: index }, "Code de secours MFA utilisé");
      return { valid: true, usedBackup: true, backupIndex: index };
    }
  }

  log.warn({ userId }, "Échec vérification MFA");
  return { valid: false, usedBackup: false };
}

export async function disableMfa(userId: number, password: string): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error("Utilisateur introuvable");

  // Re-vérifier le mot de passe avant désactivation
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error("Mot de passe incorrect");

  await db.update(users).set({
    mfaEnabled:     false,
    mfaSecret:      null,
    mfaBackupCodes: null,
    mfaEnabledAt:   null,
    updatedAt:      new Date(),
  }).where(eq(users.id, userId));

  log.info({ userId }, "MFA désactivé");
}

export async function regenerateBackupCodes(userId: number, totpCode: string): Promise<{
  backupCodes: string[];
}> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.mfaEnabled || !user.mfaSecret) throw new Error("MFA non activé");

  const secret = await decryptSecret(user.mfaSecret);
  if (!await verifyTotpCode(secret, totpCode)) throw new Error("Code TOTP invalide");

  const plainCodes  = generateBackupCodes(8);
  const hashedCodes = await hashBackupCodes(plainCodes);

  await db.update(users).set({
    mfaBackupCodes: hashedCodes,
    updatedAt:      new Date(),
  }).where(eq(users.id, userId));

  return { backupCodes: plainCodes };
}
