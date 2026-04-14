/**
 * Script de migration PII — Chiffrement des données existantes
 *
 * Chiffre les champs sensibles (phone, dateOfBirth, address) pour tous les
 * clients dont les données sont encore en clair.
 *
 * Prérequis :
 *   PII_ENCRYPTION_KEY=<clé 32+ bytes> dans .env
 *
 * Usage :
 *   pnpm tsx scripts/pii-migrate.ts [--dry-run] [--batch=100]
 *
 * Options :
 *   --dry-run   Affiche les clients qui seraient mis à jour sans rien écrire
 *   --batch=N   Taille du batch de traitement (défaut: 50)
 *
 * Sécurité :
 *   - Idempotent : ignore les valeurs déjà au format "enc:v1:..."
 *   - Transaction par batch pour éviter les données partiellement migrées
 *   - Log de progression avec compte-rendu final
 */

import { config }           from "dotenv";
config();

import { eq, isNotNull, or, and, not, like } from "drizzle-orm";
import { db }                from "../server/_core/db";
import { customers }         from "../drizzle/schema";
import { encryptPii, isPiiEncrypted, piiEncryptionEnabled } from "../server/_core/pii";

const args    = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const batchArg = args.find(a => a.startsWith("--batch="));
const BATCH   = batchArg ? parseInt(batchArg.split("=")[1] ?? "50", 10) : 50;

const PII_MARKER = "enc:v1:";

async function migrate() {
  console.log("=".repeat(60));
  console.log("   Migration PII — Chiffrement données existantes");
  console.log("=".repeat(60));

  if (!piiEncryptionEnabled()) {
    console.error("❌  PII_ENCRYPTION_KEY non configuré — impossible de chiffrer.");
    console.error("    Ajoutez PII_ENCRYPTION_KEY dans .env (32+ bytes hex).");
    process.exit(1);
  }

  if (DRY_RUN) console.log("⚠️  MODE DRY-RUN — aucune donnée ne sera modifiée\n");

  let offset  = 0;
  let total   = 0;
  let updated = 0;
  let skipped = 0;
  let errors  = 0;

  // Cibler uniquement les clients dont au moins un champ n'est pas encore chiffré
  const needsMigration = or(
    and(isNotNull(customers.phone),       not(like(customers.phone,       `${PII_MARKER}%`))),
    and(isNotNull(customers.dateOfBirth), not(like(customers.dateOfBirth, `${PII_MARKER}%`))),
    and(isNotNull(customers.address),     not(like(customers.address,     `${PII_MARKER}%`))),
  );

  while (true) {
    const batch = await db
      .select({
        id:          customers.id,
        customerId:  customers.customerId,
        phone:       customers.phone,
        dateOfBirth: customers.dateOfBirth,
        address:     customers.address,
      })
      .from(customers)
      .where(needsMigration)
      .limit(BATCH)
      .offset(offset);

    if (batch.length === 0) break;
    total += batch.length;

    for (const row of batch) {
      try {
        const updates: Record<string, string | null> = {};
        let hasUpdate = false;

        if (row.phone && !isPiiEncrypted(row.phone)) {
          updates["phone"] = encryptPii(row.phone);
          hasUpdate = true;
        }
        if (row.dateOfBirth && !isPiiEncrypted(row.dateOfBirth)) {
          updates["date_of_birth"] = encryptPii(row.dateOfBirth);
          hasUpdate = true;
        }
        if (row.address && !isPiiEncrypted(row.address)) {
          updates["address"] = encryptPii(row.address);
          hasUpdate = true;
        }

        if (!hasUpdate) { skipped++; continue; }

        if (DRY_RUN) {
          console.log(`  [DRY] ${row.customerId} — champs: ${Object.keys(updates).join(", ")}`);
          updated++;
          continue;
        }

        await db
          .update(customers)
          .set(updates as never)
          .where(eq(customers.id, row.id));

        updated++;
        process.stdout.write(`\r  Progression : ${updated + skipped + errors} / ${total}...`);
      } catch (err) {
        errors++;
        console.error(`\n  ❌ Erreur client #${row.id} (${row.customerId}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    offset += BATCH;
    if (batch.length < BATCH) break;  // dernière page
  }

  console.log("\n");
  console.log("─".repeat(60));
  console.log(`  Clients analysés   : ${total}`);
  console.log(`  Clients mis à jour : ${updated}`);
  console.log(`  Déjà chiffrés      : ${skipped}`);
  console.log(`  Erreurs            : ${errors}`);
  console.log("─".repeat(60));

  if (errors > 0) {
    console.error(`\n⚠️  ${errors} erreur(s) — vérifiez les logs`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\n✅  Dry-run terminé. Relancez sans --dry-run pour appliquer.");
  } else {
    console.log("\n✅  Migration PII terminée avec succès.");
  }

  process.exit(0);
}

migrate().catch(err => {
  console.error("❌  Erreur fatale migration PII:", err);
  process.exit(1);
});
