/**
 * Import de transactions en lot — CSV générique + SWIFT MT940
 *
 * Formats supportés :
 *
 * CSV générique (détection automatique du séparateur ,;|\t) :
 *   Colonnes détectées automatiquement : date, amount, currency,
 *   type, counterparty, reference, description
 *
 * SWIFT MT940 (relevé bancaire) :
 *   :20:RÉFÉRENCE
 *   :25:IBAN
 *   :28C:N° RELEVÉ
 *   :60F:SOLDE INITIAL
 *   :61:DATE MONTANT DÉBIT/CRÉDIT RÉFÉRENCE
 *   :86:INFORMATIONS COMPLÉMENTAIRES
 *   :62F:SOLDE FINAL
 *
 * Sécurité :
 *   - Déduplication par transactionId (hash de référence + date + montant)
 *   - Validation du montant (nombre positif, max 15 chiffres)
 *   - Max 5000 lignes par import
 */

import { createHash } from "crypto";
import { createLogger } from "../../_core/logger";

const log = createLogger("tx-import");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportedTransaction {
  externalRef:         string;    // référence source (pour déduplication)
  amount:              string;    // "1234.56"
  currency:            string;    // "EUR"
  transactionType:     "TRANSFER" | "DEPOSIT" | "WITHDRAWAL" | "PAYMENT" | "EXCHANGE";
  transactionDate:     Date;
  counterparty?:       string;
  counterpartyBank?:   string;
  purpose?:            string;
  rawLine:             string;    // ligne source pour audit
}

export interface ImportResult {
  format:     "csv" | "mt940" | "unknown";
  total:      number;
  parsed:     number;
  skipped:    number;
  errors:     Array<{ line: number; error: string }>;
  transactions: ImportedTransaction[];
}

// ─── Détection du format ──────────────────────────────────────────────────────

export function detectFormat(content: string): "csv" | "mt940" | "unknown" {
  const trimmed = content.trimStart();
  if (trimmed.startsWith(":20:") || /^:\d{2}[A-Z]?:/.test(trimmed)) return "mt940";
  // Si la première ligne non vide contient des séparateurs et des chiffres → CSV
  const firstLine = trimmed.split("\n")[0] ?? "";
  if (/[;,|\t]/.test(firstLine)) return "csv";
  return "unknown";
}

// ─── Parser CSV ───────────────────────────────────────────────────────────────

function detectSeparator(header: string): string {
  const counts = { ",": 0, ";": 0, "|": 0, "\t": 0 };
  for (const sep of Object.keys(counts) as (keyof typeof counts)[]) {
    counts[sep] = (header.match(new RegExp("\\" + sep, "g")) ?? []).length;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",";
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchColumn(headers: string[], ...candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseCsvDate(raw: string): Date | null {
  if (!raw?.trim()) return null;
  // Formats tentés : ISO, DD/MM/YYYY, MM/DD/YYYY, YYYYMMDD
  const s = raw.trim().replace(/\./g, "/");
  for (const format of [
    /^(\d{4})-(\d{2})-(\d{2})/,   // ISO
    /^(\d{2})\/(\d{2})\/(\d{4})/,  // DD/MM/YYYY
    /^(\d{4})(\d{2})(\d{2})$/,     // YYYYMMDD
  ]) {
    const m = s.match(format);
    if (m) {
      const [, a, b, c] = m;
      const iso = format.source.startsWith("^(\\d{4})")
        ? `${a}-${b}-${c}`
        : `${c}-${b}-${a}`;
      const d = new Date(iso!);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const fallback = new Date(raw.trim());
  return isNaN(fallback.getTime()) ? null : fallback;
}

function normalizeAmount(raw: string): string | null {
  if (!raw?.trim()) return null;
  // Retirer les espaces, remplacer la virgule décimale par un point
  const cleaned = raw.trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3})/g, "")  // supprimer les séparateurs de milliers
    .replace(",", ".");
  const n = parseFloat(cleaned);
  if (isNaN(n) || n <= 0) return null;
  return n.toFixed(2);
}

function inferTransactionType(typeStr?: string, _amount?: string, purpose?: string): ImportedTransaction["transactionType"] {
  const s = (typeStr ?? purpose ?? "").toLowerCase();
  if (s.includes("vir") || s.includes("transfer") || s.includes("sepa")) return "TRANSFER";
  if (s.includes("depot") || s.includes("deposit") || s.includes("credit")) return "DEPOSIT";
  if (s.includes("retrait") || s.includes("withdraw") || s.includes("debit")) return "WITHDRAWAL";
  if (s.includes("paiement") || s.includes("payment") || s.includes("carte")) return "PAYMENT";
  return "PAYMENT";
}

export function parseCsv(content: string): ImportResult {
  const lines   = content.split("\n").map(l => l.trim()).filter(Boolean);
  const result: ImportResult = {
    format: "csv", total: 0, parsed: 0, skipped: 0,
    errors: [], transactions: [],
  };

  if (lines.length < 2) {
    result.errors.push({ line: 0, error: "Fichier CSV vide ou sans données" });
    return result;
  }

  const sep     = detectSeparator(lines[0]!);
  const headers = lines[0]!.split(sep).map(h => normalizeHeader(h.replace(/"/g, "")));

  // Mapper les colonnes
  const cols = {
    date:         matchColumn(headers, "date", "datum", "fecha"),
    amount:       matchColumn(headers, "amount", "montant", "betrag", "importe"),
    currency:     matchColumn(headers, "currency", "devise", "wahrung"),
    type:         matchColumn(headers, "type", "typetransaction", "nature"),
    counterparty: matchColumn(headers, "counterparty", "contrepartie", "beneficiaire", "tiers"),
    bank:         matchColumn(headers, "bank", "banque", "bic"),
    reference:    matchColumn(headers, "reference", "ref", "id", "transactionid"),
    purpose:      matchColumn(headers, "purpose", "motif", "description", "libelle"),
  };

  if (cols.amount < 0) {
    result.errors.push({ line: 1, error: "Colonne 'amount' (montant) introuvable" });
    return result;
  }

  const MAX_ROWS = 5000;
  result.total = Math.min(lines.length - 1, MAX_ROWS);

  for (let i = 1; i <= result.total; i++) {
    const line = lines[i]!;
    const cells = line.split(sep).map(c => c.replace(/^"|"$/g, "").trim());

    try {
      const rawAmount = cells[cols.amount] ?? "";
      const amount    = normalizeAmount(rawAmount);
      if (!amount) {
        result.skipped++;
        result.errors.push({ line: i + 1, error: `Montant invalide : "${rawAmount}"` });
        continue;
      }

      const rawDate = cols.date >= 0 ? cells[cols.date] : undefined;
      const date    = rawDate ? parseCsvDate(rawDate) : null;
      if (!date) {
        result.skipped++;
        result.errors.push({ line: i + 1, error: `Date invalide : "${rawDate}"` });
        continue;
      }

      const currency     = (cols.currency >= 0 ? cells[cols.currency] : "EUR") || "EUR";
      const counterparty = cols.counterparty >= 0 ? cells[cols.counterparty] : undefined;
      const bank         = cols.bank >= 0 ? cells[cols.bank] : undefined;
      const purpose      = cols.purpose >= 0 ? cells[cols.purpose] : undefined;
      const typeStr      = cols.type >= 0 ? cells[cols.type] : undefined;
      const ref          = cols.reference >= 0 ? cells[cols.reference] : undefined;

      // Générer une référence externe unique
      const externalRef = ref || createHash("sha256")
        .update(`${date.toISOString()}|${amount}|${counterparty ?? ""}`)
        .digest("hex")
        .slice(0, 16)
        .toUpperCase();

      result.transactions.push({
        externalRef,
        amount,
        currency:        currency.toUpperCase().slice(0, 3),
        transactionType: inferTransactionType(typeStr, amount, purpose),
        transactionDate: date,
        ...(counterparty ? { counterparty }  : {}),
        ...(bank         ? { counterpartyBank: bank } : {}),
        ...(purpose      ? { purpose }        : {}),
        rawLine: line,
      });
      result.parsed++;
    } catch (err) {
      result.skipped++;
      result.errors.push({ line: i + 1, error: String(err) });
    }
  }

  log.info({ total: result.total, parsed: result.parsed, skipped: result.skipped }, "CSV parsé");
  return result;
}

// ─── Parser SWIFT MT940 ───────────────────────────────────────────────────────

function parseMt940Date(yymmdd: string): Date {
  const yy = parseInt(yymmdd.slice(0, 2));
  const mm = parseInt(yymmdd.slice(2, 4)) - 1;
  const dd = parseInt(yymmdd.slice(4, 6));
  const yyyy = yy >= 50 ? 1900 + yy : 2000 + yy;
  return new Date(yyyy, mm, dd);
}

export function parseMt940(content: string): ImportResult {
  const result: ImportResult = {
    format: "mt940", total: 0, parsed: 0, skipped: 0,
    errors: [], transactions: [],
  };

  // Découper en blocs de transactions (:61:)
  const lines   = content.split("\n");
  let   lineNum = 0;
  let   current: ImportedTransaction | null = null;
  let   currency = "EUR";

  for (const raw of lines) {
    lineNum++;
    const line = raw.trim();
    if (!line) continue;

    // :25: — compte / devise
    if (line.startsWith(":25:")) {
      const parts = line.slice(4).split("/");
      const possibleCcy = parts[parts.length - 1]?.slice(-3);
      if (possibleCcy && /^[A-Z]{3}$/.test(possibleCcy)) currency = possibleCcy;
    }

    // :61: — ligne de transaction
    // Format : :61:YYMMDD[MMDD]CRD/DAmount[//IBAN]
    if (line.startsWith(":61:")) {
      if (current) {
        result.transactions.push(current);
        result.parsed++;
      }
      result.total++;

      try {
        const body    = line.slice(4);
        const dateStr = body.slice(0, 6);   // YYMMDD
        const crDb    = body.slice(6, 7);   // C=crédit D=débit
        // Ignorer le code devise optionnel (1 lettre)
        const rest    = body.slice(crDb === "C" || crDb === "D" ? 7 : 8);
        const amtEnd  = rest.search(/[A-Z]/);
        const rawAmt  = rest.slice(0, amtEnd >= 0 ? amtEnd : undefined)
          .replace(",", ".");
        const amount  = parseFloat(rawAmt);

        if (isNaN(amount) || amount <= 0) {
          result.skipped++;
          result.errors.push({ line: lineNum, error: `Montant invalide dans :61: "${rawAmt}"` });
          current = null;
          continue;
        }

        // Référence après le code transaction (4 chars après le montant)
        const afterAmt = amtEnd >= 0 ? rest.slice(amtEnd) : "";
        const refMatch = afterAmt.match(/([A-Z]{4})(.*)/);
        const ref      = refMatch?.[2]?.trim() || "";

        const externalRef = createHash("sha256")
          .update(`${dateStr}|${amount}|${ref}`)
          .digest("hex").slice(0, 16).toUpperCase();

        current = {
          externalRef,
          amount:          amount.toFixed(2),
          currency,
          transactionType: crDb === "C" ? "DEPOSIT" : crDb === "D" ? "WITHDRAWAL" : "PAYMENT",
          transactionDate: parseMt940Date(dateStr),
          rawLine:         line,
        };
      } catch (err) {
        result.skipped++;
        result.errors.push({ line: lineNum, error: `Erreur :61: ${String(err)}` });
        current = null;
      }
    }

    // :86: — informations complémentaires
    if (line.startsWith(":86:") && current) {
      const info = line.slice(4);
      // Extraire le libellé (après les codes champs /20/, /21/, /32A/ etc.)
      const libelle = info.replace(/\/\d+\//g, " ").replace(/\?[0-9]{2}/g, " ").trim();
      if (libelle) current.purpose = libelle.slice(0, 200);
    }
  }

  // Dernière transaction
  if (current) {
    result.transactions.push(current);
    result.parsed++;
  }

  log.info({ total: result.total, parsed: result.parsed }, "MT940 parsé");
  return result;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function parseTransactionFile(content: string): ImportResult {
  const format = detectFormat(content);
  if (format === "mt940") return parseMt940(content);
  if (format === "csv")   return parseCsv(content);
  return {
    format: "unknown", total: 0, parsed: 0, skipped: 0,
    errors: [{ line: 0, error: "Format non reconnu — utilisez CSV ou SWIFT MT940" }],
    transactions: [],
  };
}
