/**
 * Générateur ISO 20022 — camt.053 BankToCustomerStatement
 *
 * Norme : ISO 20022 MX camt.053.001.08
 * Usage  : Relevé de compte périodique (mensuel) au format banque centrale
 *          Remplace les relevés propriétaires (Swift MT940/MT950)
 *
 * Structure XML :
 *   <BkToCstmrStmt>
 *     <GrpHdr>   — Identifiant message, date/heure création
 *     <Stmt>
 *       <Id>       — Identifiant relevé
 *       <Acct>     — Compte (IBAN ou id propriétaire)
 *       <Bal>      — Soldes (ouverture, clôture)
 *       <TxsSummry> — Résumé (nb débits, crédits, montants)
 *       <Ntry>     — Entrées (transactions)
 *         <Amt>
 *         <CdtDbtInd>  — CRDT / DBIT
 *         <Sts>
 *         <BookgDt>
 *         <NtryDtls>
 *           <TxDtls>
 *             <EndToEndId>
 *             <RmtInf>
 */

import crypto          from "node:crypto";
import { createLogger } from "../../_core/logger";
import { ENV }          from "../../_core/env";

const log = createLogger("iso20022-camt053");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Camt053Transaction {
  id:            string;
  amount:        number;
  currency:      string;
  direction:     "CRDT" | "DBIT";   // Crédit ou Débit
  bookingDate:   string;            // YYYY-MM-DD
  valueDate?:    string;
  status:        "BOOK" | "PDNG";   // BOOK = comptabilisé, PDNG = en attente
  endToEndId:    string;
  description?:  string;
  counterparty?: string;
}

export interface Camt053Input {
  statementId:   string;
  accountId:     string;             // IBAN ou ID propriétaire
  accountName?:  string;
  currency:      string;
  fromDate:      string;             // YYYY-MM-DD
  toDate:        string;
  openingBalance:  number;
  closingBalance:  number;
  transactions:  Camt053Transaction[];
}

export interface Camt053Result {
  xml:           string;
  messageId:     string;
  checksum:      string;
  generatedAt:   Date;
  schemaVersion: string;
  transactionCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pad2(n: number): string { return String(n).padStart(2, "0"); }

function isoDateTime(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T` +
         `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// ─── Générateur camt.053 ──────────────────────────────────────────────────────

export function generateCamt053(input: Camt053Input): Camt053Result {
  const now    = new Date();
  const msgId  = `CAMT053-${input.statementId.slice(0, 20)}-${Date.now().toString(36).toUpperCase()}`;

  const debits  = input.transactions.filter(t => t.direction === "DBIT");
  const credits = input.transactions.filter(t => t.direction === "CRDT");
  const totalDebit  = debits.reduce((s, t) => s + t.amount, 0);
  const totalCredit = credits.reduce((s, t) => s + t.amount, 0);

  const entriesXml = input.transactions.map(tx => `
      <Ntry>
        <Amt Ccy="${esc(tx.currency)}">${tx.amount.toFixed(2)}</Amt>
        <CdtDbtInd>${esc(tx.direction)}</CdtDbtInd>
        <Sts>
          <Cd>${esc(tx.status)}</Cd>
        </Sts>
        <BookgDt>
          <Dt>${esc(tx.bookingDate)}</Dt>
        </BookgDt>${tx.valueDate ? `
        <ValDt>
          <Dt>${esc(tx.valueDate)}</Dt>
        </ValDt>` : ""}
        <NtryDtls>
          <TxDtls>
            <Refs>
              <EndToEndId>${esc(tx.endToEndId.slice(0, 35))}</EndToEndId>
            </Refs>${tx.description || tx.counterparty ? `
            <RmtInf>
              <Ustrd>${esc((tx.description || tx.counterparty || "").slice(0, 140))}</Ustrd>
            </RmtInf>` : ""}
          </TxDtls>
        </NtryDtls>
      </Ntry>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${isoDateTime(now)}</CreDtTm>
      <AddtlInf>ISO 20022 camt.053.001.08 — ${esc(ENV.INSTITUTION_NAME)}</AddtlInf>
    </GrpHdr>
    <Stmt>
      <Id>${esc(input.statementId.slice(0, 35))}</Id>
      <CreDtTm>${isoDateTime(now)}</CreDtTm>
      <FrToDt>
        <FrDtTm>${esc(input.fromDate)}T00:00:00</FrDtTm>
        <ToDtTm>${esc(input.toDate)}T23:59:59</ToDtTm>
      </FrToDt>
      <Acct>
        <Id>
          ${input.accountId.match(/^[A-Z]{2}[0-9]{2}/)
            ? `<IBAN>${esc(input.accountId)}</IBAN>`
            : `<Othr><Id>${esc(input.accountId)}</Id></Othr>`
          }
        </Id>${input.accountName ? `
        <Nm>${esc(input.accountName)}</Nm>` : ""}
        <Ccy>${esc(input.currency)}</Ccy>
      </Acct>
      <Bal>
        <Tp>
          <CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry>
        </Tp>
        <Amt Ccy="${esc(input.currency)}">${input.openingBalance.toFixed(2)}</Amt>
        <CdtDbtInd>${input.openingBalance >= 0 ? "CRDT" : "DBIT"}</CdtDbtInd>
        <Dt><Dt>${esc(input.fromDate)}</Dt></Dt>
      </Bal>
      <Bal>
        <Tp>
          <CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry>
        </Tp>
        <Amt Ccy="${esc(input.currency)}">${Math.abs(input.closingBalance).toFixed(2)}</Amt>
        <CdtDbtInd>${input.closingBalance >= 0 ? "CRDT" : "DBIT"}</CdtDbtInd>
        <Dt><Dt>${esc(input.toDate)}</Dt></Dt>
      </Bal>
      <TxsSummry>
        <TtlNtries>
          <NbOfNtries>${input.transactions.length}</NbOfNtries>
          <Sum>${(totalDebit + totalCredit).toFixed(2)}</Sum>
        </TtlNtries>
        <TtlCdtNtries>
          <NbOfNtries>${credits.length}</NbOfNtries>
          <Sum>${totalCredit.toFixed(2)}</Sum>
        </TtlCdtNtries>
        <TtlDbtNtries>
          <NbOfNtries>${debits.length}</NbOfNtries>
          <Sum>${totalDebit.toFixed(2)}</Sum>
        </TtlDbtNtries>
      </TxsSummry>${entriesXml}
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

  const checksum = crypto.createHash("sha256").update(xml).digest("hex");

  log.info({
    messageId: msgId,
    txCount:   input.transactions.length,
    currency:  input.currency,
  }, "camt.053 généré");

  return {
    xml,
    messageId:        msgId,
    checksum,
    generatedAt:      now,
    schemaVersion:    "camt.053.001.08",
    transactionCount: input.transactions.length,
  };
}
