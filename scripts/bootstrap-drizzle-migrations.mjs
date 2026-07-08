/**
 * Bootstrap __drizzle_migrations pour un schéma déjà appliqué (via db:push
 * ou script manuel). Insère les hashes SHA256 attendus par drizzle-kit pour
 * les migrations listées dans _journal.json, SAUF la dernière (à laisser à
 * drizzle-kit migrate).
 *
 * Usage : node scripts/bootstrap-drizzle-migrations.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MIGRATIONS_DIR = path.join(__dirname, "..", "drizzle", "migrations");
const JOURNAL_PATH   = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquant dans .env");
  process.exit(1);
}

const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8"));
const entries = journal.entries;

// Le CLI utilisateur choisira laquelle laisser à drizzle-kit (par défaut,
// tout sauf la dernière).
const KEEP_UNAPPLIED = Number(process.env.KEEP_UNAPPLIED ?? "1");
const toMark = entries.slice(0, entries.length - KEEP_UNAPPLIED);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// La table drizzle.__drizzle_migrations est créée par le runtime au 1er migrate.
// On la crée nous-même si absente (schéma identique à celui de drizzle-kit).
await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle;`);
await client.query(`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id serial PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  );
`);

const { rows: existing } = await client.query(
  `SELECT hash FROM drizzle.__drizzle_migrations`
);
const known = new Set(existing.map(r => r.hash));

let inserted = 0;
for (const e of toMark) {
  const sqlPath = path.join(MIGRATIONS_DIR, `${e.tag}.sql`);
  const raw = fs.readFileSync(sqlPath, "utf8");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  if (known.has(hash)) {
    console.log(`≈  ${e.tag} — déjà trackée, skip`);
    continue;
  }
  await client.query(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
    [hash, e.when]
  );
  console.log(`✓  ${e.tag} — hash ${hash.slice(0, 12)}… marqué appliqué`);
  inserted++;
}

const remaining = entries.slice(-KEEP_UNAPPLIED).map(e => e.tag);
console.log(`\nBootstrap terminé — ${inserted} migration(s) marquée(s) appliquée(s).`);
console.log(`À appliquer avec \`pnpm drizzle-kit migrate\` : ${remaining.join(", ")}`);

await client.end();
