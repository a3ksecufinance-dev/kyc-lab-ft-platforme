/**
 * Script de rotation de clé PII (re-chiffrement)
 *
 * Décrypte toutes les valeurs PII avec l'ANCIENNE clé, puis les re-chiffre
 * avec la NOUVELLE clé (lue depuis PII_ENCRYPTION_KEY dans .env).
 *
 * Usage :
 *   pnpm tsx scripts/pii-rekey.ts --old-key=<hex64>
 *   pnpm tsx scripts/pii-rekey.ts --old-key=<hex64> --dry-run
 *
 * Options :
 *   --old-key=<hex>   Ancienne clé (64 chars hex = 32 bytes)
 *   --dry-run         Vérifie le déchiffrement sans écrire en base
 *   --batch=N         Taille des batchs (défaut: 50)
 *
 * Sécurité :
 *   - Idempotent : ignore les valeurs non chiffrées (pas de préfixe enc:v1:)
 *   - Transaction par batch
 *   - Si le déchiffrement avec l'ancienne clé échoue, la valeur est ignorée
 */

import { config } from "dotenv";
config();

import { createDecipheriv, createCipheriv, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db }       from "../server/_core/db";
import { customers } from "../drizzle/schema";
import { piiEncryptionEnabled } from "../server/_core/pii";

// ─── CLI args ──────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes("--dry-run");
const batchArg  = args.find(a => a.startsWith("--batch="));
const BATCH     = batchArg ? parseInt(batchArg.split("=")[1] ?? "50", 10) : 50;
const oldKeyArg = args.find(a => a.startsWith("--old-key="));
const OLD_KEY_HEX = oldKeyArg ? oldKeyArg.split("=").slice(1).join("=") : null;

const PREFIX = "enc:v1:";

// ─── Crypto helpers ────────────────────────────────────────────────────────────

function parseKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`Clé invalide : doit être 64 caractères hex (32 bytes). Reçu: ${hex.length} chars`);
  }
  return Buffer.from(hex, "hex");
}

function decryptWithKey(value: string, key: Buffer): string | null {
  if (!value.startsWith(PREFIX)) return null; // pas chiffré
  try {
    const payload = value.slice(PREFIX.length);
    const parts   = payload.split(".");
    if (parts.length !== 3) return null;

    const iv         = Buffer.from(parts[0]!, "base64url");
    const ciphertext = Buffer.from(parts[1]!, "base64url");
    const authTag    = Buffer.from(parts[2]!, "base64url");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null; // mauvaise clé ou données corrompues
  }
}

function encryptWithKey(value: string, key: Buffer): string {
  const iv         = randomBytes(12);
  const cipher     = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag    = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${authTag.toString("base64url")}`;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function rekey() {
  console.log("=".repeat(60));
  console.log("   Rotation de clé PII — Re-chiffrement des données");
  console.log("=".repeat(60));

  if (!OLD_KEY_HEX) {
    console.error("❌  --old-key=<hex64> requis.");
    console.error("    Exemple : pnpm tsx scripts/pii-rekey.ts --old-key=abcd1234...");
    process.exit(1);
  }

  if (!piiEncryptionEnabled()) {
    console.error("❌  PII_ENCRYPTION_KEY non configuré dans .env.");
    process.exit(1);
  }

  let oldKey: Buffer;
  try {
    oldKey = parseKey(OLD_KEY_HEX);
  } catch (err) {
    console.error(`❌  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const newKeyHex = process.env["PII_ENCRYPTION_KEY"]!;
  const newKey    = parseKey(newKeyHex);

  if (OLD_KEY_HEX === newKeyHex) {
    console.error("❌  L'ancienne et la nouvelle clé sont identiques — rien à faire.");
    process.exit(1);
  }

  if (DRY_RUN) console.log("⚠️  MODE DRY-RUN — aucune donnée ne sera modifiée\n");

  const PII_FIELDS = ["phone", "dateOfBirth", "address"] as const;
  type PiiField = typeof PII_FIELDS[number];

  let offset    = 0;
  let total     = 0;
  let updated   = 0;
  let skipped   = 0;
  let badKey    = 0;
  let errors    = 0;

  while (true) {
    const batch = await db
      .select({ id: customers.id, customerId: customers.customerId,
                phone: customers.phone, dateOfBirth: customers.dateOfBirth,
                address: customers.address })
      .from(customers)
      .limit(BATCH)
      .offset(offset);

    if (batch.length === 0) break;
    total += batch.length;

    for (const row of batch) {
      try {
        const updates: Partial<Record<PiiField, string | null>> = {};
        let hasUpdate = false;

        for (const field of PII_FIELDS) {
          const raw = row[field];
          if (!raw || !raw.startsWith(PREFIX)) { skipped++; continue; }

          const plaintext = decryptWithKey(raw, oldKey);
          if (plaintext === null) {
            // Peut-être déjà re-chiffré avec la nouvelle clé, ou corrompu — ignorer
            const alreadyNew = decryptWithKey(raw, newKey);
            if (alreadyNew !== null) {
              // Déjà migré
              continue;
            }
            badKey++;
            console.warn(`\n  ⚠️  Client #${row.id} (${row.customerId}) champ ${field} — déchiffrement impossible`);
            continue;
          }

          updates[field] = encryptWithKey(plaintext, newKey);
          hasUpdate = true;
        }

        if (!hasUpdate) continue;

        if (DRY_RUN) {
          console.log(`  [DRY] ${row.customerId} — champs: ${Object.keys(updates).join(", ")}`);
          updated++;
          continue;
        }

        await db.update(customers).set(updates as never).where(eq(customers.id, row.id));
        updated++;
        process.stdout.write(`\r  Progression : ${updated + skipped + errors} / ${total}...`);
      } catch (err) {
        errors++;
        console.error(`\n  ❌ Erreur client #${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    offset += BATCH;
    if (batch.length < BATCH) break;
  }

  console.log("\n");
  console.log("─".repeat(60));
  console.log(`  Clients analysés      : ${total}`);
  console.log(`  Clients re-chiffrés   : ${updated}`);
  console.log(`  Champs non chiffrés   : ${skipped}`);
  console.log(`  Clé invalide (ignorés): ${badKey}`);
  console.log(`  Erreurs               : ${errors}`);
  console.log("─".repeat(60));

  if (errors > 0) {
    console.error(`\n⚠️  ${errors} erreur(s) — vérifiez les logs`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\n✅  Dry-run terminé. Relancez sans --dry-run pour appliquer.");
  } else {
    console.log(`\n✅  Rotation de clé PII terminée. ${updated} client(s) re-chiffrés.`);
  }

  process.exit(0);
}

rekey().catch(err => {
  console.error("❌  Erreur fatale rotation PII:", err);
  process.exit(1);
});
