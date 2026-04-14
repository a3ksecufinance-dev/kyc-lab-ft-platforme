/**
 * Import global de transactions wallet — fichier multi-wallets
 *
 * Workflow :
 *   1. Parser le CSV (colonnes : phone/msisdn, date, amount, type, …)
 *   2. Grouper les lignes par numéro de téléphone
 *   3. Pour chaque groupe :
 *        a. Chercher le wallet existant par phoneNumber / msisdn
 *        b. Si introuvable → créer le wallet (ALLEGED, provider détecté)
 *        c. Insérer les transactions avec walletId
 *        d. Déclencher AML fire-and-forget
 *   4. Retourner un rapport groupé par wallet
 *
 * Colonnes CSV détectées automatiquement :
 *   phone / msisdn / subscriber / telephone / numero
 *   date / amount / type / currency / counterparty / reference
 *
 * Formats opérateurs reconnus :
 *   Orange Money : colonne "msisdn" ou "subscriber_msisdn"
 *   Wave         : colonne "phone" ou "wallet_id"
 *   Générique    : colonne "phone" ou "telephone"
 */

import { nanoid }    from "nanoid";
import { eq, inArray, and } from "drizzle-orm";
import { db }        from "../../_core/db";
import { wallets, transactions, customers } from "../../../drizzle/schema";
import type { ImportedTransaction } from "../transactions/transactions.import";
import { runDynamicAmlRules } from "../aml/aml-rules.engine";
import { runAmlRules }         from "../aml/aml.engine";
import { findCustomerById }    from "../customers/customers.repository";
import { createLogger }        from "../../_core/logger";

const log = createLogger("wallets-bulk-import");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BulkImportInput {
  content:    string;
  provider?:  string;  // "ORANGE_MONEY" | "WAVE" | "INTERNAL" — auto-détecté si absent
  currency?:  string;
  dryRun?:    boolean;
}

export interface WalletImportGroup {
  phone:       string;
  walletId:    string | null;    // null si non existant (sera créé)
  action:      "found" | "created" | "skipped";
  txCount:     number;
  inserted:    number;
  duplicates:  number;
  totalAmount: number;
  currency:    string;
  errors:      string[];
}

export interface BulkImportReport {
  format:       string;
  totalRows:    number;
  parsedRows:   number;
  walletsFound: number;
  walletsCreated: number;
  walletsSkipped: number;
  totalInserted:  number;
  groups:         WalletImportGroup[];
  errors:         Array<{ line: number; error: string }>;
}

// ─── Détection du séparateur et des colonnes ─────────────────────────────────

function detectSep(header: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "|": 0, "\t": 0 };
  for (const sep of Object.keys(counts)) {
    counts[sep] = (header.match(new RegExp("\\" + sep, "g")) ?? []).length;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",";
}

function normalize(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCol(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.findIndex(h => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

function parseAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(/\s/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
  return isNaN(n) || n <= 0 ? null : n;
}

function parseDate(raw: string): Date | null {
  const s = raw.trim().replace(/\./g, "/");
  for (const fmt of [
    /^(\d{4})-(\d{2})-(\d{2})/,
    /^(\d{2})\/(\d{2})\/(\d{4})/,
    /^(\d{4})(\d{2})(\d{2})$/,
  ]) {
    const m = s.match(fmt);
    if (m) {
      const [, a, b, c] = m;
      const iso = fmt.source.startsWith("^(\\d{4})")
        ? `${a}-${b}-${c}` : `${c}-${b}-${a}`;
      const d = new Date(iso!);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const f = new Date(raw.trim());
  return isNaN(f.getTime()) ? null : f;
}

function inferType(t?: string, p?: string): ImportedTransaction["transactionType"] {
  const s = (t ?? p ?? "").toLowerCase();
  if (s.includes("vir") || s.includes("transfer")) return "TRANSFER";
  if (s.includes("depot") || s.includes("deposit") || s.includes("credit")) return "DEPOSIT";
  if (s.includes("retrait") || s.includes("withdraw")) return "WITHDRAWAL";
  return "PAYMENT";
}

function detectProvider(headers: string[]): string {
  const h = headers.join(",");
  if (h.includes("orange") || h.includes("msisdn")) return "ORANGE_MONEY";
  if (h.includes("wave") || h.includes("wallet_id")) return "WAVE";
  return "INTERNAL";
}

// ─── Parser CSV multi-wallets ─────────────────────────────────────────────────

interface ParsedRow {
  phone:       string;
  amount:      string;
  currency:    string;
  date:        Date;
  type:        ImportedTransaction["transactionType"];
  counterparty?: string;
  purpose?:    string;
  ref:         string;
  rawLine:     string;
}

function parseBulkCsv(content: string, defaultCurrency = "MAD"): {
  rows: ParsedRow[];
  errors: Array<{ line: number; error: string }>;
  format: string;
  provider: string;
} {
  const lines  = content.split("\n").map(l => l.trim()).filter(Boolean);
  const errors: Array<{ line: number; error: string }> = [];

  if (lines.length < 2) {
    return { rows: [], errors: [{ line: 0, error: "Fichier vide" }], format: "csv", provider: "INTERNAL" };
  }

  const sep     = detectSep(lines[0]!);
  const headers = lines[0]!.split(sep).map(h => normalize(h.replace(/"/g, "")));
  const provider = detectProvider(headers);

  const cols = {
    phone:        findCol(headers, "phone", "msisdn", "subscribermsisdn", "telephone", "numero", "walletid"),
    date:         findCol(headers, "date", "transactiondate", "datum"),
    amount:       findCol(headers, "amount", "montant", "betrag"),
    currency:     findCol(headers, "currency", "devise"),
    type:         findCol(headers, "type", "transactiontype", "nature"),
    counterparty: findCol(headers, "counterparty", "contrepartie", "beneficiaire", "tiers"),
    reference:    findCol(headers, "reference", "ref", "transactionid", "id"),
    purpose:      findCol(headers, "purpose", "motif", "libelle", "description"),
  };

  if (cols.phone < 0) {
    errors.push({ line: 1, error: "Colonne téléphone/MSISDN introuvable (phone, msisdn, telephone, numero)" });
    return { rows: [], errors, format: "csv", provider };
  }
  if (cols.amount < 0) {
    errors.push({ line: 1, error: "Colonne montant introuvable (amount, montant)" });
    return { rows: [], errors, format: "csv", provider };
  }

  const rows: ParsedRow[] = [];
  const MAX = 5000;
  const total = Math.min(lines.length - 1, MAX);

  for (let i = 1; i <= total; i++) {
    const cells = lines[i]!.split(sep).map(c => c.replace(/^"|"$/g, "").trim());
    try {
      const rawPhone = cells[cols.phone] ?? "";
      const phone    = rawPhone.replace(/\s/g, "").replace(/^00/, "+");
      if (!phone) { errors.push({ line: i + 1, error: "Téléphone vide" }); continue; }

      const rawAmt = cells[cols.amount] ?? "";
      const amt    = parseAmount(rawAmt);
      if (!amt) { errors.push({ line: i + 1, error: `Montant invalide: "${rawAmt}"` }); continue; }

      const rawDate = cols.date >= 0 ? cells[cols.date] : undefined;
      const date    = rawDate ? parseDate(rawDate) : new Date();
      if (!date) { errors.push({ line: i + 1, error: `Date invalide: "${rawDate}"` }); continue; }

      const currency    = (cols.currency >= 0 ? cells[cols.currency] : undefined) || defaultCurrency;
      const typeStr     = cols.type >= 0 ? cells[cols.type] : undefined;
      const counterparty = cols.counterparty >= 0 ? cells[cols.counterparty] : undefined;
      const purpose     = cols.purpose >= 0 ? cells[cols.purpose] : undefined;
      const ref         = (cols.reference >= 0 ? cells[cols.reference] : undefined)
        || `${phone}|${date.toISOString().slice(0, 10)}|${amt.toFixed(2)}`;

      rows.push({
        phone,
        amount:      amt.toFixed(2),
        currency:    currency.toUpperCase().slice(0, 3),
        date,
        type:        inferType(typeStr, purpose),
        ...(counterparty ? { counterparty } : {}),
        ...(purpose      ? { purpose }      : {}),
        ref,
        rawLine: lines[i]!,
      });
    } catch (err) {
      errors.push({ line: i + 1, error: String(err) });
    }
  }

  return { rows, errors, format: "csv", provider };
}

// ─── Import principal ─────────────────────────────────────────────────────────

export async function bulkImportWalletTransactions(input: BulkImportInput): Promise<BulkImportReport> {
  // 1. Essayer le parser CSV multi-wallets
  const { rows, errors: parseErrors, format, provider: detectedProvider } = parseBulkCsv(
    input.content,
    input.currency ?? "MAD"
  );

  const provider = input.provider ?? detectedProvider;

  const report: BulkImportReport = {
    format,
    totalRows:      rows.length + parseErrors.length,
    parsedRows:     rows.length,
    walletsFound:   0,
    walletsCreated: 0,
    walletsSkipped: 0,
    totalInserted:  0,
    groups:         [],
    errors:         parseErrors,
  };

  if (rows.length === 0) return report;

  // 2. Grouper par numéro de téléphone
  const grouped = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    if (!grouped.has(row.phone)) grouped.set(row.phone, []);
    grouped.get(row.phone)!.push(row);
  }

  // 3. Charger tous les wallets existants correspondant aux numéros détectés
  const phones = Array.from(grouped.keys());
  const existingWallets = await db.select({
    id: wallets.id, walletId: wallets.walletId, phoneNumber: wallets.phoneNumber,
    msisdn: wallets.msisdn, customerId: wallets.customerId, currency: wallets.currency,
  })
    .from(wallets)
    .where(inArray(wallets.phoneNumber, phones));

  // Index par phoneNumber
  const walletByPhone = new Map(existingWallets.map(w => [w.phoneNumber, w]));
  // Fallback sur msisdn
  const walletByMsisdn = new Map(existingWallets.map(w => [w.msisdn, w]));

  // 4. Trouver un customer "générique" pour les wallets sans client connu
  // On prend le premier customer approuvé comme fallback (ou null si dryRun)
  let fallbackCustomerId: number | null = null;
  if (!input.dryRun) {
    const [fc] = await db.select({ id: customers.id })
      .from(customers)
      .where(eq(customers.kycStatus, "APPROVED"))
      .limit(1);
    fallbackCustomerId = fc?.id ?? null;
  }

  // 5. Traiter chaque groupe
  for (const [phone, txRows] of grouped) {
    const group: WalletImportGroup = {
      phone,
      walletId:    null,
      action:      "skipped",
      txCount:     txRows.length,
      inserted:    0,
      duplicates:  0,
      totalAmount: txRows.reduce((s, r) => s + parseFloat(r.amount), 0),
      currency:    txRows[0]?.currency ?? input.currency ?? "MAD",
      errors:      [],
    };

    // Trouver le wallet existant
    let wallet = walletByPhone.get(phone) ?? walletByMsisdn.get(phone) ?? null;

    if (wallet) {
      group.walletId = wallet.walletId;
      group.action   = "found";
      report.walletsFound++;
    } else {
      // Créer le wallet si on a un customer fallback
      if (!input.dryRun && fallbackCustomerId) {
        try {
          const newWalletId = `WAL-${nanoid(10).toUpperCase()}`;
          const [created] = await db.insert(wallets).values({
            walletId:    newWalletId,
            customerId:  fallbackCustomerId,
            provider,
            phoneNumber: phone,
            msisdn:      phone.replace(/^\+/, ""),
            currency:    group.currency,
            kycTier:     "ALLEGED",
            balance:     "0",
            isActive:    true,
            isDormant:   false,
          }).returning();
          if (created) {
            wallet = { id: created.id, walletId: created.walletId, phoneNumber: created.phoneNumber, msisdn: created.msisdn, customerId: created.customerId, currency: created.currency };
            group.walletId = created.walletId;
            group.action   = "created";
            report.walletsCreated++;
          }
        } catch (err) {
          group.errors.push(`Création wallet échouée : ${String(err)}`);
          group.action = "skipped";
          report.walletsSkipped++;
          report.groups.push(group);
          continue;
        }
      } else {
        // dry run ou pas de customer disponible
        group.action   = input.dryRun ? "created" : "skipped";
        group.walletId = `(nouveau)`;
        if (!input.dryRun) report.walletsSkipped++;
        if (input.dryRun) report.walletsCreated++;
        report.groups.push(group);
        continue;
      }
    }

    if (input.dryRun) {
      report.groups.push(group);
      continue;
    }

    // 6. Déduplication
    const refs    = txRows.map(r => `BULK-${r.ref.slice(0, 30)}`);
    const existing = await db.select({ transactionId: transactions.transactionId })
      .from(transactions)
      .where(and(inArray(transactions.transactionId, refs)));
    const existingSet = new Set(existing.map(e => e.transactionId));

    const toInsert = txRows.filter(r => !existingSet.has(`BULK-${r.ref.slice(0, 30)}`));
    group.duplicates = txRows.length - toInsert.length;

    if (toInsert.length === 0) {
      report.groups.push(group);
      continue;
    }

    // 7. Récupérer le customer pour l'AML
    const customer = wallet?.customerId ? await findCustomerById(wallet.customerId) : null;

    // 8. Insérer par lots
    const BATCH = 100;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const values = batch.map(r => ({
        transactionId:    `BULK-${r.ref.slice(0, 30)}-${nanoid(4).toUpperCase()}`,
        customerId:       wallet!.customerId,
        walletId:         wallet!.id,
        amount:           r.amount,
        currency:         r.currency,
        transactionType:  r.type,
        channel:          "MOBILE" as const,
        counterparty:     r.counterparty ?? null,
        purpose:          r.purpose      ?? null,
        riskScore:        0,
        status:           "COMPLETED" as const,
        isSuspicious:     false,
        transactionDate:  r.date,
      }));

      const inserted = await db.insert(transactions).values(values).returning();
      group.inserted += inserted.length;
      report.totalInserted += inserted.length;

      if (customer) {
        for (const tx of inserted) {
          runDynamicAmlRules(tx, customer).catch(() =>
            runAmlRules(tx, customer).catch(() => {})
          );
        }
      }
    }

    // Mise à jour lastActivityAt
    await db.update(wallets)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(wallets.id, wallet!.id));

    report.groups.push(group);
  }

  log.info({
    walletsFound:   report.walletsFound,
    walletsCreated: report.walletsCreated,
    totalInserted:  report.totalInserted,
  }, "Import global terminé");

  return report;
}
