/**
 * Seed wallets — injection dans la DB existante (sans reset)
 * Usage : pnpm tsx drizzle/seed.wallets.ts
 */
import "../server/_core/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool }    from "pg";
import { nanoid }  from "nanoid";
import { inArray } from "drizzle-orm";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db   = drizzle(pool, { schema });

async function main() {
  console.log("💳 Seed wallets de démonstration");

  // Récupérer les clients existants par email
  const emails = [
    "m.alami@gmail.com",
    "a.berrada@hotmail.com",
    "k.tazi@yahoo.fr",
    "r.bensouda@gov.ma",
    "h.qadiri@protonmail.com",
    "contact@mie-sarl.ma",
  ];

  const customers = await db.select({ id: schema.customers.id, email: schema.customers.email })
    .from(schema.customers)
    .where(inArray(schema.customers.email, emails));

  if (customers.length === 0) {
    console.error("❌ Aucun client trouvé — lancez d'abord pnpm db:seed:demo");
    process.exit(1);
  }

  const byEmail = Object.fromEntries(customers.map(c => [c.email, c.id]));

  // Supprimer les wallets existants pour éviter les doublons
  if (customers.length > 0) {
    await db.delete(schema.wallets)
      .where(inArray(schema.wallets.customerId, customers.map(c => c.id)));
  }

  const walletId = () => `WAL-${nanoid(10).toUpperCase()}`;

  const rows = [
    // Mohammed ALAMI — Orange Money STANDARD actif
    {
      walletId:    walletId(),
      customerId:  byEmail["m.alami@gmail.com"]!,
      provider:    "ORANGE_MONEY",
      phoneNumber: "+212661234501",
      msisdn:      "212661234501",
      currency:    "MAD",
      kycTier:     "STANDARD" as const,
      balance:     "18500.00",
      dailyLimit:  "50000",
      monthlyLimit:"200000",
      isActive:    true,
      isDormant:   false,
      lastActivityAt: new Date(),
    },
    // Aicha BERRADA — Wave ALLEGED actif
    {
      walletId:    walletId(),
      customerId:  byEmail["a.berrada@hotmail.com"]!,
      provider:    "WAVE",
      phoneNumber: "+212662345602",
      msisdn:      "212662345602",
      currency:    "MAD",
      kycTier:     "ALLEGED" as const,
      balance:     "4200.50",
      dailyLimit:  "5000",
      monthlyLimit:"20000",
      isActive:    true,
      isDormant:   false,
      lastActivityAt: new Date(Date.now() - 2 * 86400000),
    },
    // Karim TAZI — Internal RENFORCE actif (solde élevé)
    {
      walletId:    walletId(),
      customerId:  byEmail["k.tazi@yahoo.fr"]!,
      provider:    "INTERNAL",
      phoneNumber: "+212663456703",
      currency:    "MAD",
      kycTier:     "RENFORCE" as const,
      balance:     "320000.00",
      dailyLimit:  "500000",
      monthlyLimit:"2000000",
      isActive:    true,
      isDormant:   false,
      lastActivityAt: new Date(),
    },
    // Rachid BENSOUDA (PEP) — CIH Mobile RENFORCE, actif
    {
      walletId:    walletId(),
      customerId:  byEmail["r.bensouda@gov.ma"]!,
      provider:    "CIH_MOBILE",
      phoneNumber: "+212664567804",
      currency:    "MAD",
      kycTier:     "RENFORCE" as const,
      balance:     "95000.00",
      isActive:    true,
      isDormant:   false,
      lastActivityAt: new Date(Date.now() - 5 * 86400000),
    },
    // Hassan QADIRI (HIGH RISK) — Orange Money STANDARD suspendu
    {
      walletId:    walletId(),
      customerId:  byEmail["h.qadiri@protonmail.com"]!,
      provider:    "ORANGE_MONEY",
      phoneNumber: "+212600000000",
      currency:    "MAD",
      kycTier:     "STANDARD" as const,
      balance:     "0.00",
      isActive:    false,   // SUSPENDU — compte à risque
      isDormant:   false,
    },
    // MAROC IMPORT EXPORT — Internal ALLEGED dormant
    {
      walletId:    walletId(),
      customerId:  byEmail["contact@mie-sarl.ma"]!,
      provider:    "INTERNAL",
      currency:    "MAD",
      kycTier:     "ALLEGED" as const,
      balance:     "1200.00",
      isActive:    true,
      isDormant:   true,   // DORMANT — aucune transaction depuis 6 mois
      dormantSince: new Date(Date.now() - 180 * 86400000),
    },
  ].filter(r => r.customerId !== undefined);

  const inserted = await db.insert(schema.wallets).values(rows as any).returning();
  console.log(`✅ ${inserted.length} wallets créés`);
  inserted.forEach(w => console.log(`   ${w.walletId} — ${w.provider} — ${w.kycTier} — ${w.balance} MAD — ${w.isActive ? (w.isDormant ? "DORMANT" : "ACTIF") : "SUSPENDU"}`));

  await pool.end();
}

main().catch(err => {
  console.error("❌", err);
  process.exit(1);
});
