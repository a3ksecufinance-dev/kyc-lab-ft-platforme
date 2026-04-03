/**
 * Sprint 6 — Patch OCR service
 * Fichier : server/modules/documents/ocr.service.ts (REMPLACE l'existant)
 *
 * Changement unique : ajout conditionnel de "ara" (arabe) dans les langues Tesseract
 * si ENV.OCR_LANG_ARABIC=true. Fallback automatique sur fra+eng si arabe non dispo.
 * Tous les types, fonctions et logique MRZ sont strictement inchangés.
 */

import { ENV } from "../../_core/env";
import { createLogger } from "../../_core/logger";

const log = createLogger("ocr");

// ─── Types (inchangés) ────────────────────────────────────────────────────────

export interface MrzData {
  type:           string;
  documentCode:   string;
  issuingState:   string;
  surname:        string;
  givenNames:     string;
  documentNumber: string;
  nationality:    string;
  dateOfBirth:    string;
  sex:            string;
  expiryDate:     string;
  personalNumber: string;
  valid:          boolean;
}

export interface OcrData {
  firstName?:      string;
  lastName?:       string;
  fullName?:       string;
  dateOfBirth?:    string;
  expiryDate?:     string;
  documentNumber?: string;
  nationality?:    string;
  issuingCountry?: string;
  sex?:            string;
  mrz?: MrzData;
  rawText:     string;
  confidence:  number;
  processingMs: number;
  engine:      string;
  langUsed?:   string;  // Sprint 6 — langues Tesseract utilisées
}

// ─── Parser MRZ (inchangé) ────────────────────────────────────────────────────

function mrzChecksum(str: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i]!;
    const v = c === "<" ? 0
            : c >= "0" && c <= "9" ? parseInt(c)
            : c.charCodeAt(0) - 55;
    sum += v * (weights[i % 3]!);
  }
  return sum % 10;
}

function parseMrz(lines: string[]): MrzData | null {
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
  const yyyy = yy >= 30 ? 1900 + yy : 2000 + yy;
  return `${yyyy}-${mm}-${dd}`;
}

function extractMrzLines(text: string): string[] {
  const lines = text.split("\n").map(l => l.trim().toUpperCase());
  const mrzLines = lines.filter(l => {
    const chevrons = (l.match(/</g) ?? []).length;
    return l.length >= 28 && chevrons >= 3 && /^[A-Z0-9<]{28,}$/.test(l);
  });
  return mrzLines.slice(0, 3);
}

// ─── Sprint 6 — Langues OCR configurables ─────────────────────────────────────

function getOcrLanguages(): string[] {
  const base = ["fra", "eng"];
  // Ajouter arabe uniquement si activé ET package disponible
  if ((ENV as Record<string, unknown>)["OCR_LANG_ARABIC"] === true) {
    base.push("ara");
    log.info("OCR arabe activé (lang:ara)");
  }
  return base;
}

// ─── Service principal (modifié Sprint 6) ────────────────────────────────────

export async function runOcr(
  buffer:    Buffer,
  _mimeType: string,
  docType:   string,
): Promise<OcrData> {
  const t0 = Date.now();

  if (docType === "SELFIE") {
    return { rawText: "", confidence: 0, processingMs: 0, engine: "none" };
  }

  // eslint-disable-next-line no-useless-assignment
  let rawText    = "";
  // eslint-disable-next-line no-useless-assignment
  let confidence = 0;
  const langs    = getOcrLanguages();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { createWorker } = await import("tesseract.js" as any);

    let worker: unknown;
    try {
      // Tentative avec langues configurées (inc. arabe si activé)
      worker = await createWorker(langs, 1, { logger: () => {} });
    } catch (langErr) {
      // Fallback sur fra+eng si lang:ara non installé
      log.warn({ langErr, langs }, "Langues OCR non disponibles — fallback fra+eng");
      worker = await createWorker(["fra", "eng"], 1, { logger: () => {} });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (worker as any).recognize(buffer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (worker as any).terminate();

    rawText    = data.text ?? "";
    confidence = Math.round(data.confidence ?? 0);

  } catch (err) {
    log.error({ err, docType }, "Tesseract OCR échoué");
    return { rawText: "", confidence: 0, processingMs: Date.now() - t0, engine: "tesseract" };
  }

  let mrz: MrzData | undefined;
  if (docType === "PASSPORT" || docType === "ID_CARD") {
    const mrzLines = extractMrzLines(rawText);
    if (mrzLines.length >= 2) {
      mrz = parseMrz(mrzLines) ?? undefined;
    }
  }

  const result: OcrData = {
    rawText,
    confidence,
    processingMs: Date.now() - t0,
    engine: "tesseract",
    langUsed: langs.join("+"),  // Sprint 6 — traçabilité
  };

  if (mrz) {
    result.mrz = mrz;
    if (mrz.surname)        result.lastName      = mrz.surname;
    if (mrz.givenNames)     result.firstName     = mrz.givenNames;
    const fullName = [mrz.givenNames, mrz.surname].filter(Boolean).join(" ");
    if (fullName)           result.fullName      = fullName;
    if (mrz.documentNumber) result.documentNumber = mrz.documentNumber;
    if (mrz.nationality)    result.nationality   = mrz.nationality;
    if (mrz.issuingState)   result.issuingCountry = mrz.issuingState;
    if (mrz.sex && mrz.sex !== "<") result.sex = mrz.sex;
    const dob = mrzDateToIso(mrz.dateOfBirth);
    if (dob) result.dateOfBirth = dob;
    const exp = mrzDateToIso(mrz.expiryDate);
    if (exp) result.expiryDate = exp;
  }

  log.info({
    docType, confidence, ms: result.processingMs,
    hasMrz: !!mrz, mrzValid: mrz?.valid, langs,
  }, "OCR terminé");

  return result;
}
