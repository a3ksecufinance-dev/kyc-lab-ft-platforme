/**
 * Générateur ISO 20022 — pacs.008 FIToFICustomerCreditTransfer
 *
 * Norme : ISO 20022 MX pacs.008.001.08
 * Usage  : Transmission interbancaire de virements créditeurs
 *          (bank-to-bank credit transfers)
 *
 * Obligatoire BAM Maroc depuis : deadline fin 2025
 * Référence  : BAM — Circulaire 5/W/2023 + Mémorandum ISO 20022 Migration 2024
 *
 * Structure XML :
 *   <FIToFICstmrCdtTrf>
 *     <GrpHdr>  — Group Header (messageId, creationDateTime, numberOfTransactions, totalInterBankSettlementAmount)
 *     <CdtTrfTxInf>  — Credit Transfer Transaction Information
 *       <PmtId>        — Payment Identification (end-to-end ID, UETR)
 *       <IntrBkSttlmAmt> — Interbank Settlement Amount
 *       <Dbtr>         — Debtor (originator)
 *       <DbtrAcct>     — Debtor Account
 *       <DbtrAgt>      — Debtor Agent (bank)
 *       <CdtrAgt>      — Creditor Agent (beneficiary bank)
 *       <Cdtr>         — Creditor (beneficiary)
 *       <CdtrAcct>     — Creditor Account
 *       <RmtInf>       — Remittance Information (purpose)
 */

import crypto       from "node:crypto";
import { createLogger } from "../../_core/logger";
import { ENV }          from "../../_core/env";

const log = createLogger("iso20022-pacs008");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Pacs008Party {
  name:      string;
  iban?:     string;          // IBAN ou numéro de compte propriétaire
  bic?:      string;          // BIC/SWIFT de la banque
  country:   string;          // ISO 3166-1 alpha-2
  address?:  string;
}

export interface Pacs008Input {
  messageId:        string;   // Identifiant unique du message (max 35 chars)
  endToEndId:       string;   // ID transaction source (transactionId)
  amount:           number;
  currency:         string;   // ISO 4217 (ex: MAD, EUR, USD)
  settlementDate:   string;   // YYYY-MM-DD
  debtor:           Pacs008Party;
  debtorAgent:      { bic: string; name: string; country: string };
  creditor:         Pacs008Party;
  creditorAgent:    { bic: string; name: string; country: string };
  purpose?:         string;   // Code finalité ISO 20022 (ex: SALA, SUPP, TAXS)
  remittanceInfo?:  string;   // Référence virement libre (max 140 chars)
}

export interface Pacs008Result {
  xml:          string;
  messageId:    string;
  uetr:         string;       // Unique End-to-end Transaction Reference (UUID v4)
  checksum:     string;       // SHA-256 du contenu XML
  generatedAt:  Date;
  schemaVersion: string;
}

// ─── Helpers XML ─────────────────────────────────────────────────────────────

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

// ─── Générateur pacs.008 ──────────────────────────────────────────────────────

export function generatePacs008(input: Pacs008Input): Pacs008Result {
  const uetr      = crypto.randomUUID();
  const now       = new Date();
  const msgId     = (input.messageId || `PACS008-${Date.now()}`).slice(0, 35);
  const amountStr = input.amount.toFixed(2);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${isoDateTime(now)}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <TtlIntrBkSttlmAmt Ccy="${esc(input.currency)}">${amountStr}</TtlIntrBkSttlmAmt>
      <IntrBkSttlmDt>${esc(input.settlementDate)}</IntrBkSttlmDt>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${esc(msgId)}-001</InstrId>
        <EndToEndId>${esc(input.endToEndId.slice(0, 35))}</EndToEndId>
        <UETR>${uetr}</UETR>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${esc(input.currency)}">${amountStr}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${esc(input.settlementDate)}</IntrBkSttlmDt>${input.purpose ? `
      <Purp>
        <Cd>${esc(input.purpose.slice(0, 4))}</Cd>
      </Purp>` : ""}
      <Dbtr>
        <Nm>${esc(input.debtor.name)}</Nm>
        <PstlAdr>
          <Ctry>${esc(input.debtor.country)}</Ctry>${input.debtor.address ? `
          <AdrLine>${esc(input.debtor.address.slice(0, 70))}</AdrLine>` : ""}
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          ${input.debtor.iban
            ? `<IBAN>${esc(input.debtor.iban)}</IBAN>`
            : `<Othr><Id>${esc(input.debtor.iban ?? "N/A")}</Id></Othr>`
          }
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>${esc(input.debtorAgent.bic)}</BICFI>
          <Nm>${esc(input.debtorAgent.name)}</Nm>
          <PstlAdr><Ctry>${esc(input.debtorAgent.country)}</Ctry></PstlAdr>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>${esc(input.creditorAgent.bic)}</BICFI>
          <Nm>${esc(input.creditorAgent.name)}</Nm>
          <PstlAdr><Ctry>${esc(input.creditorAgent.country)}</Ctry></PstlAdr>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>${esc(input.creditor.name)}</Nm>
        <PstlAdr>
          <Ctry>${esc(input.creditor.country)}</Ctry>${input.creditor.address ? `
          <AdrLine>${esc(input.creditor.address.slice(0, 70))}</AdrLine>` : ""}
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          ${input.creditor.iban
            ? `<IBAN>${esc(input.creditor.iban)}</IBAN>`
            : `<Othr><Id>${esc(input.creditor.iban ?? "N/A")}</Id></Othr>`
          }
        </Id>
      </CdtrAcct>${input.remittanceInfo ? `
      <RmtInf>
        <Ustrd>${esc(input.remittanceInfo.slice(0, 140))}</Ustrd>
      </RmtInf>` : ""}
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

  const checksum = crypto.createHash("sha256").update(xml).digest("hex");

  log.info({ messageId: msgId, uetr, currency: input.currency, amount: amountStr }, "pacs.008 généré");

  return { xml, messageId: msgId, uetr, checksum, generatedAt: now, schemaVersion: "pacs.008.001.08" };
}

// ─── Convertir une transaction existante en pacs.008 ──────────────────────────

export function transactionToPacs008(tx: {
  transactionId: string;
  amount:        number | string;
  currency?:     string | null;
  transactionDate: Date;
  counterparty?: string | null;
  counterpartyCountry?: string | null;
  purpose?:      string | null;
  customerId:    number;
}, originatorName: string, ownBic = "BAMSMAMC"): Pacs008Input {
  const date = tx.transactionDate;
  const settlementDate = `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`;

  return {
    messageId:      `PACS-${tx.transactionId.slice(0, 20)}`,
    endToEndId:     tx.transactionId,
    amount:         Number(tx.amount),
    currency:       tx.currency ?? "MAD",
    settlementDate,
    debtor: {
      name:    originatorName,
      country: "MA",
    },
    debtorAgent: {
      bic:     ownBic,
      name:    ENV.INSTITUTION_NAME,
      country: "MA",
    },
    creditor: {
      name:    tx.counterparty ?? "BENEFICIARY",
      country: tx.counterpartyCountry ?? "MA",
    },
    creditorAgent: {
      bic:     "UNKNOWN",
      name:    "PSP BENEFICIAIRE",
      country: tx.counterpartyCountry ?? "MA",
    },
    ...(tx.purpose ? { purpose: tx.purpose.slice(0, 4).toUpperCase() } : {}),
    remittanceInfo: `REF: ${tx.transactionId}`,
  };
}
