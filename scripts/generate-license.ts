#!/usr/bin/env npx tsx
/**
 * generate-license.ts — Générateur de clés de licence
 *
 * Usage :
 *   npx tsx scripts/generate-license.ts \
 *     --client "Banque Al Amal SA" \
 *     --type PAYMENT_INSTITUTION \
 *     --pack enterprise \
 *     --users 25 \
 *     --months 12 \
 *     --secret "votre-secret-de-signature-32-chars-min"
 *
 * Ou avec des modules individuels :
 *   npx tsx scripts/generate-license.ts \
 *     --client "Petite Banque" \
 *     --type CLASSIC_BANK \
 *     --modules core,aml_engine,reporting,ekyc \
 *     --users 10 \
 *     --months 12 \
 *     --secret "votre-secret"
 *
 * Variables d'environnement :
 *   LICENSE_SIGNING_SECRET — alternative au flag --secret
 */

import { randomUUID } from "crypto";
import { encodeLicenseKey, decodeLicenseKey, computeLicenseStatus } from "../server/_core/license";
import { LICENSE_MODULES, LICENSE_PACKS, ALL_LICENSE_MODULES } from "../shared/license.types";
import type { LicensePayload, LicenseModule, LicensePack } from "../shared/license.types";

// ─── Parsing des arguments ──────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

// ─── Help ───────────────────────────────────────────────────────────────────

if (hasFlag("help") || process.argv.length < 3) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           KYC-AML Platform — License Generator              ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  npx tsx scripts/generate-license.ts [options]

Required:
  --client <name>     Nom du client
  --type <type>       CLASSIC_BANK | MICROFINANCE | PAYMENT_INSTITUTION
  --secret <key>      Clé de signature (min 32 chars) ou env LICENSE_SIGNING_SECRET

Modules (choisir l'un ou l'autre):
  --pack <pack>       Pack prédéfini : essential | standard | mobile | enterprise
  --modules <list>    Modules séparés par virgule

Optional:
  --users <n>         Nombre max d'utilisateurs (défaut: 25)
  --months <n>        Durée en mois (défaut: 12)
  --verify            Vérifier la clé générée

Modules disponibles:
${Object.entries(LICENSE_MODULES).map(([k, v]) => `  ${k.padEnd(16)} ${v}`).join("\n")}

Packs:
${Object.entries(LICENSE_PACKS).map(([k, v]) => `  ${k.padEnd(12)} → ${v.modules.join(", ")}`).join("\n")}
`);
  process.exit(0);
}

// ─── Validation ─────────────────────────────────────────────────────────────

const client = getArg("client");
if (!client) { console.error("❌ --client requis"); process.exit(1); }

const type = getArg("type") as LicensePayload["type"] | undefined;
if (!type || !["CLASSIC_BANK", "MICROFINANCE", "PAYMENT_INSTITUTION"].includes(type)) {
  console.error("❌ --type requis (CLASSIC_BANK | MICROFINANCE | PAYMENT_INSTITUTION)");
  process.exit(1);
}

const secret = getArg("secret") || process.env["LICENSE_SIGNING_SECRET"];
if (!secret || secret.length < 32) {
  console.error("❌ --secret requis (min 32 caractères) ou env LICENSE_SIGNING_SECRET");
  process.exit(1);
}

const maxUsers = parseInt(getArg("users") ?? "25", 10);
const months = parseInt(getArg("months") ?? "12", 10);

// Résolution des modules
let modules: LicenseModule[];
const packName = getArg("pack") as LicensePack | undefined;
const modulesCsv = getArg("modules");

if (packName && LICENSE_PACKS[packName]) {
  modules = [...LICENSE_PACKS[packName].modules];
} else if (modulesCsv) {
  modules = modulesCsv.split(",").map(m => m.trim()) as LicenseModule[];
  const invalid = modules.filter(m => !(m in LICENSE_MODULES));
  if (invalid.length > 0) {
    console.error(`❌ Modules inconnus : ${invalid.join(", ")}`);
    console.error(`   Modules valides : ${ALL_LICENSE_MODULES.join(", ")}`);
    process.exit(1);
  }
} else {
  console.error("❌ --pack ou --modules requis");
  process.exit(1);
}

// S'assurer que "core" est toujours inclus
if (!modules.includes("core")) {
  modules.unshift("core");
}

// ─── Génération ─────────────────────────────────────────────────────────────

const now = Math.floor(Date.now() / 1000);
const expiry = now + months * 30 * 86400;  // approximation mois = 30 jours

const payload: LicensePayload = {
  lid: randomUUID(),
  client,
  type,
  modules,
  maxUsers,
  iat: now,
  exp: expiry,
};

const licenseKey = encodeLicenseKey(payload, secret);

// ─── Affichage ──────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    LICENCE GÉNÉRÉE                          ║
╚══════════════════════════════════════════════════════════════╝

  Client       : ${client}
  Type         : ${type}
  Modules (${modules.length})  : ${modules.join(", ")}
  Max users    : ${maxUsers}
  Émise        : ${new Date(now * 1000).toISOString().split("T")[0]}
  Expire       : ${new Date(expiry * 1000).toISOString().split("T")[0]}
  Durée        : ${months} mois
  License ID   : ${payload.lid}

── CLÉ DE LICENCE ─────────────────────────────────────────────
${licenseKey}
────────────────────────────────────────────────────────────────

Pour activer, ajouter dans .env.production :
  LICENSE_KEY=${licenseKey}
  LICENSE_SIGNING_SECRET=${secret}

Ou activer via l'interface admin (Administration > Licence).
`);

// ─── Vérification optionnelle ───────────────────────────────────────────────

if (hasFlag("verify")) {
  console.log("── VÉRIFICATION ───────────────────────────────────────────────");
  const result = decodeLicenseKey(licenseKey, secret);
  if (result.valid && result.payload) {
    const status = computeLicenseStatus(result.payload);
    console.log(`  Signature   : ✅ Valide`);
    console.log(`  Statut      : ${status}`);
    console.log(`  Payload     : ${JSON.stringify(result.payload, null, 2)}`);
  } else {
    console.error(`  ❌ Échec vérification : ${result.error}`);
  }
  console.log("");
}
