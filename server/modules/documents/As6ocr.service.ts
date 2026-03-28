/**
 * Service OCR — extraction de données depuis les documents d'identité
 *
 * Moteur : Tesseract.js (WASM, aucun service externe, RGPD-friendly)
 * Langues : fra + eng (couvre la majorité des documents européens)
 *
 * Documents supportés :
 *   PASSPORT         → MRZ 2 lignes (TD3)
 *   ID_CARD          → MRZ 3 lignes (TD1) ou 2 lignes (TD2)
 *   DRIVING_LICENSE  → extraction textuelle libre
 *   PROOF_OF_ADDRESS → extraction textuelle libre
 *   SELFIE           → pas d'OCR (comparaison visuelle future)
 *
 * Structure de sortie OcrData :
 *   firstName, lastName, dateOfBirth, expiryDate,
 *   documentNumber, nationality, issuingCountry,
 *   mrz (objet parsé), fullName, confidence
 */

import { createLogger } from "../../_core/logger";

const log = createLogger("ocr");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MrzData {
  type:           string;   // "TD1" | "TD3" | "TD2"
  documentCode:   string;
  issuingState:   string;
  surname:        string;
  givenNames:     string;
  documentNumber: string;
  nationality:    string;
  dateOfBirth:    string;   // YYMMDD
  sex:            string;   // M / F / <
  expiryDate:     string;   // YYMMDD
  personalNumber: string;
  valid:          boolean;  // checksums valides
}

export interface OcrData {
  // Champs structurés extraits
  firstName?:      string;
  lastName?:       string;
  fullName?:       string;
  dateOfBirth?:    string;  // ISO : YYYY-MM-DD
  expiryDate?:     string;  // ISO : YYYY-MM-DD
  documentNumber?: string;
  nationality?:    string;
  issuingCountry?: string;
  sex?:            string;

  // MRZ parsé (si présent)
  mrz?: MrzData;

  // Métadonnées OCR
  rawText:     string;
  confidence:  number;  // 0-100
  processingMs: number;
  engine:      string;  // "tesseract" | "mock"
}

// ─── Parser MRZ ───────────────────────────────────────────────────────────────

function mrzChecksum(str: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i]!;
    const v = c === "<" ? 0
            : c >= "0" && c <= "9" ? parseInt(c)
            : c.charCodeAt(0) - 55;  // A=10, B=11, ...
    sum += v * (weights[i % 3]!);
  }
  return sum % 10;
}

function parseMrz(lines: string[]): MrzData | null {
  // TD3 — Passeport (2 lignes de 44 chars)
  if (lines.length >= 2 && lines[0]!.length >= 44 && lines[1]!.length >= 44) {
    const l1 = lines[0]!.padEnd(44, "<").slice(0, 44);
    const l2 = lines[1]!.padEnd(44, "<").slice(0, 44);

    if (l1[0] === "P") {
      const namePart = l1.slice(5, 44);
      const [surnameRaw, ...givenRaw] = namePart.split("<<");
      const surname    = (surnameRaw ?? "").replace(/</g, " ").trim();
      const givenNames = givenRaw.join(" ").replace(/</g, " ").trim();

      const docNum    = l2.slice(0, 9).replace(/</g, "");
      const dob       = l2.slice(13, 19);
      const expiry    = l2.slice(21, 27);
      const natCode   = l2.slice(10, 13);
      const issuing   = l1.slice(2, 5);
      const personal  = l2.slice(28, 42);
      const sex       = l2[20] ?? "<";

      // Valider les checksums
      const check1 = mrzChecksum(l2.slice(0, 9)) === parseInt(l2[9] ?? "x");
      const check2 = mrzChecksum(dob)            === parseInt(l2[19] ?? "x");
      const check3 = mrzChecksum(expiry)         === parseInt(l2[27] ?? "x");

      return {
        type: "TD3", documentCode: l1.slice(0, 2),
        issuingState: issuing, surname, givenNames,
        documentNumber: docNum, nationality: natCode,
        dateOfBirth: dob, sex, expiryDate: expiry,
        personalNumber: personal.replace(/</g, ""),
        valid: check1 && check2 && check3,
      };
    }
  }

  // TD1 — Carte d'identité (3 lignes de 30 chars)
  if (lines.length >= 3 && lines[0]!.length >= 30) {
    const l1 = lines[0]!.slice(0, 30);
    const l2 = lines[1]!.slice(0, 30);
    const l3 = lines[2]!.slice(0, 30);

    const docNum  = l1.slice(5, 14).replace(/</g, "");
    const dob     = l2.slice(0, 6);
    const expiry  = l2.slice(8, 14);
    const natCode = l2.slice(15, 18);
    const issuing = l1.slice(2, 5);
    const sex     = l2[7] ?? "<";

    const namePart = l3.replace(/</g, " ").trim();
    const [surnameRaw, ...givenRaw] = namePart.split("  ");
    const surname    = (surnameRaw ?? "").trim();
    const givenNames = givenRaw.join(" ").trim();

    const check1 = mrzChecksum(l2.slice(0, 6)) === parseInt(l2[6] ?? "x");
    const check2 = mrzChecksum(l2.slice(8, 14)) === parseInt(l2[14] ?? "x");

    return {
      type: "TD1", documentCode: l1.slice(0, 2),
      issuingState: issuing, surname, givenNames,
      documentNumber: docNum, nationality: natCode,
      dateOfBirth: dob, sex, expiryDate: expiry,
      personalNumber: "",
      valid: check1 && check2,
    };
  }

  return null;
}

function mrzDateToIso(yymmdd: string): string | undefined {
  if (!yymmdd || yymmdd.length !== 6) return undefined;
  const yy = parseInt(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  // Convention OACI : YY >= 30 → 19xx, YY < 30 → 20xx
  const yyyy = yy >= 30 ? 1900 + yy : 2000 + yy;
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Extraction MRZ depuis le texte brut ──────────────────────────────────────

function extractMrzLines(text: string): string[] {
  // Les lignes MRZ contiennent beaucoup de "<" et des majuscules
  const lines = text.split("\n").map(l => l.trim().toUpperCase());
  const mrzLines = lines.filter(l => {
    const chevrons = (l.match(/</g) ?? []).length;
    return l.length >= 28 && chevrons >= 3 && /^[A-Z0-9<]{28,}$/.test(l);
  });
  return mrzLines.slice(0, 3);
}

// ─── Service principal ────────────────────────────────────────────────────────

export async function runOcr(
  buffer:   Buffer,
  _mimeType: string,
  docType:  string,
): Promise<OcrData> {
  const t0 = Date.now();

  // SELFIE → pas d'OCR
  if (docType === "SELFIE") {
    return {
      rawText: "", confidence: 0,
      processingMs: 0, engine: "none",
    };
  }

  let rawText    = "";
  let confidence = 0;

  try {
    // Import dynamique — tesseract.js charge le WASM à la demande
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { createWorker } = await import("tesseract.js" as any);

    const worker = await createWorker(["fra", "eng"], 1, {
      logger: () => {},  // désactiver les logs de progression
    });

    const { data } = await worker.recognize(buffer);
    await worker.terminate();

    rawText    = data.text ?? "";
    confidence = Math.round(data.confidence ?? 0);

  } catch (err) {
    log.error({ err, docType }, "Tesseract OCR échoué");
    // Retourner un résultat vide plutôt que de planter
    return {
      rawText: "", confidence: 0,
      processingMs: Date.now() - t0,
      engine: "tesseract",
    };
  }

  // Extraire les lignes MRZ si document d'identité
  let mrz: MrzData | undefined;
  if (docType === "PASSPORT" || docType === "ID_CARD") {
    const mrzLines = extractMrzLines(rawText);
    if (mrzLines.length >= 2) {
      mrz = parseMrz(mrzLines) ?? undefined;
    }
  }

  // Construire OcrData structuré
  const result: OcrData = {
    rawText,
    confidence,
    processingMs: Date.now() - t0,
    engine: "tesseract",
  };

  if (mrz) {
    result.mrz = mrz;
    if (mrz.surname)       result.lastName      = mrz.surname;
    if (mrz.givenNames)    result.firstName     = mrz.givenNames;
    const fullName = [mrz.givenNames, mrz.surname].filter(Boolean).join(" ");
    if (fullName)          result.fullName      = fullName;
    if (mrz.documentNumber) result.documentNumber = mrz.documentNumber;
    if (mrz.nationality)   result.nationality   = mrz.nationality;
    if (mrz.issuingState)  result.issuingCountry = mrz.issuingState;
    if (mrz.sex && mrz.sex !== "<") result.sex = mrz.sex;
    const dob = mrzDateToIso(mrz.dateOfBirth);
    if (dob) result.dateOfBirth = dob;
    const exp = mrzDateToIso(mrz.expiryDate);
    if (exp) result.expiryDate = exp;
  }

  log.info({
    docType, confidence,
    ms:        result.processingMs,
    hasMrz:    !!mrz,
    mrzValid:  mrz?.valid,
  }, "OCR terminé");

  return result;
}
