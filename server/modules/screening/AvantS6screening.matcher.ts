/**
 * Matcher NLP pour les listes de sanctions.
 *
 * Algorithmes combinés :
 * 1. Exact match normalisé              → 100
 * 2. Subset match                       → 90-95
 * 3. Token Set Ratio                    → insensible à l'ordre
 * 4. Token Sort Ratio                   → ordres différents
 * 5. Levenshtein normalisé + bonus tokens
 *
 * Translitération cyrillique/arabe → latin incluse.
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

// ─── Translitération ─────────────────────────────────────────────────────────

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

const ARABIC: Record<string, string> = {
  "م":"M","ح":"H","د":"D","ع":"A","ل":"L","ي":"Y","ن":"N","ا":"A","ب":"B",
  "ت":"T","ث":"TH","ج":"J","خ":"KH","ذ":"TH","ر":"R","ز":"Z","س":"S",
  "ش":"SH","ص":"S","ض":"D","ط":"T","ظ":"Z","غ":"GH","ف":"F","ق":"Q",
  "ك":"K","و":"W","ه":"H","ء":"","ى":"A","ة":"A",
};

function transliterate(s: string): string {
  return s.split("").map(c => CYRILLIC[c] ?? ARABIC[c] ?? c).join("");
}

// ─── Normalisation ────────────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return transliterate(name)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sortedTokens(s: string): string {
  return normalizeName(s).split(" ").sort().join(" ");
}

// ─── Score de similarité ──────────────────────────────────────────────────────

export function computeSimilarityScore(a: string, b: string): {
  score: number;
  method: string;
} {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return { score: 0, method: "empty" };
  if (na === nb)  return { score: 100, method: "exact" };

  // Subset match
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer  = Math.max(na.length, nb.length);
    if (shorter >= 5) return { score: Math.round(90 + (shorter / longer) * 5), method: "subset" };
  }

  // Token Set Ratio
  const tokensA = new Set(na.split(" ").filter(t => t.length > 1));
  const tokensB = new Set(nb.split(" ").filter(t => t.length > 1));
  const intersection = [...tokensA].filter(t => tokensB.has(t));
  if (tokensA.size > 0 && tokensB.size > 0) {
    const ratio = (2 * intersection.length) / (tokensA.size + tokensB.size);
    if (ratio >= 0.8) return { score: Math.round(ratio * 95), method: "token_set" };
  }

  // Token Sort Ratio
  const sa = sortedTokens(a);
  const sb = sortedTokens(b);
  if (sa !== na || sb !== nb) {
    const sortedLen = Math.max(sa.length, sb.length);
    if (sortedLen > 0) {
      const sortScore = Math.round((1 - levenshtein.get(sa, sb) / sortedLen) * 100);
      if (sortScore > 80) return { score: sortScore, method: "token_sort" };
    }
  }

  // Levenshtein + bonus tokens partagés
  const maxLen     = Math.max(na.length, nb.length);
  const levScore   = Math.round((1 - levenshtein.get(na, nb) / maxLen) * 100);
  const allA       = na.split(" ").filter(t => t.length > 2);
  const allB       = nb.split(" ").filter(t => t.length > 2);
  const shared     = allA.filter(t => allB.includes(t)).length;
  const tokenBonus = Math.min(shared * 6, 20);

  return { score: Math.min(levScore + tokenBonus, 99), method: "levenshtein" };
}

// ─── Matching principal ───────────────────────────────────────────────────────

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

// ─── Multi-listes ─────────────────────────────────────────────────────────────

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
