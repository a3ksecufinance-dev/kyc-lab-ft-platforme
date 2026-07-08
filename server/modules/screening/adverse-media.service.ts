/**
 * Adverse media — recherche de mentions négatives dans la presse.
 *
 * Requis par BAM circulaire 5/W/2023 art. 15 pour les clients PEP ou
 * HIGH_RISK (due diligence renforcée).
 *
 * Provider externe configurable via env :
 *   - ADVERSE_MEDIA_PROVIDER = "newsapi" | "gdelt" | "disabled"
 *   - ADVERSE_MEDIA_API_KEY  = clé API si applicable
 *
 * Si aucun provider configuré, le service log un flag "manual due diligence
 * required" et retourne un status "MANUAL_REVIEW" — le compliance officer
 * doit alors faire la recherche manuellement.
 */

import { ENV }          from "../../_core/env";
import { createLogger } from "../../_core/logger";
import { withCache }    from "../../_core/redis";

const log = createLogger("adverse-media");

// Mots-clés de risque (français + anglais) pour scoring simple des titres.
// Chaque entrée est matchée sur frontière de mot (\b) pour éviter les
// double-comptes entre paires FR/EN (ex : "fraud" ⊂ "fraude").
const NEGATIVE_KEYWORDS = [
  // Financier
  "fraude", "fraud", "blanchiment", "money laundering", "corruption", "bribery",
  "détournement", "embezzlement", "escroquerie", "scam",
  // Judiciaire
  "arrêté", "arrested", "condamné", "convicted", "inculpé", "indicted",
  "sanctionné", "sanctioned", "poursuivi", "prosecuted",
  // Politique
  "scandale", "scandal", "affaire", "corrupt",
  // Terrorisme / crime organisé
  "terrorisme", "terrorism", "mafia", "trafic", "trafficking",
];

// Regex précompilée : frontière de mot Unicode-aware (les \b JS ne gèrent pas
// les accents, donc "arrêté" ne serait jamais matché avec \b). On utilise des
// lookarounds sur \p{L} (toute lettre Unicode) — flag u obligatoire.
const NEGATIVE_KEYWORDS_RE = NEGATIVE_KEYWORDS.map(kw =>
  new RegExp(`(?<!\\p{L})${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\p{L})`, "iu")
);

export interface AdverseMediaHit {
  title:       string;
  url:         string;
  source:      string;
  publishedAt: string | null;
  snippet:     string;
  score:       number;    // 0-100 (mots-clés matchés)
}

export interface AdverseMediaReport {
  status:       "CLEAR" | "HITS" | "MANUAL_REVIEW";
  provider:     string;
  fullName:     string;
  totalHits:    number;
  topHits:      AdverseMediaHit[];  // 5 plus élevés
  searchedAt:   string;
  message?:     string;
}

// ─── Scoring d'un article ────────────────────────────────────────────────────

export function scoreHit(title: string, snippet: string): number {
  const text = `${title} ${snippet}`;
  let matches = 0;
  for (const re of NEGATIVE_KEYWORDS_RE) if (re.test(text)) matches++;
  return Math.min(100, matches * 20);
}

// ─── Providers ───────────────────────────────────────────────────────────────

interface RawArticle {
  title:       string;
  url:         string;
  source:      string;
  publishedAt: string | null;
  snippet:     string;
}

async function searchNewsApi(query: string): Promise<RawArticle[]> {
  const key = ENV.ADVERSE_MEDIA_API_KEY;
  if (!key) return [];
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", query);
  url.searchParams.set("sortBy", "relevancy");
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("language", "fr");
  const res = await fetch(url.toString(), {
    headers: { "X-Api-Key": key },
    // 8 s de timeout — on ne veut pas bloquer le screening
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`NewsAPI ${res.status}`);
  const body = await res.json() as { articles?: Array<{
    title: string; url: string; description: string | null;
    publishedAt: string | null; source: { name: string };
  }> };
  return (body.articles ?? []).map(a => ({
    title:       a.title,
    url:         a.url,
    source:      a.source.name,
    publishedAt: a.publishedAt,
    snippet:     a.description ?? "",
  }));
}

// GDELT est gratuit (pas de clé API) — fallback intéressant
async function searchGdelt(query: string): Promise<RawArticle[]> {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", `"${query}"`);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("maxrecords", "20");
  url.searchParams.set("format", "json");
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`GDELT ${res.status}`);
  const body = await res.json() as { articles?: Array<{
    title: string; url: string; domain: string; seendate: string;
  }> };
  return (body.articles ?? []).map(a => ({
    title:       a.title,
    url:         a.url,
    source:      a.domain,
    publishedAt: a.seendate,
    snippet:     "",
  }));
}

// ─── Recherche principale ────────────────────────────────────────────────────

export async function searchAdverseMedia(fullName: string): Promise<AdverseMediaReport> {
  const provider = ENV.ADVERSE_MEDIA_PROVIDER;
  const searchedAt = new Date().toISOString();
  const trimmed = fullName.trim();

  if (!trimmed || trimmed.length < 3) {
    return { status: "CLEAR", provider: "none", fullName: trimmed, totalHits: 0, topHits: [], searchedAt };
  }

  if (provider === "disabled") {
    log.warn({ fullName: trimmed }, "Adverse media désactivé — due diligence manuelle requise");
    return {
      status: "MANUAL_REVIEW",
      provider: "disabled",
      fullName: trimmed,
      totalHits: 0,
      topHits: [],
      searchedAt,
      message: "Provider adverse media désactivé — recherche manuelle requise (BAM art. 15)",
    };
  }

  // Cache 6h — réduit la charge sur les APIs externes
  const cacheKey = `adverse:${provider}:${trimmed.toLowerCase()}`;
  try {
    return await withCache(cacheKey, 6 * 3600, async () => {
      const articles = provider === "newsapi"
        ? await searchNewsApi(trimmed)
        : await searchGdelt(trimmed);

      const scored: AdverseMediaHit[] = articles
        .map(a => ({ ...a, score: scoreHit(a.title, a.snippet) }))
        .filter(h => h.score > 0)
        .sort((a, b) => b.score - a.score);

      return {
        status:     scored.length > 0 ? "HITS" as const : "CLEAR" as const,
        provider,
        fullName:   trimmed,
        totalHits:  scored.length,
        topHits:    scored.slice(0, 5),
        searchedAt,
      };
    });
  } catch (err) {
    log.error({ err, fullName: trimmed, provider }, "Adverse media : erreur provider");
    return {
      status: "MANUAL_REVIEW",
      provider,
      fullName: trimmed,
      totalHits: 0,
      topHits: [],
      searchedAt,
      message: "Erreur provider adverse media — recherche manuelle requise",
    };
  }
}
