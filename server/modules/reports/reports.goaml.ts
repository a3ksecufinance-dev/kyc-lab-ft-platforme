/**
 * Générateur XML GoAML 2.0
 *
 * Spécification de référence :
 *   UNODC — goAML XML Schema v2.0 (goAMLSchema_2.0.xsd)
 *   TRACFIN — Guide d'implémentation télédéclaration TRACFIN v3.2
 *   FATF — Guidance on Digital Identity (2020)
 *
 * Structure GoAML :
 *   <report>
 *     <rentity_id>        — identifiant de l'entité déclarante
 *     <submission_code>   — E (electrical) / M (manual)
 *     <report_code>       — STR / SAR / ...
 *     <entity_reference>  — référence interne du rapport
 *     <fiu_ref_number>    — référence régulateur (retour TRACFIN)
 *     <reporting_person>  — compliance officer déclarant
 *     <location>          — adresse de l'entité
 *     <action>            — A (add) / R (replace)
 *     <transaction>       — une ou plusieurs transactions
 *       <transactionnumber>
 *       <transaction_location>
 *       <date_transaction>
 *       <teller>          — from_funds_code
 *       <from_funds>      — entité source
 *       <to_funds>        — entité destination
 *     <involved_party>    — parties impliquées (from / to / subject)
 *       <entity>          — personne physique ou morale
 */

import { createLogger } from "../../_core/logger";
import type { Report, Customer, Transaction } from "../../../drizzle/schema";

const log = createLogger("goaml");

// ─── Types internes ───────────────────────────────────────────────────────────

export interface GoAmlReportInput {
  report:       Report;
  customer:     Customer;
  transactions: Transaction[];
  reportingOrg: ReportingOrganization;
  submittedBy:  ReportingPerson;
}

export interface ReportingOrganization {
  id:          string;   // Identifiant déclarant TRACFIN (ex: "TR-2024-XXXXX")
  name:        string;   // "Banque XYZ SA"
  type:        string;   // "bank" | "insurance" | "other"
  country:     string;   // "FR"
  address:     string;
  city:        string;
  postalCode:  string;
  phone:       string;
  email:       string;
}

export interface ReportingPerson {
  firstName: string;
  lastName:  string;
  title:     string;    // "Compliance Officer"
  phone:     string;
  email:     string;
}

export interface GoAmlResult {
  xml:         string;
  reportCode:  string;   // "STR" | "SAR"
  schemaVersion: string;
  generatedAt: Date;
  checksum:    string;   // SHA-256 du contenu XML (pour vérification)
}

// ─── Helpers XML ─────────────────────────────────────────────────────────────

function escXml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | null | undefined, attrs = ""): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}${attrs ? " " + attrs : ""}>${escXml(value)}</${name}>`;
}

function tagRaw(name: string, content: string, attrs = ""): string {
  return `<${name}${attrs ? " " + attrs : ""}>\n${content}\n</${name}>`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().split("T")[0]!;
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().replace("T", " ").split(".")[0]!;
}

// ─── Mapping types FATF ───────────────────────────────────────────────────────

// GoAML from_funds_code / to_funds_code
function txTypeToFundsCode(txType: string): string {
  const map: Record<string, string> = {
    TRANSFER:    "TT",   // Wire Transfer
    DEPOSIT:     "CD",   // Cash Deposit
    WITHDRAWAL:  "CW",   // Cash Withdrawal
    PAYMENT:     "EP",   // Electronic Payment
    EXCHANGE:    "EX",   // Currency Exchange
  };
  return map[txType] ?? "OT";  // OT = Other
}

// GoAML transaction_type_code
function channelToLocationCode(channel: string): string {
  const map: Record<string, string> = {
    ONLINE:  "OL",  // Online
    MOBILE:  "MB",  // Mobile
    BRANCH:  "BR",  // Branch
    ATM:     "AT",  // ATM
    API:     "OL",  // Online (API)
  };
  return map[channel] ?? "OT";
}

// ─── Générateur principal ─────────────────────────────────────────────────────

export async function generateGoAmlXml(input: GoAmlReportInput): Promise<GoAmlResult> {
  const { report, customer, transactions, reportingOrg, submittedBy } = input;

  const reportCode = report.reportType === "STR" ? "STR" : "SAR";
  const content    = (report.content ?? {}) as Record<string, unknown>;
  const now        = new Date();

  // ── En-tête GoAML ────────────────────────────────────────────────────────

  const header = `<?xml version="1.0" encoding="UTF-8"?>
<report xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="goAMLSchema_2.0.xsd">`;

  // ── Informations de l'entité déclarante ──────────────────────────────────

  const reportingEntity = tagRaw("reporting_entity", [
    tag("rentity_id",   reportingOrg.id),
    tag("rentity_name", reportingOrg.name),
    tagRaw("address", [
      tag("address",     reportingOrg.address),
      tag("city",        reportingOrg.city),
      tag("zip",         reportingOrg.postalCode),
      tag("country_code", reportingOrg.country),
    ].join("\n")),
    tag("phone",  reportingOrg.phone),
    tag("email",  reportingOrg.email),
  ].filter(Boolean).join("\n"));

  // ── Personne déclarante (compliance officer) ─────────────────────────────

  const reportingPerson = tagRaw("reporting_person", [
    tag("first_name", submittedBy.firstName),
    tag("last_name",  submittedBy.lastName),
    tag("title",      submittedBy.title),
    tag("phone",      submittedBy.phone),
    tag("email",      submittedBy.email),
  ].join("\n"));

  // ── Métadonnées du rapport ────────────────────────────────────────────────

  const reportMeta = [
    tag("submission_code",  "E"),                          // Electronic
    tag("report_code",       reportCode),
    tag("entity_reference",  report.reportId),
    tag("submission_date",   fmtDateTime(now)),
    tag("currency_code_local", report.currency ?? "EUR"),
    tag("report_date_from",  fmtDate(report.createdAt)),
    tag("report_date_to",    fmtDate(now)),
    ...(report.regulatoryRef ? [tag("fiu_ref_number", report.regulatoryRef)] : []),
    tag("action", "A"),  // A = Add (new report)
  ].filter(Boolean).join("\n");

  // ── Transactions ──────────────────────────────────────────────────────────

  const txNodes = transactions.map((tx, idx) => {
    const seqNo = (idx + 1).toString().padStart(4, "0");

    return tagRaw("transaction", [
      tag("transactionnumber",    tx.transactionId),
      tag("internal_ref_number",  `${report.reportId}-TX-${seqNo}`),
      tag("transaction_location", channelToLocationCode(tx.channel)),
      tag("date_transaction",     fmtDate(tx.transactionDate)),
      tag("teller",               txTypeToFundsCode(tx.transactionType)),
      tag("from_country",         customer.residenceCountry ?? "FR"),
      tag("to_country",           tx.counterpartyCountry ?? customer.residenceCountry ?? "FR"),

      // Fonds source
      tagRaw("from_funds", [
        tag("funds_code",    txTypeToFundsCode(tx.transactionType)),
        tag("amount",        tx.amount.toString()),
        tag("currency_code", tx.currency),
        ...(tx.purpose ? [tag("notes", tx.purpose)] : []),
      ].join("\n")),

      // Fonds destination
      tagRaw("to_funds", [
        tag("funds_code",    txTypeToFundsCode(tx.transactionType)),
        tag("amount",        tx.amount.toString()),
        tag("currency_code", tx.currency),
        ...(tx.counterparty ? [tag("entity_name", tx.counterparty)] : []),
        ...(tx.counterpartyBank ? [tag("bank_name", tx.counterpartyBank)] : []),
        ...(tx.counterpartyCountry ? [tag("country_code", tx.counterpartyCountry)] : []),
      ].join("\n")),
    ].filter(Boolean).join("\n"));
  });

  // ── Parties impliquées ────────────────────────────────────────────────────

  const isIndividual = customer.customerType === "INDIVIDUAL";

  const subjectEntity = tagRaw("entity", [
    // Personne physique
    ...(isIndividual ? [
      tagRaw("person", [
        tag("first_name",       customer.firstName),
        tag("last_name",        customer.lastName),
        tag("birth_date",       fmtDate(customer.dateOfBirth)),
        tag("nationality",      customer.nationality ?? ""),
        tag("id_number",        customer.customerId),
        tag("pep",              customer.pepStatus ? "true" : "false"),
        ...(customer.profession ? [tag("profession", customer.profession)] : []),
        ...(customer.employer   ? [tag("employer",   customer.employer)]   : []),
      ].filter(Boolean).join("\n")),
    ] : [
      // Personne morale
      tagRaw("business", [
        tag("name",      `${customer.firstName} ${customer.lastName}`),
        tag("id_number", customer.customerId),
      ].join("\n")),
    ]),

    tagRaw("address", [
      tag("address",      customer.address ?? ""),
      tag("city",         customer.city ?? ""),
      tag("country_code", customer.residenceCountry ?? "FR"),
    ].join("\n")),

    ...(customer.phone ? [tag("phone", customer.phone)] : []),
    ...(customer.email ? [tag("email", customer.email)] : []),

    // Compte bancaire (référence interne)
    tagRaw("account", [
      tag("institution_name", reportingOrg.name),
      tag("swift_bic",        ""),
      tag("account",          customer.customerId),
      tag("opened",           fmtDate(customer.createdAt)),
      tag("currency_code",    "EUR"),
    ].join("\n")),
  ].filter(Boolean).join("\n"));

  const involvedParty = tagRaw("involved_party", [
    tag("role",     "S"),  // S = Subject
    tag("comments", `${customer.firstName} ${customer.lastName} — ${customer.customerId}`),
    subjectEntity,
  ].join("\n"));

  // ── Narrative / Reason ────────────────────────────────────────────────────

  const narrative = (() => {
    if (reportCode === "SAR") {
      const c = content as {
        subjectDescription?: string;
        suspiciousActivities?: string[];
        evidenceSummary?: string;
        narrativeSummary?: string;
        recommendedAction?: string;
      };
      return [
        `SUBJECT: ${c.subjectDescription ?? ""}`,
        `\nSUSPICIOUS ACTIVITIES:\n${(c.suspiciousActivities ?? []).map(a => `- ${a}`).join("\n")}`,
        `\nEVIDENCE: ${c.evidenceSummary ?? ""}`,
        `\nNARRATIVE: ${c.narrativeSummary ?? ""}`,
        c.recommendedAction ? `\nRECOMMENDED ACTION: ${c.recommendedAction}` : "",
      ].filter(Boolean).join("");
    } else {
      const c = content as {
        suspicionBasis?: string;
        evidenceSummary?: string;
        narrativeSummary?: string;
        involvedParties?: string[];
      };
      return [
        `SUSPICION BASIS: ${c.suspicionBasis ?? ""}`,
        `\nINVOLVED PARTIES:\n${(c.involvedParties ?? []).map(p => `- ${p}`).join("\n")}`,
        `\nEVIDENCE: ${c.evidenceSummary ?? ""}`,
        `\nNARRATIVE: ${c.narrativeSummary ?? ""}`,
      ].filter(Boolean).join("");
    }
  })();

  const reasonBlock = tagRaw("reason", [
    tag("reason_s",  escXml(report.suspicionType ?? "")),
    tag("reason_l",  escXml(narrative)),
    ...(report.amountInvolved ? [
      tag("amount",        report.amountInvolved.toString()),
      tag("currency_code", report.currency ?? "EUR"),
    ] : []),
  ].filter(Boolean).join("\n"));

  // ── Assemblage final ──────────────────────────────────────────────────────

  const xml = [
    header,
    reportingEntity,
    reportingPerson,
    reportMeta,
    ...txNodes,
    involvedParty,
    reasonBlock,
    "</report>",
  ].filter(Boolean).join("\n");

  // Checksum SHA-256 simple (sans dépendance crypto externe)
  const encoder = new TextEncoder();
  const data     = encoder.encode(xml);
  const hashBuf  = await crypto.subtle.digest("SHA-256", data);
  const hashArr  = Array.from(new Uint8Array(hashBuf));
  const checksum = hashArr.map(b => b.toString(16).padStart(2, "0")).join("");

  log.info({
    reportId:    report.reportId,
    reportCode,
    txCount:     transactions.length,
    xmlLength:   xml.length,
    checksum:    checksum.slice(0, 16) + "...",
  }, "XML GoAML généré");

  return { xml, reportCode, schemaVersion: "2.0", generatedAt: now, checksum };
}

// ─── Validation structurelle minimale ────────────────────────────────────────

export function validateGoAmlXml(xml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const required = [
    "reporting_entity", "rentity_id",
    "reporting_person", "first_name", "last_name",
    "submission_code",  "report_code",
    "entity_reference", "submission_date",
    "involved_party",   "reason",
  ];

  for (const tag of required) {
    if (!xml.includes(`<${tag}>`)) {
      errors.push(`Élément requis manquant : <${tag}>`);
    }
  }

  if (!xml.startsWith("<?xml")) {
    errors.push("Déclaration XML manquante");
  }

  if (!xml.includes("<report ")) {
    errors.push("Élément racine <report> manquant");
  }

  return { valid: errors.length === 0, errors };
}
