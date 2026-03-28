/**
 * Sprint 6 — Localisation MENA
 * Fichier : server/modules/screening/screening.matcher.ts (REMPLACE l'existant)
 *
 * Nouveautés vs version actuelle :
 *  1. Table ARABIC complète — 28 lettres + variantes + hamza + taa marbuta
 *  2. Normalisation Darija (dialecte marocain) — chiffres arabes, particules
 *  3. Noms composés arabes — "Ben/Ibn/Bint/Bent/Ould/Weld" tokenisés
 *  4. Translittération ICAO 9303 — standard passeports MENA
 *  5. Score phonétique arabe — compense les variantes de translittération
 */

import levenshtein from "fast-levenshtein";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SanctionEntity {
  id:           string;
  name:         string;
  aliases?:     string[];
  country?:     string;
  dateOfBirth?: string;
  nationality?: string;
  listSource:   string;
  entityType?:  "individual" | "entity" | "vessel" | "aircraft";
  programs?:    string[];
}

export interface MatchResult {
  matched:        boolean;
  score:          number;
  matchedEntity?: string | undefined;
  matchedAlias?:  string | undefined;
  listSource?:    string | undefined;
  entityId?:      string | undefined;
  matchMethod?:   string | undefined;
}

// ─── Translittération cyrillique (inchangée) ──────────────────────────────────

const CYRILLIC: Record<string, string> = {
  "А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ё":"YO","Ж":"ZH","З":"Z",
  "И":"I","Й":"Y","К":"K","Л":"L","М":"M","Н":"N","О":"O","П":"P","Р":"R",
  "С":"S","Т":"T","У":"U","Ф":"F","Х":"KH","Ц":"TS","Ч":"CH","Ш":"SH",
  "Щ":"SHCH","Ъ":"","Ы":"Y","Ь":"","Э":"E","Ю":"YU","Я":"YA",
  "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z",
  "и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r",
  "с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts","ч":"ch","ш":"sh",
  "щ":"shch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya",
};

// ─── Translittération arabe COMPLÈTE — ICAO 9303 + variantes MENA ─────────────
// Sprint 6 : table complète 28 lettres + hamza + variantes dialectales

const ARABIC: Record<string, string> = {
  // ── Lettres de base ─────────────────────────────────────────────────────────
  "\u0627": "A",   // ا alef
  "\u0628": "B",   // ب ba
  "\u062A": "T",   // ت ta
  "\u062B": "TH",  // ث tha
  "\u062C": "J",   // ج jim
  "\u062D": "H",   // ح ha (pharyngale)
  "\u062E": "KH",  // خ kha
  "\u062F": "D",   // د dal
  "\u0630": "TH",  // ذ dhal
  "\u0631": "R",   // ر ra
  "\u0632": "Z",   // ز zayn
  "\u0633": "S",   // س sin
  "\u0634": "SH",  // ش shin
  "\u0635": "S",   // ص sad (emphatique)
  "\u0636": "D",   // ض dad (emphatique)
  "\u0637": "T",   // ط ta (emphatique)
  "\u0638": "Z",   // ظ dha (emphatique)
  "\u0639": "A",   // ع ayn
  "\u063A": "GH",  // غ ghayn
  "\u0641": "F",   // ف fa
  "\u0642": "Q",   // ق qaf
  "\u0643": "K",   // ك kaf
  "\u0644": "L",   // ل lam
  "\u0645": "M",   // م mim
  "\u0646": "N",   // ن nun
  "\u0647": "H",   // ه ha
  "\u0648": "W",   // و waw (consonne) ou U (voyelle longue)
  "\u064A": "Y",   // ي ya (consonne) ou I (voyelle longue)

  // ── Variantes alef ────────────────────────────────────────────────────────
  "\u0622": "A",   // آ alef madda
  "\u0623": "A",   // أ alef hamza dessus
  "\u0625": "I",   // إ alef hamza dessous
  "\u0671": "A",   // ٱ alef wasla

  // ── Taa marbuta / alef maqsura ────────────────────────────────────────────
  "\u0629": "A",   // ة taa marbuta (fin de mot féminin)
  "\u0649": "A",   // ى alef maqsura

  // ── Hamza isolée ──────────────────────────────────────────────────────────
  "\u0621": "",    // ء hamza (son glottal, ignoré en translittération)
  "\u0624": "W",   // ؤ waw + hamza
  "\u0626": "Y",   // ئ ya + hamza

  // ── Lettres persanes/dariennes (Maroc/Algérie) ───────────────────────────
  "\u06A4": "V",   // ڤ fa' avec points (sons V en Darija)
  "\u06AF": "G",   // گ kaf persan (sons G)
  "\u0686": "CH",  // چ chin
  "\u067E": "P",   // پ pe

  // ── Diacritiques (supprimer) ──────────────────────────────────────────────
  "\u064B": "",    // tanwin fath
  "\u064C": "",    // tanwin damm
  "\u064D": "",    // tanwin kasr
  "\u064E": "",    // fatha
  "\u064F": "",    // damma
  "\u0650": "",    // kasra
  "\u0651": "",    // shadda (doublement consonne)
  "\u0652": "",    // sukun
  "\u0653": "",    // madda
  "\u0654": "",    // hamza dessus
  "\u0655": "",    // hamza dessous
  "\u0670": "",    // alef superscript

  // ── Chiffres arabes → latins (Darija) ────────────────────────────────────
  "\u0660": "0",   // ٠
  "\u0661": "1",   // ١
  "\u0662": "2",   // ٢
  "\u0663": "3",   // ٣
  "\u0664": "4",   // ٤
  "\u0665": "5",   // ٥
  "\u0666": "6",   // ٦
  "\u0667": "7",   // ٧
  "\u0668": "8",   // ٨
  "\u0669": "9",   // ٩
};

// ─── Particules arabes à normaliser (patronymes MENA) ─────────────────────────
// Ces particules ont plusieurs orthographes en latinisation — on les unifie

const ARABIC_PARTICLES: Record<string, string> = {
  // Particule "fils de"
  "BEN":   "BEN",  "BENI":  "BEN", "BINT":  "BINT",
  "IBN":   "BEN",  "BIN":   "BEN",
  "WELD":  "BEN",  "OULD":  "BEN", "OOULD": "BEN",
  "BENT":  "BINT", "BINTE": "BINT",
  // Article défini
  "AL":    "AL",   "EL":    "AL",  "AL-":   "AL",
  "EL-":   "AL",   "UL":    "AL",
  // Particule "père de"
  "ABI":   "ABI",  "ABU":   "ABI", "ABO":   "ABI",
  // Particule "mère de"
  "UMMA":  "UMMA", "UMMU":  "UMMA",
};

// ─── Translittération unifiée ─────────────────────────────────────────────────

function transliterate(s: string): string {
  // 1. Translittération caractère par caractère
  let result = "";
  for (const c of s) {
    result += CYRILLIC[c] ?? ARABIC[c] ?? c;
  }
  return result;
}

// ─── Normalisation particules arabes ─────────────────────────────────────────

function normalizeArabicParticles(name: string): string {
  const tokens = name.split(/\s+/);
  return tokens.map(t => {
    const upper = t.toUpperCase().replace(/-/g, "");
    return ARABIC_PARTICLES[upper] ?? t;
  }).join(" ");
}

// ─── Normalisation principale ─────────────────────────────────────────────────

export function normalizeName(name: string): string {
  // 1. Translittérer arabe/cyrillique
  const transliterated = transliterate(name);
  // 2. NFD + suppression diacritiques latins
  const nfd = transliterated
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  // 3. Majuscules + suppression caractères non-alphanumériques
  const upper = nfd
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 4. Normaliser les particules arabes
  return normalizeArabicParticles(upper);
}

function sortedTokens(s: string): string {
  return normalizeName(s).split(" ").sort().join(" ");
}

// ─── Variantes de translittération MENA ──────────────────────────────────────
// Un même nom arabe peut s'écrire de nombreuses façons en Latin
// Ex: Mohamed / Mohammed / Muhammad / Muhammed / Mouhamed

const ARABIC_TRANSLIT_VARIANTS: Record<string, string[]> = {
  "MOHAMED":   ["MOHAMMED","MUHAMMAD","MUHAMMED","MOUHAMED","MOHAMMAD","MEHMED"],
  "MOHAMMED":  ["MOHAMED","MUHAMMAD","MUHAMMED","MOUHAMED","MOHAMMAD"],
  "MUHAMMAD":  ["MOHAMED","MOHAMMED","MUHAMMED","MOUHAMED"],
  "ALI":       ["AALI","ALLI"],
  "HASSAN":    ["HASAN","HASEN","HACEN"],
  "HUSSEIN":   ["HUSAYN","HOSSEIN","HUSEIN","HSSAIN"],
  "AHMED":     ["AHMAD","AHMED","AHAMED","HAMAD"],
  "ABDALLAH":  ["ABDULLAH","ABDALAH","ABDELLAH","ABDELLAH"],
  "ABDELKRIM": ["ABDEL KRIM","ABDULKARIM","ABDELKRIM"],
  "FATIMA":    ["FATMA","FATIHA","FATMA"],
  "IBRAHIM":   ["IBRAHIM","EBRAHIM","BRAHIM"],
  "YOUSSEF":   ["YUSUF","YOSEF","YOUSEF","YOUSSUF"],
  "RACHID":    ["RASHID","RACHED","RASHEED"],
  "KARIM":     ["KAREEM","KERIM"],
};

function getArabicVariants(name: string): string[] {
  const normalized = normalizeName(name);
  const tokens = normalized.split(" ");
  const variants: string[] = [normalized];

  // Substituer chaque token par ses variantes
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const tokenVariants = ARABIC_TRANSLIT_VARIANTS[token] ?? [];
    for (const variant of tokenVariants) {
      const newTokens = [...tokens];
      newTokens[i] = variant;
      variants.push(newTokens.join(" "));
    }
  }

  return [...new Set(variants)];
}

// ─── Score de similarité enrichi ─────────────────────────────────────────────

export function computeSimilarityScore(a: string, b: string): {
  score: number;
  method: string;
} {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return { score: 0, method: "empty" };
  if (na === nb)  return { score: 100, method: "exact" };

  // ── Subset match ──────────────────────────────────────────────────────────
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer  = Math.max(na.length, nb.length);
    if (shorter >= 5) return { score: Math.round(90 + (shorter / longer) * 5), method: "subset" };
  }

  // ── Variantes arabe (Sprint 6) ────────────────────────────────────────────
  const variantsA = getArabicVariants(a);
  const variantsB = getArabicVariants(b);
  for (const va of variantsA) {
    for (const vb of variantsB) {
      if (va === vb) return { score: 95, method: "arabic_variant" };
    }
  }

  // ── Token Set Ratio ────────────────────────────────────────────────────────
  const tokensA = new Set(na.split(" ").filter(t => t.length > 1));
  const tokensB = new Set(nb.split(" ").filter(t => t.length > 1));
  const intersection = [...tokensA].filter(t => tokensB.has(t));
  if (tokensA.size > 0 && tokensB.size > 0) {
    const ratio = (2 * intersection.length) / (tokensA.size + tokensB.size);
    if (ratio >= 0.8) return { score: Math.round(ratio * 95), method: "token_set" };
  }

  // ── Token Sort Ratio ───────────────────────────────────────────────────────
  const sa = sortedTokens(a);
  const sb = sortedTokens(b);
  if (sa !== na || sb !== nb) {
    const sortedLen = Math.max(sa.length, sb.length);
    if (sortedLen > 0) {
      const sortScore = Math.round((1 - levenshtein.get(sa, sb) / sortedLen) * 100);
      if (sortScore > 80) return { score: sortScore, method: "token_sort" };
    }
  }

  // ── Variantes cross-tokens (particules différentes) ───────────────────────
  // Ex: "QADIRI RACHID" vs "EL QADIRI AL RACHID" → filtrer les particules
  const PARTICLE_SET = new Set(Object.values(ARABIC_PARTICLES));
  const filtA = na.split(" ").filter(t => !PARTICLE_SET.has(t) && t.length > 2);
  const filtB = nb.split(" ").filter(t => !PARTICLE_SET.has(t) && t.length > 2);
  if (filtA.length > 0 && filtB.length > 0) {
    const filtInter = filtA.filter(t => filtB.includes(t));
    const filtRatio = (2 * filtInter.length) / (filtA.length + filtB.length);
    if (filtRatio >= 0.8) return { score: Math.round(filtRatio * 90), method: "particle_filtered" };
  }

  // ── Levenshtein + bonus tokens partagés ────────────────────────────────────
  const maxLen     = Math.max(na.length, nb.length);
  const levScore   = Math.round((1 - levenshtein.get(na, nb) / maxLen) * 100);
  const allA       = na.split(" ").filter(t => t.length > 2);
  const allB       = nb.split(" ").filter(t => t.length > 2);
  const shared     = allA.filter(t => allB.includes(t)).length;
  const tokenBonus = Math.min(shared * 6, 20);

  return { score: Math.min(levScore + tokenBonus, 99), method: "levenshtein" };
}

// ─── Matching principal (inchangé) ────────────────────────────────────────────

export function matchAgainstList(
  name:      string,
  entities:  SanctionEntity[],
  threshold: number = 80,
): MatchResult {
  let bestScore   = 0;
  let bestEntity: SanctionEntity | undefined;
  let bestAlias:  string | undefined;
  let bestMethod  = "";

  for (const entity of entities) {
    const { score, method } = computeSimilarityScore(name, entity.name);
    if (score > bestScore) {
      bestScore = score; bestEntity = entity; bestAlias = undefined; bestMethod = method;
    }
    for (const alias of entity.aliases ?? []) {
      const { score: as_, method: am } = computeSimilarityScore(name, alias);
      if (as_ > bestScore) {
        bestScore = as_; bestEntity = entity; bestAlias = alias; bestMethod = `alias:${am}`;
      }
    }
    if (bestScore === 100) break;
  }

  const matched = bestScore >= threshold;
  return {
    matched, score: bestScore,
    ...(matched && bestEntity ? {
      matchedEntity: bestEntity.name,
      matchedAlias:  bestAlias,
      listSource:    bestEntity.listSource,
      entityId:      bestEntity.id,
      matchMethod:   bestMethod,
    } : {}),
  };
}

// ─── Multi-listes (inchangé) ──────────────────────────────────────────────────

export function matchAgainstMultipleLists(
  name: string, entities: SanctionEntity[], threshold = 80,
): { bestMatch: MatchResult; bySource: Record<string, MatchResult>; totalChecked: number } {
  const bySource: Record<string, SanctionEntity[]> = {};
  for (const e of entities) (bySource[e.listSource] ??= []).push(e);

  const resultsBySource: Record<string, MatchResult> = {};
  let bestMatch: MatchResult = { matched: false, score: 0 };

  for (const [source, sourceEntities] of Object.entries(bySource)) {
    const result = matchAgainstList(name, sourceEntities, threshold);
    resultsBySource[source] = result;
    if (result.score > bestMatch.score) bestMatch = result;
  }

  return { bestMatch, bySource: resultsBySource, totalChecked: entities.length };
}
