/**
 * OCR spécialisé CIN marocaine — Carte d'Identité Nationale du Maroc
 *
 * CIN Recto (TD1 MRZ 3×30) :
 *   Ligne 1 : IDMAR + N°CIN + check + filler
 *   Ligne 2 : dateNaissance(6) + check + sexe(1) + dateExpiration(6) + check + MAR + filler
 *   Ligne 3 : NOM << PRENOM (padded to 30)
 *
 * CIN Verso :
 *   Texte libre : Adresse, Quartier, Ville (Latin + Arabe)
 *   Le champ sexe peut aussi apparaître sur le verso.
 *
 * Format N° CIN marocain : [A-Z]{1,2}\d{5,6}
 *   Ex : A123456 (1 lettre + 6 chiffres)
 *        AB123456 (2 lettres + 6 chiffres)
 */

import { createLogger } from "../../_core/logger";
import { runOcr }       from "./ocr.service";

const log = createLogger("ocr-cin-maroc");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CinMarocFields {
  nom?:             string;
  prenom?:          string;
  cin?:             string;
  dateNaissance?:   string;   // YYYY-MM-DD
  dateExpiration?:  string;   // YYYY-MM-DD
  lieuNaissance?:   string;
  sexe?:            "M" | "F";
  adresse?:         string;
  quartier?:        string;
  ville?:           string;
}

export interface CinMarocOcrResult {
  recto:      CinMarocFields;
  verso:      CinMarocFields;
  merged:     CinMarocFields;
  confidence: { recto: number; verso: number; overall: number };
  mrzValid:   boolean;
  rawRecto:   string;
  rawVerso:   string;
}

export interface CinValidationResult {
  valid:    string[];          // champs OCR correspondant aux données CBS
  missing:  string[];          // champs attendus mais non extraits par OCR
  mismatch: Array<{
    field:   string;
    cbs:     string;
    ocr:     string;
    similar: boolean;          // true si différence mineure (casse, accent)
  }>;
  score:    number;            // 0-100 — qualité globale de la correspondance
}

// ─── Format CIN marocain ─────────────────────────────────────────────────────

const CIN_REGEX = /\b([A-Z]{1,2}\d{5,6})\b/;

function normalizeCin(raw: string): string | undefined {
  const m = CIN_REGEX.exec(raw.toUpperCase().replace(/\s/g, ""));
  return m?.[1];
}

// ─── Date MRZ (YYMMDD) → YYYY-MM-DD ─────────────────────────────────────────

function mrzDateToIso(yymmdd: string): string | undefined {
  if (!yymmdd || yymmdd.length !== 6) return undefined;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const yyyy = yy >= 30 ? 1900 + yy : 2000 + yy;
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Parser MRZ TD1 CIN marocaine ────────────────────────────────────────────

function parseMrzMaroc(lines: string[]): Partial<CinMarocFields> & { valid: boolean } {
  const fields: Partial<CinMarocFields> & { valid: boolean } = { valid: false };

  // Filtrer les lignes MRZ : 3 lignes de 30 chars avec chevrons
  const mrzLines = lines
    .map(l => l.trim().toUpperCase())
    .filter(l => l.length >= 28 && /^[A-Z0-9<]{28,}$/.test(l));

  if (mrzLines.length < 2) return fields;

  // Ligne 1 : IDMAR + CIN + filler (30 chars)
  const l1 = mrzLines[0]!.padEnd(30, "<").slice(0, 30);
  if (!l1.startsWith("IDMAR") && !l1.startsWith("ID<MAR") && !l1.startsWith("ID")) {
    // Essayons quand même
  }

  // Extraire N° CIN depuis ligne 1 (positions 5-14)
  const cinRaw = l1.slice(5, 14).replace(/</g, "").trim();
  const cin = normalizeCin(cinRaw) ?? normalizeCin(l1);
  if (cin) fields.cin = cin;

  // Ligne 2 : dateNaissance(6) + check + sexe + dateExpiration(6) + check + ...
  const l2 = mrzLines[1]!.padEnd(30, "<").slice(0, 30);
  const dob    = l2.slice(0, 6);
  const sexRaw = l2[7];
  const exp    = l2.slice(8, 14);

  const dateNaissance  = mrzDateToIso(dob);
  const dateExpiration = mrzDateToIso(exp);

  if (dateNaissance)  fields.dateNaissance  = dateNaissance;
  if (dateExpiration) fields.dateExpiration = dateExpiration;
  if (sexRaw === "M") fields.sexe = "M";
  if (sexRaw === "F") fields.sexe = "F";

  // Ligne 3 : NOM << PRENOM
  const l3 = mrzLines[2]!.padEnd(30, "<").slice(0, 30);
  const sep = l3.indexOf("<<");
  if (sep >= 0) {
    const nomPart    = l3.slice(0, sep).replace(/</g, " ").trim();
    const prenomPart = l3.slice(sep + 2).replace(/</g, " ").trim();
    if (nomPart)    fields.nom    = nomPart;
    if (prenomPart) fields.prenom = prenomPart;
  } else {
    // Pas de séparateur — tout est le nom
    const namePart = l3.replace(/</g, " ").trim();
    if (namePart) fields.nom = namePart;
  }

  fields.valid = !!(fields.cin || fields.dateNaissance || fields.nom);
  return fields;
}

// ─── Extraction champs texte recto ───────────────────────────────────────────

function extractRectoText(rawText: string): Partial<CinMarocFields> {
  const fields: Partial<CinMarocFields> = {};
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Nom : "Nom : BENALI" ou "NOM BENALI" ou "Nom de famille :"
    if (!fields.nom && (lower.startsWith("nom") || lower.includes("name"))) {
      const val = line.replace(/^[^:：]+[:：]\s*/i, "").trim().toUpperCase();
      if (val && val.length > 1 && !/\d/.test(val)) fields.nom = val;
    }

    // Prénom
    if (!fields.prenom && (lower.startsWith("pré") || lower.startsWith("pre") || lower.includes("prenom"))) {
      const val = line.replace(/^[^:：]+[:：]\s*/i, "").trim().toUpperCase();
      if (val && val.length > 1 && !/\d/.test(val)) fields.prenom = val;
    }

    // Lieu de naissance
    if (!fields.lieuNaissance && (lower.includes("né") || lower.includes("naissance") || lower.includes("lieu"))) {
      const val = line.replace(/^[^:：]+[:：]\s*/i, "").trim();
      if (val && val.length > 1) fields.lieuNaissance = val.toUpperCase();
    }

    // N° CIN dans le texte libre
    if (!fields.cin) {
      const cin = normalizeCin(line);
      if (cin) fields.cin = cin;
    }

    // Sexe
    if (!fields.sexe) {
      if (lower.includes("masculin") || lower === "m" || lower.includes("sexe : m")) fields.sexe = "M";
      if (lower.includes("féminin") || lower.includes("feminin") || lower === "f") fields.sexe = "F";
    }
  }

  return fields;
}

// ─── Extraction champs texte verso ───────────────────────────────────────────

function extractVersoText(rawText: string): Partial<CinMarocFields> {
  const fields: Partial<CinMarocFields> = {};
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Adresse
    if (!fields.adresse && lower.startsWith("adresse")) {
      const val = line.replace(/^[^:：]+[:：]\s*/i, "").trim();
      if (val && val.length > 2) fields.adresse = val;
    }

    // Quartier
    if (!fields.quartier && (lower.startsWith("quartier") || lower.includes("quartier"))) {
      const val = line.replace(/^[^:：]+[:：]\s*/i, "").trim();
      if (val && val.length > 1) fields.quartier = val;
    }

    // Ville / Commune
    if (!fields.ville && (lower.startsWith("ville") || lower.startsWith("commune") || lower.includes("localité"))) {
      const val = line.replace(/^[^:：]+[:：]\s*/i, "").trim();
      if (val && val.length > 1) fields.ville = val.toUpperCase();
    }

    // Sexe sur le verso
    if (!fields.sexe) {
      if (lower.includes("masculin") || (lower.includes("sexe") && lower.includes("m"))) fields.sexe = "M";
      if (lower.includes("féminin") || lower.includes("feminin")) fields.sexe = "F";
    }
  }

  // Tentative adresse heuristique si non trouvée par label
  // (lignes qui ressemblent à une adresse : numéro + rue)
  if (!fields.adresse) {
    const addrMatch = lines.find(l => /^\d+[\s,]+[A-Za-zÀ-ÿ]/.test(l));
    if (addrMatch) fields.adresse = addrMatch;
  }

  return fields;
}

// ─── Service principal ────────────────────────────────────────────────────────

export async function ocrCinMaroc(
  rectoBuffer: Buffer,
  versoBuffer: Buffer,
  mimeType = "image/jpeg",
): Promise<CinMarocOcrResult> {
  log.info("Démarrage OCR CIN marocaine (recto + verso)");

  const [rectoOcr, versoOcr] = await Promise.all([
    runOcr(rectoBuffer, mimeType, "ID_CARD"),
    runOcr(versoBuffer, mimeType, "ID_CARD"),
  ]);

  // ── Parsing recto ──────────────────────────────────────────────────────────
  const mrzFields  = rectoOcr.mrz ? parseMrzMaroc([
    rectoOcr.mrz.issuingState ? `IDMAR${rectoOcr.mrz.documentNumber}` : "",
    `${rectoOcr.mrz.dateOfBirth}0${rectoOcr.mrz.sex}${rectoOcr.mrz.expiryDate}0MAR`,
    `${rectoOcr.mrz.surname}<<${rectoOcr.mrz.givenNames}`,
  ]) : parseMrzMaroc(rectoOcr.rawText.split("\n"));

  const rectoText  = extractRectoText(rectoOcr.rawText);

  const recto: CinMarocFields = {
    nom:            mrzFields.nom            ?? rectoText.nom           ?? rectoOcr.lastName?.toUpperCase(),
    prenom:         mrzFields.prenom         ?? rectoText.prenom        ?? rectoOcr.firstName?.toUpperCase(),
    cin:            mrzFields.cin            ?? rectoText.cin           ?? rectoOcr.documentNumber,
    dateNaissance:  mrzFields.dateNaissance  ?? rectoText.dateNaissance ?? rectoOcr.dateOfBirth,
    dateExpiration: mrzFields.dateExpiration ?? rectoText.dateExpiration ?? rectoOcr.expiryDate,
    lieuNaissance:  rectoText.lieuNaissance,
    sexe:           mrzFields.sexe           ?? rectoText.sexe,
  };

  // ── Parsing verso ──────────────────────────────────────────────────────────
  const versoText = extractVersoText(versoOcr.rawText);
  const verso: CinMarocFields = {
    adresse:  versoText.adresse,
    quartier: versoText.quartier,
    ville:    versoText.ville,
    sexe:     versoText.sexe ?? recto.sexe,
  };

  // ── Fusion ─────────────────────────────────────────────────────────────────
  const merged: CinMarocFields = {
    ...recto,
    ...verso,
    sexe: recto.sexe ?? verso.sexe,
  };

  const confidence = {
    recto:   rectoOcr.confidence,
    verso:   versoOcr.confidence,
    overall: Math.round((rectoOcr.confidence + versoOcr.confidence) / 2),
  };

  log.info({
    mrzValid:   mrzFields.valid,
    rectoConf:  rectoOcr.confidence,
    versoConf:  versoOcr.confidence,
    fieldsFound: Object.values(merged).filter(Boolean).length,
  }, "OCR CIN marocaine terminé");

  return {
    recto,
    verso,
    merged,
    confidence,
    mrzValid:  mrzFields.valid,
    rawRecto:  rectoOcr.rawText,
    rawVerso:  versoOcr.rawText,
  };
}

// ─── Validation CBS vs OCR ────────────────────────────────────────────────────

const ALL_FIELDS: (keyof CinMarocFields)[] = [
  "nom", "prenom", "cin", "dateNaissance", "dateExpiration",
  "lieuNaissance", "sexe", "adresse", "quartier", "ville",
];

function normalizeForCompare(s: string): string {
  return s.toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove accents
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSimilar(a: string, b: string): boolean {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na === nb) return true;
  // Contenance (ex: "CASABLANCA" contient "CASA")
  return na.includes(nb) || nb.includes(na);
}

export function validateCbsVsOcr(
  cbsFields: Partial<CinMarocFields>,
  ocrFields: CinMarocFields,
): CinValidationResult {
  const valid:    string[] = [];
  const missing:  string[] = [];
  const mismatch: CinValidationResult["mismatch"] = [];

  for (const field of ALL_FIELDS) {
    const cbsVal = cbsFields[field];
    const ocrVal = ocrFields[field];

    if (!cbsVal) continue; // CBS n'a pas fourni ce champ → pas de comparaison

    if (!ocrVal) {
      missing.push(field);
      continue;
    }

    const similar = isSimilar(String(cbsVal), String(ocrVal));
    if (similar) {
      valid.push(field);
    } else {
      mismatch.push({
        field,
        cbs:     String(cbsVal),
        ocr:     String(ocrVal),
        similar: false,
      });
    }
  }

  // Champs OCR extraits mais absents des données CBS
  for (const field of ALL_FIELDS) {
    if (!cbsFields[field] && ocrFields[field] && !missing.includes(field)) {
      // Champ bonus extrait par OCR — pas une erreur, juste informatif
    }
  }

  const totalCbs    = ALL_FIELDS.filter(f => !!cbsFields[f]).length;
  const validCount  = valid.length;
  const score       = totalCbs > 0 ? Math.round((validCount / totalCbs) * 100) : 100;

  return { valid, missing, mismatch, score };
}

// ─── Vérification champs modifiés vs OCR ─────────────────────────────────────

export function verifyModifiedFields(
  modifiedFields: string[],
  submittedValues: Partial<CinMarocFields>,
  ocrResult: CinMarocOcrResult,
): { field: string; submitted: string; ocr: string; coherent: boolean }[] {
  return modifiedFields.map(field => {
    const f       = field as keyof CinMarocFields;
    const submitted = String(submittedValues[f] ?? "");
    const ocr       = String(ocrResult.merged[f] ?? "");
    return {
      field,
      submitted,
      ocr,
      coherent: !ocr || isSimilar(submitted, ocr),
    };
  });
}
