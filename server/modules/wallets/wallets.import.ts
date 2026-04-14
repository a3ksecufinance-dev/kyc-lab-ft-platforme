/**
 * Import de transactions wallet en lot
 *
 * Formats supportés :
 *   - CSV générique (séparateur auto-détecté)
 *   - Orange Money CSV (format export opérateur)
 *   - Wave CSV (format export opérateur)
 *   - SWIFT MT940
 *
 * Fonctionnement :
 *   1. Parser le fichier → transactions brutes
 *   2. Filtrer les doublons (externalRef déjà en base)
 *   3. Insérer en base avec walletId + customerId
 *   4. Déclencher les règles AML (fire-and-forget)
 *   5. Retourner le rapport d'import
 */

import { nanoid }    from "nanoid";
import { eq, inArray } from "drizzle-orm";
import { db }        from "../../_core/db";
import { transactions, wallets } from "../../../drizzle/schema";
import { parseTransactionFile, type ImportedTransaction, type ImportResult } from "../transactions/transactions.import";
import { runDynamicAmlRules } from "../aml/aml-rules.engine";
import { runAmlRules }         from "../aml/aml.engine";
import { findCustomerById }    from "../customers/customers.repository";
import { createLogger }        from "../../_core/logger";

const log = createLogger("wallets-import");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletImportInput {
  walletId:   number;   // PK du wallet (wallets.id)
  customerId: number;
  content:    string;   // contenu brut du fichier
  dryRun?:    boolean;  // true → parser sans insérer
}

export interface WalletImportReport {
  format:    string;
  total:     number;
  parsed:    number;
  inserted:  number;
  duplicates: number;
  skipped:   number;
  errors:    Array<{ line: number; error: string }>;
  sampleRows: Array<{ date: string; amount: string; type: string; counterparty?: string }>;
}

// ─── Logique principale ───────────────────────────────────────────────────────

export async function importWalletTransactions(input: WalletImportInput): Promise<WalletImportReport> {
  // 1. Vérifier que le wallet existe
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, input.walletId)).limit(1);
  if (!wallet) throw new Error(`Wallet ${input.walletId} introuvable`);

  // 2. Parser le fichier
  const parsed: ImportResult = parseTransactionFile(input.content);

  if (parsed.transactions.length === 0) {
    return {
      format:    parsed.format,
      total:     parsed.total,
      parsed:    0,
      inserted:  0,
      duplicates: 0,
      skipped:   parsed.skipped,
      errors:    parsed.errors,
      sampleRows: [],
    };
  }

  // 3. Déduplication : vérifier les externalRef déjà en base pour ce wallet
  const externalRefs = parsed.transactions.map(t => t.externalRef);

  // On stocke l'externalRef dans le champ `transactionId` avec un préfixe
  const prefixed = externalRefs.map(r => `IMPORT-${r}`);
  const existing = await db
    .select({ transactionId: transactions.transactionId })
    .from(transactions)
    .where(inArray(transactions.transactionId, prefixed));

  const existingSet = new Set(existing.map(r => r.transactionId));

  const toInsert = parsed.transactions.filter(
    t => !existingSet.has(`IMPORT-${t.externalRef}`)
  );
  const duplicates = parsed.transactions.length - toInsert.length;

  const report: WalletImportReport = {
    format:     parsed.format,
    total:      parsed.total,
    parsed:     parsed.parsed,
    inserted:   0,
    duplicates,
    skipped:    parsed.skipped,
    errors:     [...parsed.errors],
    sampleRows: toInsert.slice(0, 5).map(t => ({
      date:         t.transactionDate.toISOString().slice(0, 10),
      amount:       `${t.amount} ${t.currency}`,
      type:         t.transactionType,
      ...(t.counterparty ? { counterparty: t.counterparty } : {}),
    })),
  };

  if (input.dryRun) return report;

  // 4. Insérer les transactions en base (par lot de 100)
  const customer = await findCustomerById(input.customerId);
  if (!customer) throw new Error(`Client ${input.customerId} introuvable`);

  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const rows = batch.map((t: ImportedTransaction) => ({
      transactionId:   `IMPORT-${t.externalRef}-${nanoid(4).toUpperCase()}`,
      customerId:      input.customerId,
      walletId:        input.walletId,
      amount:          t.amount,
      currency:        t.currency || wallet.currency,
      transactionType: t.transactionType,
      channel:         "MOBILE" as const,
      counterparty:    t.counterparty    ?? null,
      counterpartyBank: t.counterpartyBank ?? null,
      purpose:         t.purpose         ?? null,
      riskScore:       0,
      status:          "COMPLETED" as const,
      isSuspicious:    false,
      transactionDate: t.transactionDate,
    }));

    const inserted = await db.insert(transactions).values(rows).returning();
    report.inserted += inserted.length;

    // 5. AML fire-and-forget par transaction
    for (const tx of inserted) {
      runDynamicAmlRules(tx, customer).catch(() =>
        runAmlRules(tx, customer).catch(() => {/* AML errors never block import */})
      );
    }
  }

  // 6. Mettre à jour lastActivityAt sur le wallet
  await db
    .update(wallets)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(wallets.id, input.walletId));

  log.info({
    walletId: input.walletId,
    inserted: report.inserted,
    duplicates: report.duplicates,
  }, "Import wallet terminé");

  return report;
}
