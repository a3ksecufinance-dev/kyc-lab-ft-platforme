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
  cin?:             string;            // ex: K01234567 (1-2 lettres + 7-8 chiffres)
  can?:             string;            // Card Authentication Number (6 chiffres) — CNIE post-2020 uniquement
  dateNaissance?:   string;            // YYYY-MM-DD
  dateExpiration?:  string;            // YYYY-MM-DD
  lieuNaissance?:   string;            // Ville simple OU "préfecture - ville"
  prefecture?:      string;            // Ex: "TANGER ASSILAH" si présent
  sexe?:            "M" | "F";
  adresse?:         string;
  quartier?:        string;
  ville?:           string;
  filiationPere?:   string;            // "Fils de" (filiation père)
  filiationMere?:   string;            // "Fille/Fils de" (filiation mère)
  numEtatCivil?:    string;            // N° d'état civil (verso)
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
//
// Formats observés sur les vraies CIN marocaines :
//   - Ancienne génération : 1 lettre + 6 chiffres   (ex: A123456)
//   - Génération récente  : 1 lettre + 7 chiffres   (ex: U1234567, K0123456)
//   - CNIE post-2020      : 1-2 lettres + 7 chiffres (ex: K01234567)
//
// Regex unifiée acceptant tous les formats : [A-Z]{1,2}\d{6,8}

const CIN_REGEX = /\b([A-Z]{1,2}\d{6,8})\b/;

function normalizeCin(raw: string): string | undefined {
  const m = CIN_REGEX.exec(raw.toUpperCase().replace(/\s/g, ""));
  return m?.[1];
}

// ─── CAN (Card Authentication Number) — CNIE post-2020 ─────────────────────
//
// Apparaît en bas à droite du recto, format "CAN 123456" (6 chiffres).
// Présent uniquement sur les CIN nouvelles génération.

const CAN_REGEX = /\bCAN\s*[:：]?\s*(\d{6})\b/i;

function extractCan(rawText: string): string | undefined {
  const m = CAN_REGEX.exec(rawText);
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

// ─── Date FR (DD.MM.YYYY ou DD/MM/YYYY) → YYYY-MM-DD ───────────────────────
//
// Format utilisé sur les CIN marocaines pour "Né le" et "Valable jusqu'au".
// Observé : "29.11.1978", "09.09.2029", "05/12/1983", "22/07/2029"

const DATE_FR_REGEX = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/;

function frDateToIso(raw: string): string | undefined {
  const m = DATE_FR_REGEX.exec(raw);
  if (!m) return undefined;
  const dd = m[1]!.padStart(2, "0");
  const mm = m[2]!.padStart(2, "0");
  const yyyy = m[3]!;
  // Validation basique
  if (parseInt(dd) > 31 || parseInt(mm) > 12) return undefined;
  return `${yyyy}-${mm}-${dd}`;
}

// Extraction de toutes les dates FR dans un texte (utile pour distinguer
// naissance vs expiration sur le recto).
function extractAllFrDates(text: string): string[] {
  const dates: string[] = [];
  const re = new RegExp(DATE_FR_REGEX, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const iso = frDateToIso(m[0]);
    if (iso) dates.push(iso);
  }
  return dates;
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
//
// Structure typique CIN marocaine recto (latin) :
//
//   ROYAUME DU MAROC
//   CARTE NATIONALE D'IDENTITE
//
//   [PHOTO]   PRENOM
//             NOM
//             Né le      DD.MM.YYYY
//             à          VILLE - PREFECTURE
//
//             [signature]
//   N°  ABC1234567        Valable jusqu'au DD.MM.YYYY
//                                    CAN 123456
//
// Particularités :
//   - Le prénom apparaît AU-DESSUS du nom (et non l'inverse)
//   - "Né le" et "à" sont des marqueurs Latin (pas "Lieu de naissance")
//   - "Valable jusqu'au" pour expiration (pas "Date d'expiration")
//   - CAN visible uniquement sur CNIE post-2020

function extractRectoText(rawText: string): Partial<CinMarocFields> {
  const fields: Partial<CinMarocFields> = {};
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

  // ── CAN (bas du recto, format "CAN 123456") ───────────────────────────────
  const can = extractCan(rawText);
  if (can) fields.can = can;

  // ── N° CIN (n'importe où, format "N° K01234567" ou ligne brute) ──────────
  if (!fields.cin) {
    const cin = normalizeCin(rawText);
    if (cin) fields.cin = cin;
  }

  // ── Dates : "Né le DD.MM.YYYY" + "Valable jusqu'au DD.MM.YYYY" ──────────
  // Heuristique : la 1ère date est la naissance, la 2e (plus récente) est l'expiration
  const allDates = extractAllFrDates(rawText);
  if (allDates.length >= 1) {
    // Trier : naissance < expiration
    const sorted = [...allDates].sort();
    fields.dateNaissance = sorted[0];
    if (allDates.length >= 2) {
      fields.dateExpiration = sorted[sorted.length - 1];
    }
  }

  // ── Recherche explicite des marqueurs Latin ─────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lower = line.toLowerCase();

    // "Né le DD.MM.YYYY" — Date naissance prioritaire
    if (lower.startsWith("né le") || lower.startsWith("ne le")) {
      const dt = frDateToIso(line);
      if (dt) fields.dateNaissance = dt;
    }

    // "Valable jusqu'au DD.MM.YYYY" — Date expiration prioritaire
    if (lower.includes("valable") || lower.includes("jusqu")) {
      const dt = frDateToIso(line);
      if (dt) fields.dateExpiration = dt;
    }

    // "à VILLE - PREFECTURE" — Lieu naissance
    // Capté avec ligne commençant par "à" ou "a " suivi d'une ville
    if (!fields.lieuNaissance && (line.startsWith("à ") || line.startsWith("a ") || line.startsWith("À "))) {
      const val = line.replace(/^[àaÀ]\s+/, "").trim();
      if (val && val.length > 1 && /[A-Z]/.test(val)) {
        const parts = val.split(/\s+[-–]\s+/);
        if (parts.length === 2) {
          fields.lieuNaissance = parts[0]!.toUpperCase();
          fields.prefecture   = parts[1]!.toUpperCase();
        } else {
          fields.lieuNaissance = val.toUpperCase();
        }
      }
    }

    // ─── Nom + Prénom (ligne en MAJUSCULES, pas de chiffres, ≥ 2 chars) ─
    // Le prénom est typiquement la PREMIÈRE ligne MAJUSCULE avant la date naissance
    // Le nom est la DEUXIÈME ligne MAJUSCULE
    if (!fields.prenom || !fields.nom) {
      const isAllCaps = /^[A-ZÉÈÀÂÊÎÔÛÄËÏÖÜÇ\s'-]+$/.test(line) && line.length >= 2 && line.length <= 40;
      if (isAllCaps && !line.match(/ROYAUME|CARTE|NATIONALE|IDENTITE|MAROC|GENERAL|DIRECTEUR|NATIONAL|VALABLE|JUSQU/i)) {
        if (!fields.prenom) {
          fields.prenom = line.trim();
        } else if (!fields.nom) {
          fields.nom = line.trim();
        }
      }
    }
  }

  return fields;
}

// ─── Extraction champs texte verso ───────────────────────────────────────────
//
// Structure typique CIN marocaine verso (latin) :
//
//   Valable jusqu'au DD.MM.YYYY
//
//   Fils de       NOM_PERE
//   Fille de      NOM_MERE         (selon le sexe)
//   et de         NOM_MERE
//
//   Adresse       12 RUE HASSAN II QUARTIER GAUTHIER CASABLANCA
//                 [code-barres 2D PDF417]
//
//   N° état civil  12345/SECT  Sexe : F
//
// Particularités :
//   - "Fils/Fille de" = filiation père
//   - "et de" = filiation mère
//   - Adresse souvent sur 1 ou 2 lignes
//   - Sexe : "M" / "F" en fin de ligne

function extractVersoText(rawText: string): Partial<CinMarocFields> {
  const fields: Partial<CinMarocFields> = {};
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lower = line.toLowerCase();

    // ── Adresse (souvent sur 1-2 lignes après "Adresse") ─────────────────
    if (!fields.adresse && (lower.startsWith("adresse") || lower.includes("adresse"))) {
      let val = line.replace(/^[^:：]*adresse\s*[:：]?\s*/i, "").trim();
      // Si l'adresse continue sur la ligne suivante (sans étiquette)
      if (val.length < 5 && i + 1 < lines.length) {
        val = lines[i + 1]!.trim();
      }
      if (val && val.length > 2) fields.adresse = val;
    }

    // ── Filiation père : "Fils de" ou "Fille de" ─────────────────────────
    if (!fields.filiationPere && /^(fils|fille) de\b/i.test(line)) {
      const val = line.replace(/^(fils|fille) de\s*[:：]?\s*/i, "").trim();
      if (val && val.length > 1) fields.filiationPere = val.toUpperCase();
    }

    // ── Filiation mère : "et de" ─────────────────────────────────────────
    if (!fields.filiationMere && /^et de\b/i.test(line)) {
      const val = line.replace(/^et de\s*[:：]?\s*/i, "").trim();
      if (val && val.length > 1) fields.filiationMere = val.toUpperCase();
    }

    // ── N° état civil ────────────────────────────────────────────────────
    if (!fields.numEtatCivil && (lower.includes("état civil") || lower.includes("etat civil") || lower.includes("n° état"))) {
      const m = /(\d{1,6}\s*\/?\s*[A-Z0-9-]*)/i.exec(line.replace(/^[^:：]+[:：]\s*/, ""));
      if (m) fields.numEtatCivil = m[1]!.trim();
    }

    // ── Quartier (rare champ explicite, plutôt extrait de l'adresse) ────
    if (!fields.quartier && (lower.startsWith("quartier") || lower.includes("quartier"))) {
      const val = line.replace(/^[^:：]+[:：]\s*/i, "").trim();
      if (val && val.length > 1) fields.quartier = val;
    }

    // ── Ville / Commune ─────────────────────────────────────────────────
    if (!fields.ville && (lower.startsWith("ville") || lower.startsWith("commune") || lower.includes("localité"))) {
      const val = line.replace(/^[^:：]+[:：]\s*/i, "").trim();
      if (val && val.length > 1) fields.ville = val.toUpperCase();
    }

    // ── Sexe sur le verso ────────────────────────────────────────────────
    // Patterns observés : "Sexe : F", "Sexe F", "Sexe : M"
    if (!fields.sexe) {
      // Cas explicite "Sexe X"
      const sexMatch = /sexe\s*[:：]?\s*([MF])\b/i.exec(line);
      if (sexMatch) {
        const v = sexMatch[1]!.toUpperCase();
        if (v === "M" || v === "F") fields.sexe = v;
      } else if (lower.includes("masculin")) fields.sexe = "M";
      else if (lower.includes("féminin") || lower.includes("feminin")) fields.sexe = "F";
    }
  }

  // Tentative adresse heuristique si non trouvée par label
  // (lignes qui ressemblent à une adresse : numéro + rue)
  if (!fields.adresse) {
    const addrMatch = lines.find(l => /^\d+[\s,]+[A-Za-zÀ-ÿ]/.test(l));
    if (addrMatch) fields.adresse = addrMatch;
  }

  // Heuristique ville : dernière ligne en MAJUSCULES de l'adresse contient souvent la ville
  if (!fields.ville && fields.adresse) {
    const tokens = fields.adresse.split(/[\s,]+/);
    const cityToken = tokens.reverse().find(t => /^[A-ZÉÈ]{3,}/.test(t));
    if (cityToken) fields.ville = cityToken.toUpperCase();
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
  "nom", "prenom", "cin", "can", "dateNaissance", "dateExpiration",
  "lieuNaissance", "prefecture", "sexe", "adresse", "quartier", "ville",
  "filiationPere", "filiationMere", "numEtatCivil",
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
