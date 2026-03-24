import { config } from "dotenv";
config();

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { users } from "./schema";
import { eq } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"]! });
const db = drizzle(pool);

async function seed() {
  console.log("🌱 Démarrage du seed...");

  // ─── Admin initial ────────────────────────────────────────────────────────
  const adminEmail = process.env["ADMIN_EMAIL"] ?? "admin@kyc-aml.local";
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1);

  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash(process.env["ADMIN_PASSWORD"] ?? "ChangeMe!Admin123", 12);
    await db.insert(users).values({
      email: adminEmail,
      passwordHash,
      name: process.env["ADMIN_NAME"] ?? "Administrateur",
      role: "admin",
      isActive: true,
    });
    console.log(`✅ Admin créé : ${adminEmail}`);
  } else {
    console.log(`ℹ️  Admin déjà existant : ${adminEmail}`);
  }

  // ─── Utilisateurs de démonstration ───────────────────────────────────────
  if (process.env["NODE_ENV"] !== "production") {
    const demoUsers = [
      { email: "analyst@kyc-aml.local", name: "Marie Dubois", role: "analyst" as const },
      { email: "supervisor@kyc-aml.local", name: "Jean Martin", role: "supervisor" as const },
      { email: "compliance@kyc-aml.local", name: "Sophie Laurent", role: "compliance_officer" as const },
    ];

    for (const demoUser of demoUsers) {
      const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, demoUser.email)).limit(1);
      if (exists.length === 0) {
        const passwordHash = await bcrypt.hash("Demo123!", 12);
        await db.insert(users).values({ ...demoUser, passwordHash, isActive: true });
        console.log(`✅ Utilisateur demo créé : ${demoUser.email} (${demoUser.role})`);
      }
    }
  }

  console.log("✅ Seed terminé");
  await pool.end();
}

seed().catch((err) => {
  console.error("❌ Erreur seed:", err);
  process.exit(1);
});
