/**
 * Seed de démonstration KYC-AML v2 — version robuste
 * Usage :
 *   pnpm tsx drizzle/seed.demo.ts
 *   pnpm tsx drizzle/seed.demo.ts --reset
 */

import "../server/_core/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db   = drizzle(pool, { schema });
const RESET = process.argv.includes("--reset");

const uid   = () => nanoid(10).toUpperCase();
const txId  = () => `TXN-AML-${nanoid(8).toUpperCase()}`;
const altId = () => `ALT-${nanoid(8).toUpperCase()}`;
const cId   = () => `CASE-${nanoid(6).toUpperCase()}`;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}
function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3_600_000);
}

// ─── Reset ────────────────────────────────────────────────────────────────────

async function resetDb() {
  console.log("Suppression des données existantes...");
  await db.delete(schema.screeningResults);
  await db.delete(schema.cases);
  await db.delete(schema.alerts);
  await db.delete(schema.transactions);
  await db.delete(schema.customers);
  await db.delete(schema.users);
  console.log("   ✓ Tables vidées");
}

// ─── SEED ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 KYC-AML v2 — Seed de démonstration");
  console.log("========================================");

  try {
    if (RESET) await resetDb();
    else {
      const existing = await db.select().from(schema.users).limit(1);
      if (existing.length > 0) {
        console.log("⚠️  Données existantes. Utiliser --reset pour écraser.");
        process.exit(0);
      }
    }

    // ── 1. UTILISATEURS ──────────────────────────────────────────────────────
    console.log("\n👥 Création des utilisateurs...");
    const users = await db.insert(schema.users).values([
      { email: "admin@labft.ma",        name: "Administrateur",        role: "admin"              as const, passwordHash: await bcrypt.hash("Admin2026!LabFT", 12), isActive: true },
      { email: "analyste@labft.ma",      name: "Youssef BENALI",        role: "analyst"            as const, passwordHash: await bcrypt.hash("Analyst2026!", 12),   isActive: true },
      { email: "superviseur@labft.ma",   name: "Fatima EZZAHRAOUI",     role: "supervisor"         as const, passwordHash: await bcrypt.hash("Superv2026!", 12),     isActive: true },
      { email: "compliance@labft.ma",    name: "Khalid MANSOURI",       role: "compliance_officer" as const, passwordHash: await bcrypt.hash("Compli2026!", 12),     isActive: true },
      { email: "demo@banque.ma",         name: "Demo Client Banque",    role: "analyst"            as const, passwordHash: await bcrypt.hash("Demo2026!", 12),       isActive: true },
    ]).returning();
    console.log(`   ✓ ${users.length} utilisateurs créés`);

    const uAnalyst = users[1]!;
    const uSupervisor = users[2]!;
    const uCo = users[3]!;

    // ── 2. CLIENTS ───────────────────────────────────────────────────────────
    console.log("\n🏦 Création des clients...");
    const customers = await db.insert(schema.customers).values([
      // [0] Mohammed ALAMI — LOW
      { customerId: `CLI-${uid()}`, firstName: "Mohammed", lastName: "ALAMI",
        email: "m.alami@gmail.com", phone: "+212661234501",
        dateOfBirth: "1978-03-15", nationality: "MA", residenceCountry: "MA",
        address: "12 Rue Ibn Batouta", city: "Casablanca",
        profession: "Ingénieur", employer: "OCP Group", sourceOfFunds: "Salaire",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "LOW" as const, riskScore: 12, pepStatus: false,
        sanctionStatus: "CLEAR" as const, lastReviewDate: daysAgo(90),
        nextReviewDate: daysAgo(-275), assignedAnalyst: uAnalyst.id },

      // [1] Aicha BERRADA — LOW
      { customerId: `CLI-${uid()}`, firstName: "Aicha", lastName: "BERRADA",
        email: "a.berrada@hotmail.com", phone: "+212662345602",
        dateOfBirth: "1985-07-22", nationality: "MA", residenceCountry: "MA",
        city: "Rabat", profession: "Médecin", employer: "CHU Rabat",
        sourceOfFunds: "Salaire",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "LOW" as const, riskScore: 8, pepStatus: false,
        sanctionStatus: "CLEAR" as const, lastReviewDate: daysAgo(45),
        assignedAnalyst: uAnalyst.id },

      // [2] Karim TAZI — MEDIUM
      { customerId: `CLI-${uid()}`, firstName: "Karim", lastName: "TAZI",
        email: "k.tazi@yahoo.fr", phone: "+212663456703",
        dateOfBirth: "1990-11-08", nationality: "MA", residenceCountry: "MA",
        city: "Fès", profession: "Commerçant", sourceOfFunds: "Commerce",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "MEDIUM" as const, riskScore: 35, pepStatus: false,
        sanctionStatus: "CLEAR" as const, lastReviewDate: daysAgo(60),
        assignedAnalyst: uAnalyst.id },

      // [3] Rachid BENSOUDA — PEP HIGH
      { customerId: `CLI-${uid()}`, firstName: "Rachid", lastName: "BENSOUDA",
        email: "r.bensouda@gov.ma", phone: "+212664567804",
        dateOfBirth: "1965-04-30", nationality: "MA", residenceCountry: "MA",
        address: "1 Avenue Mohamed V", city: "Rabat",
        profession: "Haut Fonctionnaire", employer: "Ministère des Finances",
        sourceOfFunds: "Salaire public",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "HIGH" as const, riskScore: 72, pepStatus: true,
        sanctionStatus: "CLEAR" as const, lastReviewDate: daysAgo(30),
        notes: "PEP — Directeur Général Trésorerie. Surveillance renforcée AMLD6.",
        assignedAnalyst: uAnalyst.id },

      // [4] Nadia EL FASSI — PEP HIGH
      { customerId: `CLI-${uid()}`, firstName: "Nadia", lastName: "EL FASSI",
        email: "n.elfassi@parlement.ma", nationality: "MA", residenceCountry: "MA",
        city: "Rabat", profession: "Députée", employer: "Parlement du Maroc",
        sourceOfFunds: "Indemnités parlementaires",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "HIGH" as const, riskScore: 68, pepStatus: true,
        sanctionStatus: "CLEAR" as const, lastReviewDate: daysAgo(15),
        notes: "PEP — Membre commission des finances.",
        assignedAnalyst: uAnalyst.id },

      // [5] Hassan QADIRI — CRITICAL
      { customerId: `CLI-${uid()}`, firstName: "Hassan", lastName: "QADIRI",
        email: "h.qadiri@protonmail.com", nationality: "MA", residenceCountry: "AE",
        city: "Dubai", profession: "Homme d'affaires", sourceOfFunds: "Investissements",
        customerType: "INDIVIDUAL" as const, kycStatus: "IN_REVIEW" as const,
        riskLevel: "CRITICAL" as const, riskScore: 91, pepStatus: false,
        sanctionStatus: "REVIEW" as const, lastReviewDate: daysAgo(5),
        notes: "Transactions multiples vers juridictions à risque.",
        assignedAnalyst: uAnalyst.id },

      // [6] MAROC IMPORT EXPORT — MEDIUM
      { customerId: `CLI-${uid()}`, firstName: "MAROC", lastName: "IMPORT EXPORT SARL",
        email: "contact@mie-sarl.ma", nationality: "MA", residenceCountry: "MA",
        city: "Casablanca", profession: "Commerce international",
        sourceOfFunds: "Activité commerciale",
        customerType: "CORPORATE" as const, kycStatus: "APPROVED" as const,
        riskLevel: "MEDIUM" as const, riskScore: 42, pepStatus: false,
        sanctionStatus: "CLEAR" as const, lastReviewDate: daysAgo(120),
        assignedAnalyst: uAnalyst.id },

      // [7] ATLAS HOLDING — HIGH
      { customerId: `CLI-${uid()}`, firstName: "ATLAS", lastName: "HOLDING SA",
        email: "direction@atlas-holding.ma", nationality: "MA", residenceCountry: "MA",
        city: "Casablanca", profession: "Holding — Immobilier",
        sourceOfFunds: "Revenus locatifs",
        customerType: "CORPORATE" as const, kycStatus: "APPROVED" as const,
        riskLevel: "HIGH" as const, riskScore: 65, pepStatus: false,
        sanctionStatus: "CLEAR" as const, lastReviewDate: daysAgo(20),
        notes: "Holding avec filiales dans 3 pays.",
        assignedAnalyst: uAnalyst.id },

      // [8] SHELL HOLDINGS BVI — CRITICAL
      { customerId: `CLI-${uid()}`, firstName: "SHELL", lastName: "HOLDINGS BVI LTD",
        email: "admin@shell-bvi.com", nationality: "VG", residenceCountry: "VG",
        city: "Tortola", profession: "Société offshore", sourceOfFunds: "Inconnu",
        customerType: "CORPORATE" as const, kycStatus: "PENDING" as const,
        riskLevel: "CRITICAL" as const, riskScore: 95, pepStatus: false,
        sanctionStatus: "REVIEW" as const, lastReviewDate: daysAgo(2),
        notes: "Société offshore BVI — bénéficiaire effectif non identifié.",
        assignedAnalyst: uAnalyst.id },

      // [9] CASABLANCA FINANCE — LOW
      { customerId: `CLI-${uid()}`, firstName: "CASABLANCA", lastName: "FINANCE GROUP",
        email: "compliance@cfg-bank.ma", nationality: "MA", residenceCountry: "MA",
        city: "Casablanca", profession: "Services financiers",
        sourceOfFunds: "Activité bancaire",
        customerType: "CORPORATE" as const, kycStatus: "APPROVED" as const,
        riskLevel: "LOW" as const, riskScore: 15, pepStatus: false,
        sanctionStatus: "CLEAR" as const, lastReviewDate: daysAgo(180) },

      // [10] Sara BENKIRANE — LOW
      { customerId: `CLI-${uid()}`, firstName: "Sara", lastName: "BENKIRANE",
        email: "s.benkirane@gmail.com", nationality: "MA", residenceCountry: "MA",
        city: "Marrakech", profession: "Architecte", sourceOfFunds: "Salaire",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "LOW" as const, riskScore: 10, pepStatus: false,
        sanctionStatus: "CLEAR" as const },

      // [11] Omar CHRAIBI — MEDIUM (résident France)
      { customerId: `CLI-${uid()}`, firstName: "Omar", lastName: "CHRAIBI",
        email: "o.chraibi@outlook.com", nationality: "MA", residenceCountry: "FR",
        city: "Paris", profession: "Entrepreneur", sourceOfFunds: "Dividendes",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "MEDIUM" as const, riskScore: 38, pepStatus: false,
        sanctionStatus: "CLEAR" as const,
        notes: "Résident France — transferts fréquents Maroc.",
        assignedAnalyst: uAnalyst.id },

      // [12] Zineb MOUSSAOUI — LOW
      { customerId: `CLI-${uid()}`, firstName: "Zineb", lastName: "MOUSSAOUI",
        email: "z.moussaoui@labft.ma", nationality: "MA", residenceCountry: "MA",
        city: "Agadir", profession: "Directrice commerciale", sourceOfFunds: "Salaire",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "LOW" as const, riskScore: 7, pepStatus: false,
        sanctionStatus: "CLEAR" as const },

      // [13] Yassine HAFIDI — HIGH
      { customerId: `CLI-${uid()}`, firstName: "Yassine", lastName: "HAFIDI",
        email: "y.hafidi@proton.me", nationality: "MA", residenceCountry: "MA",
        city: "Casablanca", profession: "Consultant", sourceOfFunds: "Honoraires",
        customerType: "INDIVIDUAL" as const, kycStatus: "IN_REVIEW" as const,
        riskLevel: "HIGH" as const, riskScore: 74, pepStatus: false,
        sanctionStatus: "CLEAR" as const,
        notes: "Flux financiers inhabituels.",
        assignedAnalyst: uAnalyst.id },

      // [14] GREEN ENERGY — LOW
      { customerId: `CLI-${uid()}`, firstName: "GREEN", lastName: "ENERGY MAROC SARL",
        email: "finance@green-energy.ma", nationality: "MA", residenceCountry: "MA",
        city: "Casablanca", profession: "Énergie renouvelable",
        sourceOfFunds: "Contrats",
        customerType: "CORPORATE" as const, kycStatus: "APPROVED" as const,
        riskLevel: "LOW" as const, riskScore: 18, pepStatus: false,
        sanctionStatus: "CLEAR" as const },

      // [15] Ibrahim DIALLO — MEDIUM (Sénégalais)
      { customerId: `CLI-${uid()}`, firstName: "Ibrahim", lastName: "DIALLO",
        email: "i.diallo@gmail.com", nationality: "SN", residenceCountry: "MA",
        city: "Casablanca", profession: "Commerçant", sourceOfFunds: "Commerce textile",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "MEDIUM" as const, riskScore: 44, pepStatus: false,
        sanctionStatus: "CLEAR" as const },

      // [16] Meryem LAHLOU — LOW
      { customerId: `CLI-${uid()}`, firstName: "Meryem", lastName: "LAHLOU",
        email: "m.lahlou@hotmail.fr", nationality: "MA", residenceCountry: "MA",
        city: "Casablanca", profession: "Pharmacienne", sourceOfFunds: "Salaire",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "LOW" as const, riskScore: 9, pepStatus: false,
        sanctionStatus: "CLEAR" as const },

      // [17] Abdelkader ZIANI — MEDIUM (Algérien)
      { customerId: `CLI-${uid()}`, firstName: "Abdelkader", lastName: "ZIANI",
        email: "a.ziani@gmail.com", nationality: "DZ", residenceCountry: "DZ",
        city: "Alger", profession: "Importateur", sourceOfFunds: "Commerce",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "MEDIUM" as const, riskScore: 45, pepStatus: false,
        sanctionStatus: "CLEAR" as const },

      // [18] TECH INVEST — MEDIUM
      { customerId: `CLI-${uid()}`, firstName: "TECH", lastName: "INVEST SARL",
        email: "gestion@tech-invest.ma", nationality: "MA", residenceCountry: "MA",
        city: "Rabat", profession: "Capital-risque", sourceOfFunds: "Investissements",
        customerType: "CORPORATE" as const, kycStatus: "APPROVED" as const,
        riskLevel: "MEDIUM" as const, riskScore: 40, pepStatus: false,
        sanctionStatus: "CLEAR" as const },

      // [19] Hamid OUALI — HIGH
      { customerId: `CLI-${uid()}`, firstName: "Hamid", lastName: "OUALI",
        email: "h.ouali@yahoo.fr", nationality: "MA", residenceCountry: "MA",
        city: "Tanger", profession: "Armateur", sourceOfFunds: "Transport maritime",
        customerType: "INDIVIDUAL" as const, kycStatus: "APPROVED" as const,
        riskLevel: "HIGH" as const, riskScore: 70, pepStatus: false,
        sanctionStatus: "CLEAR" as const,
        notes: "Activité portuaire — surveillance flux cash.",
        assignedAnalyst: uAnalyst.id },
    ] as any).returning();
    console.log(`   ✓ ${customers.length} clients créés`);

    // Raccourcis par index — ordre garanti
    const cAlami    = customers[0]!;
    const cBerrada  = customers[1]!;
    const cTazi     = customers[2]!;
    const cBensouda = customers[3]!;
    const cQadiri   = customers[5]!;
    const cMie      = customers[6]!;
    const cAtlas    = customers[7]!;
    const cShell    = customers[8]!;
    const cChraibi  = customers[11]!;
    const cHafidi   = customers[13]!;

    // ── 3. TRANSACTIONS ──────────────────────────────────────────────────────
    console.log("\n💸 Création des transactions...");
    const transactions = await db.insert(schema.transactions).values([
      // Qadiri — virement massif BVI (CRITIQUE)
      { transactionId: txId(), customerId: cQadiri.id,
        amount: "485000.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "ONLINE" as const,
        counterparty: "Shell Holdings BVI Ltd", counterpartyCountry: "VG",
        counterpartyBank: "VP Bank BVI",
        purpose: "Prestation de conseil international",
        riskScore: 94, status: "FLAGGED" as const, isSuspicious: true,
        flagReason: "HIGH_AMOUNT + HIGH_RISK_COUNTRY",
        transactionDate: hoursAgo(2) },

      // Qadiri — structuring x3
      { transactionId: txId(), customerId: cQadiri.id,
        amount: "9800.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "ONLINE" as const,
        counterparty: "Hassan Qadiri Jr", purpose: "Virement famille",
        riskScore: 72, status: "FLAGGED" as const, isSuspicious: true,
        flagReason: "STRUCTURING_PATTERN", transactionDate: hoursAgo(6) },

      { transactionId: txId(), customerId: cQadiri.id,
        amount: "9500.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "MOBILE" as const,
        counterparty: "Hassan Qadiri Jr", purpose: "Virement famille",
        riskScore: 72, status: "FLAGGED" as const, isSuspicious: true,
        flagReason: "STRUCTURING_PATTERN", transactionDate: hoursAgo(12) },

      { transactionId: txId(), customerId: cQadiri.id,
        amount: "9200.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "BRANCH" as const,
        counterparty: "Hassan Qadiri Jr", purpose: "Virement famille",
        riskScore: 72, status: "FLAGGED" as const, isSuspicious: true,
        flagReason: "STRUCTURING_PATTERN", transactionDate: daysAgo(1) },

      // Shell — dépôt bloqué
      { transactionId: txId(), customerId: cShell.id,
        amount: "250000.00", currency: "MAD",
        transactionType: "DEPOSIT" as const, channel: "BRANCH" as const,
        purpose: "Apport en capital",
        riskScore: 95, status: "BLOCKED" as const, isSuspicious: true,
        flagReason: "UNVERIFIED_SOURCE + KYC_PENDING",
        transactionDate: daysAgo(1) },

      // Hafidi — virements Caïmans
      { transactionId: txId(), customerId: cHafidi.id,
        amount: "75000.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "ONLINE" as const,
        counterparty: "Offshore Ventures Ltd", counterpartyCountry: "KY",
        purpose: "Services consulting",
        riskScore: 82, status: "FLAGGED" as const, isSuspicious: true,
        flagReason: "HIGH_AMOUNT + HIGH_RISK_COUNTRY", transactionDate: daysAgo(3) },

      { transactionId: txId(), customerId: cHafidi.id,
        amount: "68000.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "ONLINE" as const,
        counterparty: "Offshore Ventures Ltd", counterpartyCountry: "KY",
        purpose: "Services consulting",
        riskScore: 80, status: "FLAGGED" as const, isSuspicious: true,
        flagReason: "HIGH_AMOUNT + HIGH_RISK_COUNTRY", transactionDate: daysAgo(7) },

      // Bensouda PEP — Suisse
      { transactionId: txId(), customerId: cBensouda.id,
        amount: "150000.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "API" as const,
        counterparty: "Swiss Private Bank", counterpartyCountry: "CH",
        counterpartyBank: "Credit Suisse Zurich", purpose: "Placement épargne",
        riskScore: 75, status: "FLAGGED" as const, isSuspicious: true,
        flagReason: "PEP_TRANSACTION + HIGH_AMOUNT", transactionDate: daysAgo(5) },

      // Atlas — offshore
      { transactionId: txId(), customerId: cAtlas.id,
        amount: "320000.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "API" as const,
        counterparty: "Atlas Real Estate BVI", counterpartyCountry: "VG",
        purpose: "Acquisition immobilière offshore",
        riskScore: 88, status: "FLAGGED" as const, isSuspicious: true,
        flagReason: "HIGH_AMOUNT + CORPORATE_OFFSHORE", transactionDate: daysAgo(2) },

      // Transactions NORMALES
      { transactionId: txId(), customerId: cAlami.id,
        amount: "12500.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "ONLINE" as const,
        counterparty: "Fatima Alami", purpose: "Loyer mensuel",
        riskScore: 5, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(2) },

      { transactionId: txId(), customerId: cAlami.id,
        amount: "3200.00", currency: "MAD",
        transactionType: "PAYMENT" as const, channel: "MOBILE" as const,
        purpose: "Courses alimentaires",
        riskScore: 2, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(3) },

      { transactionId: txId(), customerId: cBerrada.id,
        amount: "8500.00", currency: "MAD",
        transactionType: "PAYMENT" as const, channel: "ONLINE" as const,
        purpose: "Matériel médical",
        riskScore: 4, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(1) },

      { transactionId: txId(), customerId: cTazi.id,
        amount: "45000.00", currency: "MAD",
        transactionType: "PAYMENT" as const, channel: "BRANCH" as const,
        purpose: "Stock marchandises",
        riskScore: 22, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(6) },

      { transactionId: txId(), customerId: cChraibi.id,
        amount: "35000.00", currency: "EUR",
        transactionType: "TRANSFER" as const, channel: "API" as const,
        counterparty: "Mohammed Chraibi", counterpartyCountry: "MA",
        purpose: "Transfert familial Maroc",
        riskScore: 18, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(8) },

      { transactionId: txId(), customerId: cMie.id,
        amount: "820000.00", currency: "MAD",
        transactionType: "PAYMENT" as const, channel: "API" as const,
        counterparty: "Guangdong Trading Co", counterpartyCountry: "CN",
        purpose: "Paiement marchandises import",
        riskScore: 28, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(4) },

      { transactionId: txId(), customerId: cAlami.id,
        amount: "25000.00", currency: "MAD",
        transactionType: "DEPOSIT" as const, channel: "ATM" as const,
        purpose: "Dépôt salaire",
        riskScore: 3, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(10) },

      { transactionId: txId(), customerId: cAlami.id,
        amount: "12000.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "ONLINE" as const,
        purpose: "Loyer mensuel",
        riskScore: 5, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(32) },

      { transactionId: txId(), customerId: cBerrada.id,
        amount: "2500.00", currency: "MAD",
        transactionType: "WITHDRAWAL" as const, channel: "ATM" as const,
        purpose: "Retrait espèces",
        riskScore: 2, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(4) },

      { transactionId: txId(), customerId: cTazi.id,
        amount: "15000.00", currency: "MAD",
        transactionType: "TRANSFER" as const, channel: "ONLINE" as const,
        purpose: "Virement compte pro",
        riskScore: 14, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(12) },

      { transactionId: txId(), customerId: cMie.id,
        amount: "1200000.00", currency: "MAD",
        transactionType: "PAYMENT" as const, channel: "API" as const,
        counterparty: "Turkish Textile Ltd", counterpartyCountry: "TR",
        purpose: "Import textiles Q4",
        riskScore: 30, status: "COMPLETED" as const, isSuspicious: false,
        transactionDate: daysAgo(45) },
    ] as any).returning();
    console.log(`   ✓ ${transactions.length} transactions créées`);
    console.log(`   ↳ ${transactions.filter((t: any) => t.isSuspicious).length} suspectes`);

    // ── 4. ALERTES ───────────────────────────────────────────────────────────
    console.log("\n🚨 Création des alertes...");
    const suspTx = transactions.filter((t: any) => t.isSuspicious);
    const alerts = await db.insert(schema.alerts).values([
      { alertId: altId(), customerId: cQadiri.id,
        transactionId: suspTx[0]?.id ?? null,
        scenario: "HIGH_AMOUNT + HIGH_RISK_COUNTRY + STRUCTURING",
        alertType: "THRESHOLD" as const, priority: "CRITICAL" as const,
        status: "OPEN" as const, riskScore: 94,
        reason: "Virement 485 000 MAD vers BVI — 3 règles FATF. Structuring détecté.",
        createdAt: hoursAgo(2) },

      { alertId: altId(), customerId: cShell.id,
        transactionId: suspTx[4]?.id ?? null,
        scenario: "UNVERIFIED_SOURCE + KYC_PENDING",
        alertType: "PATTERN" as const, priority: "CRITICAL" as const,
        status: "IN_REVIEW" as const, riskScore: 95,
        reason: "Transaction bloquée — société BVI, KYC non finalisé.",
        assignedTo: uSupervisor.id, createdAt: daysAgo(1) },

      { alertId: altId(), customerId: cHafidi.id,
        transactionId: suspTx[5]?.id ?? null,
        scenario: "HIGH_AMOUNT + HIGH_RISK_COUNTRY + VOLUME_SPIKE",
        alertType: "FRAUD" as const, priority: "HIGH" as const,
        status: "OPEN" as const, riskScore: 82,
        reason: "Deux virements vers Caïmans en 4 jours (143 000 MAD). Volume +340%.",
        assignedTo: uAnalyst.id, createdAt: daysAgo(3) },

      { alertId: altId(), customerId: cBensouda.id,
        transactionId: suspTx[7]?.id ?? null,
        scenario: "PEP_TRANSACTION + HIGH_AMOUNT",
        alertType: "THRESHOLD" as const, priority: "HIGH" as const,
        status: "IN_REVIEW" as const, riskScore: 75,
        reason: "Client PEP — virement 150 000 MAD vers Suisse.",
        assignedTo: uSupervisor.id, createdAt: daysAgo(5) },

      { alertId: altId(), customerId: cAtlas.id,
        transactionId: suspTx[8]?.id ?? null,
        scenario: "HIGH_AMOUNT + CORPORATE_OFFSHORE",
        alertType: "THRESHOLD" as const, priority: "HIGH" as const,
        status: "OPEN" as const, riskScore: 88,
        reason: "Virement 320 000 MAD vers entité liée offshore BVI.",
        createdAt: daysAgo(2) },

      { alertId: altId(), customerId: cQadiri.id,
        transactionId: suspTx[1]?.id ?? null,
        scenario: "STRUCTURING_PATTERN",
        alertType: "VELOCITY" as const, priority: "MEDIUM" as const,
        status: "OPEN" as const, riskScore: 72,
        reason: "3 virements sous seuil (9 200–9 800 MAD) en 24h.",
        createdAt: daysAgo(1) },

      { alertId: altId(), customerId: cTazi.id,
        scenario: "HIGH_FREQUENCY",
        alertType: "VELOCITY" as const, priority: "MEDIUM" as const,
        status: "CLOSED" as const, riskScore: 45,
        reason: "Fréquence anormale — 8 paiements en 2 jours.",
        assignedTo: uAnalyst.id,
        resolvedAt: daysAgo(3),
        resolutionNote: "Activité légitime — fin de saison commerciale.",
        createdAt: daysAgo(8) },

      { alertId: altId(), customerId: cChraibi.id,
        scenario: "FOREIGN_TRANSFER",
        alertType: "PATTERN" as const, priority: "LOW" as const,
        status: "FALSE_POSITIVE" as const, riskScore: 28,
        reason: "Transfert vers Maroc — vérification origine des fonds.",
        assignedTo: uAnalyst.id,
        resolvedAt: daysAgo(5),
        resolutionNote: "Virement familial confirmé. Faux positif.",
        createdAt: daysAgo(10) },
    ] as any).returning();
    console.log(`   ✓ ${alerts.length} alertes créées`);

    // ── 5. DOSSIERS ──────────────────────────────────────────────────────────
    console.log("\n📁 Création des dossiers...");
    await db.insert(schema.cases).values([
      { caseId: cId(), customerId: cQadiri.id,
        title: "Investigation — Transactions offshore QADIRI Hassan",
        description: "Virements vers BVI/Panama. Structuring détecté. SAR en préparation.",
        severity: "CRITICAL" as const, status: "OPEN" as const,
        assignedTo: uSupervisor.id, createdBy: uAnalyst.id,
        dueDate: daysAgo(-5), createdAt: hoursAgo(3) },

      { caseId: cId(), customerId: cShell.id,
        title: "KYC Renforcé — Shell Holdings BVI Ltd",
        description: "Bénéficiaire effectif non identifié. Transaction bloquée.",
        severity: "CRITICAL" as const, status: "UNDER_INVESTIGATION" as const,
        assignedTo: uCo.id, createdBy: uSupervisor.id,
        dueDate: daysAgo(-3), createdAt: daysAgo(1) },

      { caseId: cId(), customerId: cHafidi.id,
        title: "Surveillance — Flux inhabituels HAFIDI",
        description: "Variation volume +340%. Virements Caïmans.",
        severity: "HIGH" as const, status: "UNDER_INVESTIGATION" as const,
        assignedTo: uAnalyst.id, createdBy: uAnalyst.id,
        dueDate: daysAgo(-10), createdAt: daysAgo(3) },

      { caseId: cId(), customerId: cBensouda.id,
        title: "Revue annuelle PEP — BENSOUDA Rachid",
        description: "Revue annuelle obligatoire client PEP.",
        severity: "MEDIUM" as const, status: "OPEN" as const,
        assignedTo: uCo.id, createdBy: uCo.id,
        dueDate: daysAgo(-15), createdAt: daysAgo(5) },
    ] as any);
    console.log("   ✓ 4 dossiers créés");

    // ── 6. SCREENING ─────────────────────────────────────────────────────────
    console.log("\n🔍 Création des résultats de screening...");
    await db.insert(schema.screeningResults).values([
      { customerId: cShell.id,
        screeningType: "SANCTIONS" as const, status: "REVIEW" as const,
        matchScore: 72, matchedEntity: "Shell Holdings International (UE 2021)",
        listSource: "EU Consolidated List", confidenceScore: 72,
        decision: "PENDING" as const, createdAt: daysAgo(2) },

      { customerId: cQadiri.id,
        screeningType: "SANCTIONS" as const, status: "REVIEW" as const,
        matchScore: 58, matchedEntity: "Qadiri Hassan Akbar (OFAC SDN)",
        listSource: "OFAC SDN List", confidenceScore: 58,
        decision: "PENDING" as const, createdAt: hoursAgo(3) },

      { customerId: cAlami.id,
        screeningType: "SANCTIONS" as const, status: "CLEAR" as const,
        matchScore: 0, matchedEntity: null, listSource: "OFAC SDN List",
        confidenceScore: 0, decision: "CONFIRMED" as const, createdAt: daysAgo(90) },

      { customerId: cBerrada.id,
        screeningType: "SANCTIONS" as const, status: "CLEAR" as const,
        matchScore: 0, matchedEntity: null, listSource: "EU Consolidated List",
        confidenceScore: 0, decision: "CONFIRMED" as const, createdAt: daysAgo(45) },

      { customerId: cTazi.id,
        screeningType: "SANCTIONS" as const, status: "CLEAR" as const,
        matchScore: 12, matchedEntity: null, listSource: "UN Consolidated List",
        confidenceScore: 12, decision: "CONFIRMED" as const, createdAt: daysAgo(60) },

      { customerId: cAtlas.id,
        screeningType: "SANCTIONS" as const, status: "CLEAR" as const,
        matchScore: 5, matchedEntity: null, listSource: "UK HM Treasury",
        confidenceScore: 5, decision: "CONFIRMED" as const, createdAt: daysAgo(20) },
    ] as any);
    console.log("   ✓ 6 résultats de screening créés");

    // ── RÉSUMÉ ───────────────────────────────────────────────────────────────
    console.log("\n========================================");
    console.log("✅ Seed terminé avec succès !");
    console.log("\n🔐 Connexion :");
    console.log("   URL      : http://localhost:5173/login");
    console.log("   Email    : admin@labft.ma");
    console.log("   Password : Admin2026!LabFT");
    console.log("\n🔗 Premier client ID pour webhook :");
    console.log(`   customerId : ${cAlami.id} (Mohammed ALAMI)`);
    console.log(`   curl -X POST http://localhost:3000/webhooks/transaction \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"transactionId":"TEST-001","customerId":${cAlami.id},"amount":"50000","currency":"MAD","transactionType":"TRANSFER","timestamp":${Date.now()}}'`);

  } catch (err) {
    console.error("\n❌ Erreur seed :", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
