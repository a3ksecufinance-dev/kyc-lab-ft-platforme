/**
 * Service eKYC — vérification d'identité automatisée
 *
 * Architecture extensible :
 *   Provider "local"  → contrôles règles + OCR (gratuit, RGPD natif)
 *   Provider "onfido" → brancher Onfido SDK (stub prêt)
 *   Provider "sumsub" → brancher Sum Sub (stub prêt)
 *
 * Contrôles "local" (7 vérifications) :
 *   1. Document non expiré
 *   2. OCR confiance suffisante (>= 60)
 *   3. MRZ checksums valides (si présente)
 *   4. Cohérence nom OCR ↔ données client
 *   5. Cohérence date de naissance OCR ↔ client
 *   6. Pays émetteur non sanctionné (liste FATF)
 *   7. Type document valide pour le niveau KYC requis
 *
 * Score final = moyenne pondérée des contrôles passés
 *   PASS   : score >= 75 ET aucun contrôle bloquant échoué
 *   REVIEW : score >= 40 OU contrôle non-bloquant échoué
 *   FAIL   : score < 40 OU contrôle bloquant échoué
 */

import { createLogger } from "../../_core/logger";
import type { OcrData } from "./ocr.service";
import type { Customer } from "../../../drizzle/schema";

const log = createLogger("ekyc");

// ─── Types ────────────────────────────────────────────────────────────────────

export type EkycCheckStatus = "PASS" | "FAIL" | "SKIP" | "WARN";

export interface EkycCheck {
  id:          string;
  label:       string;
  status:      EkycCheckStatus;
  score:       number;    // contribution au score (0-100)
  weight:      number;    // poids dans le score final
  blocking:    boolean;   // si FAIL → résultat global = FAIL immédiat
  detail?:     string;    // explication pour l'analyste
}

export interface EkycResult {
  status:      "PASS" | "REVIEW" | "FAIL";
  score:       number;    // 0-100
  checks:      EkycCheck[];
  provider:    string;
  processedAt: Date;
  // Données normalisées extraites
  extractedFirstName?: string;
  extractedLastName?:  string;
  extractedDob?:       string;
  extractedDocNumber?: string;
  extractedExpiry?:    string;
  extractedCountry?:   string;
}

// ─── Pays FATF à risque élevé (émission document) ─────────────────────────────

const HIGH_RISK_ISSUING_COUNTRIES = new Set([
  "PRK", "KP", "IRN", "IR", "MMR", "MM",
  "BLR", "BY", "RUS", "RU", "SYR", "SY",
]);

// ─── Normalisation nom ────────────────────────────────────────────────────────

function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s.toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(ocrName: string, clientName: string, threshold = 0.7): boolean {
  const a = normalizeName(ocrName);
  const b = normalizeName(clientName);
  if (!a || !b) return false;
  if (a === b) return true;
  // Vérification tokensA ⊆ tokensB ou vice versa
  const ta = new Set(a.split(" ").filter(t => t.length > 1));
  const tb = new Set(b.split(" ").filter(t => t.length > 1));
  const intersection = [...ta].filter(t => tb.has(t)).length;
  const ratio = (2 * intersection) / (ta.size + tb.size);
  return ratio >= threshold;
}

// ─── Contrôles locaux ─────────────────────────────────────────────────────────

function checkExpiry(ocr: OcrData): EkycCheck {
  if (!ocr.expiryDate) {
    return { id: "expiry", label: "Date d'expiration", status: "WARN", score: 50, weight: 20, blocking: false, detail: "Date d'expiration non extraite" };
  }
  const expiry  = new Date(ocr.expiryDate);
  const now     = new Date();
  const expired = expiry < now;
  const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);

  return {
    id: "expiry", label: "Document non expiré",
    status:   expired ? "FAIL" : daysLeft < 30 ? "WARN" : "PASS",
    score:    expired ? 0 : daysLeft < 30 ? 60 : 100,
    weight:   25,
    blocking: expired,
    detail:   expired
      ? `Document expiré depuis le ${ocr.expiryDate}`
      : daysLeft < 30
        ? `Document expire dans ${daysLeft} jours`
        : `Valide jusqu'au ${ocr.expiryDate}`,
  };
}

function checkOcrConfidence(ocr: OcrData): EkycCheck {
  const conf = ocr.confidence;
  return {
    id: "ocr_confidence", label: "Qualité OCR",
    status:   conf >= 70 ? "PASS" : conf >= 50 ? "WARN" : "FAIL",
    score:    Math.min(100, conf),
    weight:   10,
    blocking: conf < 30,
    detail:   `Confiance OCR : ${conf}%`,
  };
}

function checkMrzChecksum(ocr: OcrData): EkycCheck {
  if (!ocr.mrz) {
    return { id: "mrz_checksum", label: "Intégrité MRZ", status: "SKIP", score: 100, weight: 0, blocking: false, detail: "MRZ non présente" };
  }
  return {
    id: "mrz_checksum", label: "Intégrité MRZ (checksums)",
    status:   ocr.mrz.valid ? "PASS" : "FAIL",
    score:    ocr.mrz.valid ? 100 : 0,
    weight:   20,
    blocking: !ocr.mrz.valid,
    detail:   ocr.mrz.valid ? "Checksums MRZ valides" : "Checksums MRZ invalides — document potentiellement falsifié",
  };
}

function checkNameMatch(ocr: OcrData, customer: Pick<Customer, "firstName" | "lastName">): EkycCheck {
  const ocrFirst = ocr.firstName ?? ocr.mrz?.givenNames ?? "";
  const ocrLast  = ocr.lastName  ?? ocr.mrz?.surname    ?? "";

  if (!ocrFirst && !ocrLast) {
    return { id: "name_match", label: "Correspondance nom", status: "SKIP", score: 80, weight: 0, blocking: false, detail: "Nom non extrait" };
  }

  const firstMatch = namesMatch(ocrFirst, customer.firstName);
  const lastMatch  = namesMatch(ocrLast,  customer.lastName);
  const bothMatch  = firstMatch && lastMatch;
  const oneMatch   = firstMatch || lastMatch;

  return {
    id: "name_match", label: "Nom OCR ↔ profil client",
    status:   bothMatch ? "PASS" : oneMatch ? "WARN" : "FAIL",
    score:    bothMatch ? 100 : oneMatch ? 60 : 0,
    weight:   25,
    blocking: !oneMatch,
    detail:   bothMatch
      ? `Prénom (${firstMatch ? "✓" : "✗"}) et nom (${lastMatch ? "✓" : "✗"}) concordants`
      : `Prénom (${firstMatch ? "✓" : "✗"}), Nom (${lastMatch ? "✓" : "✗"}) — OCR: "${ocrFirst} ${ocrLast}"`,
  };
}

function checkDobMatch(ocr: OcrData, customer: Pick<Customer, "dateOfBirth">): EkycCheck {
  const ocrDob     = ocr.dateOfBirth;
  const clientDob  = customer.dateOfBirth;

  if (!ocrDob || !clientDob) {
    return { id: "dob_match", label: "Date de naissance", status: "SKIP", score: 80, weight: 0, blocking: false, detail: "Date de naissance non disponible" };
  }

  // Normaliser les deux au format YYYY-MM-DD
  const match = ocrDob.slice(0, 10) === clientDob.slice(0, 10);
  return {
    id: "dob_match", label: "Date naissance OCR ↔ profil",
    status:   match ? "PASS" : "FAIL",
    score:    match ? 100 : 0,
    weight:   15,
    blocking: !match,
    detail:   match ? "Dates de naissance concordantes" : `OCR: ${ocrDob} / Client: ${clientDob}`,
  };
}

function checkIssuingCountry(ocr: OcrData): EkycCheck {
  const country = ocr.issuingCountry ?? ocr.mrz?.issuingState ?? "";
  if (!country) {
    return { id: "issuing_country", label: "Pays émetteur", status: "SKIP", score: 100, weight: 0, blocking: false, detail: "Pays émetteur non extrait" };
  }
  const isRisky = HIGH_RISK_ISSUING_COUNTRIES.has(country.toUpperCase());
  return {
    id: "issuing_country", label: "Pays émetteur (FATF)",
    status:   isRisky ? "FAIL" : "PASS",
    score:    isRisky ? 0 : 100,
    weight:   5,
    blocking: isRisky,
    detail:   isRisky
      ? `Pays émetteur à risque FATF : ${country}`
      : `Pays émetteur OK : ${country}`,
  };
}

function checkDocumentType(docType: string): EkycCheck {
  const primaryDocs = new Set(["PASSPORT", "ID_CARD", "DRIVING_LICENSE"]);
  const valid = primaryDocs.has(docType);
  return {
    id: "doc_type", label: "Type de document valide",
    status:   valid ? "PASS" : "WARN",
    score:    valid ? 100 : 60,
    weight:   5,
    blocking: false,
    detail:   valid ? `Document primaire (${docType})` : `Document secondaire (${docType}) — document primaire recommandé`,
  };
}

// ─── Provider local ───────────────────────────────────────────────────────────

async function runLocalEkyc(
  ocr:      OcrData,
  docType:  string,
  customer: Pick<Customer, "firstName" | "lastName" | "dateOfBirth">,
): Promise<EkycResult> {
  const checks: EkycCheck[] = [
    checkExpiry(ocr),
    checkOcrConfidence(ocr),
    checkMrzChecksum(ocr),
    checkNameMatch(ocr, customer),
    checkDobMatch(ocr, customer),
    checkIssuingCountry(ocr),
    checkDocumentType(docType),
  ];

  // Calculer le score pondéré (ignorer les SKIP)
  const activeChecks = checks.filter(c => c.status !== "SKIP");
  const totalWeight  = activeChecks.reduce((s, c) => s + c.weight, 0);
  const weightedSum  = activeChecks.reduce((s, c) => s + c.score * c.weight, 0);
  const score        = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  // Déterminer le statut global
  const hasBlockingFail = checks.some(c => c.blocking && c.status === "FAIL");
  const status: EkycResult["status"] =
    hasBlockingFail            ? "FAIL"
    : score >= 75              ? "PASS"
    : score >= 40              ? "REVIEW"
    : "FAIL";

  const result: EkycResult = {
    status,
    score,
    checks,
    provider:    "local",
    processedAt: new Date(),
  };
  if (ocr.firstName)      result.extractedFirstName = ocr.firstName;
  if (ocr.lastName)       result.extractedLastName  = ocr.lastName;
  if (ocr.dateOfBirth)    result.extractedDob       = ocr.dateOfBirth;
  if (ocr.documentNumber) result.extractedDocNumber = ocr.documentNumber;
  if (ocr.expiryDate)     result.extractedExpiry    = ocr.expiryDate;
  if (ocr.issuingCountry) result.extractedCountry   = ocr.issuingCountry;
  return result;
}

// ─── Stub providers tiers ─────────────────────────────────────────────────────

async function runOnfidoEkyc(_ocr: OcrData, _docType: string): Promise<EkycResult> {
  // TODO: implémenter avec @onfido/node-sdk
  throw new Error("Provider Onfido non configuré. Contactez votre intégrateur.");
}

async function runSumsubEkyc(_ocr: OcrData, _docType: string): Promise<EkycResult> {
  // TODO: implémenter avec l'API Sum Sub
  throw new Error("Provider Sum Sub non configuré. Contactez votre intégrateur.");
}

// ─── API publique ─────────────────────────────────────────────────────────────

export async function runEkyc(
  ocr:      OcrData,
  docType:  string,
  customer: Pick<Customer, "firstName" | "lastName" | "dateOfBirth">,
  provider  = "local",
): Promise<EkycResult> {
  log.info({ docType, provider }, "Démarrage vérification eKYC");

  let result: EkycResult;
  switch (provider) {
    case "onfido": result = await runOnfidoEkyc(ocr, docType); break;
    case "sumsub": result = await runSumsubEkyc(ocr, docType); break;
    default:       result = await runLocalEkyc(ocr, docType, customer); break;
  }

  log.info({
    docType, provider,
    status:  result.status,
    score:   result.score,
    checks:  result.checks.filter(c => c.status !== "PASS" && c.status !== "SKIP")
             .map(c => `${c.id}:${c.status}`),
  }, "eKYC terminé");

  return result;
}
