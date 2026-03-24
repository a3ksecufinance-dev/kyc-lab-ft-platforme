/**
 * Chargement et mise à jour automatique des listes de sanctions.
 *
 * Sources publiques gratuites :
 *  - OFAC SDN (US Treasury) : ~17 000 entités — XML
 *  - EU Financial Sanctions  : ~4 500 entités  — XML
 *  - UN Security Council     : ~750 entités    — XML
 *  - UK OFSI                 : ~3 000 entités  — XML/CSV
 *
 * Mise à jour : toutes les nuits à 02:00 UTC (configurable via SCREENING_UPDATE_CRON)
 * Cache Redis : 23h TTL — survit aux redémarrages grâce à la persistance Redis
 */

import { ENV } from "../../_core/env";
import { redis, RedisKeys } from "../../_core/redis";
import { createLogger } from "../../_core/logger";
import type { SanctionEntity } from "./screening.matcher";

const log = createLogger("screening-lists");

const LIST_TTL = 23 * 60 * 60;  // 23h en secondes

// ─── URLs publiques par défaut ────────────────────────────────────────────────
// Vérifiées et à jour en mars 2026

const DEFAULT_URLS = {
  // OFAC SDN — US Treasury (XML direct, stable depuis des années)
  ofac: "https://www.treasury.gov/ofac/downloads/sdn.xml",
  // ONU Conseil de Sécurité — accès direct sans auth
  un:   "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
  // EU Financial Sanctions — format XML Open Data
  eu:   "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content",
  // UK FCDO — nouvelle liste unifiée depuis 28 jan 2026 (remplace OFSI)
  uk:   "https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml",
} as const;

// Miroirs OpenSanctions (fallback si source officielle inaccessible)
// OpenSanctions agrège les listes officielles et les met à jour quotidiennement
const OPENSANCTIONS_FALLBACKS: Partial<Record<keyof typeof DEFAULT_URLS, string>> = {
  ofac: "https://data.opensanctions.org/datasets/latest/us_ofac_sdn/targets.simple.csv",
  eu:   "https://data.opensanctions.org/datasets/latest/eu_fsf/targets.simple.csv",
  uk:   "https://data.opensanctions.org/datasets/latest/gb_fcdo_sanctions/targets.simple.csv",
};

// ─── Données de démo (dev uniquement) ────────────────────────────────────────
// Utilisées si le fetch externe échoue et que le cache est vide

function getMockEntities(source: string): SanctionEntity[] {
  const base = [
    { id: `${source}-001`, name: "Ali Hassan Al-Rashid",    aliases: ["A. Al-Rashid", "Hassan Rashid"],     listSource: source },
    { id: `${source}-002`, name: "Vladimir Petrov",          aliases: ["V. Petrov"],                         listSource: source },
    { id: `${source}-003`, name: "Kim Chol",                 aliases: ["Kim Jong Chol"],                     listSource: source },
    { id: `${source}-004`, name: "Ibrahim Al-Qaeda",         aliases: ["Ibrahim Al Qaida"],                   listSource: source },
    { id: `${source}-005`, name: "Mujahid Khan",             aliases: ["M. Khan", "Mujahed Khan"],            listSource: source },
    { id: `${source}-006`, name: "Yevgeny Prigozhin",        aliases: ["E. Prigozhin"],                      listSource: source },
    { id: `${source}-007`, name: "Dragon Capital LLC",       aliases: ["Dragon Capital"],                     listSource: source },
    { id: `${source}-008`, name: "Pyongyang Trading Corp",   aliases: ["PTC"],                               listSource: source },
    { id: `${source}-009`, name: "Ahmad Shah Massoud",       aliases: ["Ahmed Shah"],                         listSource: source },
    { id: `${source}-010`, name: "Black Sea Resources Ltd",  aliases: ["BSR Limited", "BlackSea Resources"], listSource: source },
  ];
  return base;
}



// ─── Parser OpenSanctions CSV (fallback universel) ────────────────────────────
// Format : id,caption,schema,properties,...
// La colonne "caption" contient le nom principal

function parseOpenSanctionsCsv(csv: string, source: string): SanctionEntity[] {
  const lines   = csv.split("\n");
  const header  = lines[0]?.split(",").map(h => h.trim().replace(/"/g, "")) ?? [];
  const idIdx   = header.indexOf("id");
  const nameIdx = header.indexOf("caption");

  const entities: SanctionEntity[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    const id   = cols[idIdx]?.trim();
    const name = cols[nameIdx]?.trim();
    if (!name || name.length < 2) continue;
    entities.push({ id: `${source}-${id ?? i}`, name, aliases: [], listSource: source });
  }
  return entities;
}

// ─── Cache Redis ──────────────────────────────────────────────────────────────

async function getCached(provider: string): Promise<SanctionEntity[] | null> {
  try {
    const data = await redis.get(RedisKeys.screeningList(provider));
    return data ? (JSON.parse(data) as SanctionEntity[]) : null;
  } catch { return null; }
}

async function setCache(provider: string, entities: SanctionEntity[]): Promise<void> {
  try {
    await redis.setex(RedisKeys.screeningList(provider), LIST_TTL, JSON.stringify(entities));
    await redis.set(RedisKeys.screeningLastUpdate(provider), new Date().toISOString());
    await redis.set(RedisKeys.screeningListCount(provider), String(entities.length));
  } catch (err) {
    log.warn({ err, provider }, "Erreur mise en cache liste sanctions");
  }
}

// ─── Fetch avec retry ─────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, maxRetries = 2): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),   // 15s max par tentative
        headers: { "User-Agent": "KYC-AML-Compliance/2.0 (sanctions-screening)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

// ─── Parser OFAC SDN (XML) ───────────────────────────────────────────────────

export async function fetchOfacList(): Promise<SanctionEntity[]> {
  const url = ENV.OFAC_SDN_URL ?? DEFAULT_URLS.ofac;
  try {
    let xml: string;
    try {
      xml = await fetchWithRetry(url);
    } catch {
      // Fallback OpenSanctions CSV si treasury.gov inaccessible
      const fallback = OPENSANCTIONS_FALLBACKS.ofac;
      if (fallback) {
        log.warn({ url }, "OFAC XML inaccessible — tentative fallback OpenSanctions CSV");
        const csv = await fetchWithRetry(fallback);
        return parseOpenSanctionsCsv(csv, "OFAC");
      }
      throw new Error("Toutes les sources OFAC ont échoué");
    }
    const entities: SanctionEntity[] = [];

    const entryRx = /<sdnEntry>([\s\S]*?)<\/sdnEntry>/g;
    let m: RegExpExecArray | null;

    while ((m = entryRx.exec(xml)) !== null) {
      const entry     = m[1] ?? "";
      const uid       = entry.match(/<uid>(\d+)<\/uid>/)?.[1] ?? "";
      const sdnType   = entry.match(/<sdnType>(.*?)<\/sdnType>/)?.[1]?.trim() ?? "";
      const lastName  = entry.match(/<lastName>(.*?)<\/lastName>/)?.[1]?.trim() ?? "";
      const firstName = entry.match(/<firstName>(.*?)<\/firstName>/)?.[1]?.trim() ?? "";
      const name      = firstName ? `${firstName} ${lastName}` : lastName;
      if (!name) continue;

      // Pays (nationality / citizenship)
      const country = entry.match(/<nationality>\s*<country>(.*?)<\/country>/)?.[1]?.trim();

      // Aliases
      const aliases: string[] = [];
      const aliasRx = /<aka>([\s\S]*?)<\/aka>/g;
      let am: RegExpExecArray | null;
      while ((am = aliasRx.exec(entry)) !== null) {
        const aLast  = am[1]?.match(/<lastName>(.*?)<\/lastName>/)?.[1]?.trim() ?? "";
        const aFirst = am[1]?.match(/<firstName>(.*?)<\/firstName>/)?.[1]?.trim() ?? "";
        if (aLast) aliases.push(aFirst ? `${aFirst} ${aLast}` : aLast);
      }

      // Programmes (SDN, SYRIA, IRAN, etc.)
      const programs: string[] = [];
      const progRx = /<program>(.*?)<\/program>/g;
      let pm: RegExpExecArray | null;
      while ((pm = progRx.exec(entry)) !== null) {
        const p = pm[1]?.trim();
        if (p) programs.push(p);
      }

      entities.push({
        id:         `OFAC-${uid}`,
        name,
        aliases,
        listSource: "OFAC",
        entityType: sdnType === "Individual" ? "individual" : "entity" as "individual" | "entity",
        ...(country          ? { country }    : {}),
        ...(programs.length  ? { programs }   : {}),
      });
    }

    log.info({ count: entities.length, url }, "Liste OFAC SDN chargée");
    return entities;
  } catch (err) {
    log.error({ err, url }, "Échec chargement OFAC SDN");
    return [];
  }
}

// ─── Parser EU Financial Sanctions (XML) ─────────────────────────────────────

export async function fetchEuList(): Promise<SanctionEntity[]> {
  const url = ENV.EU_SANCTIONS_URL ?? DEFAULT_URLS.eu;
  try {
    const xml      = await fetchWithRetry(url);
    const entities: SanctionEntity[] = [];

    const subjectRx = /<subject[^>]*>([\s\S]*?)<\/subject>/g;
    let m: RegExpExecArray | null;

    while ((m = subjectRx.exec(xml)) !== null) {
      const entry     = m[1] ?? "";
      const logicalId = m[0].match(/logicalId="(\d+)"/)?.[1] ?? "";
      const subType   = m[0].match(/subjectType\s*[^>]*code="([^"]+)"/)?.[1] ?? "";

      // Nom : wholeName ou firstName+lastName
      const wholeName = entry.match(/<wholeName>(.*?)<\/wholeName>/)?.[1]?.trim() ?? "";
      const firstName = entry.match(/<firstName>(.*?)<\/firstName>/)?.[1]?.trim() ?? "";
      const lastName  = entry.match(/<lastName>(.*?)<\/lastName>/)?.[1]?.trim() ?? "";
      const name      = wholeName || (firstName ? `${firstName} ${lastName}` : lastName);
      if (!name) continue;

      // Nationalité
      const nationality = entry.match(/<countryIso2Code>(.*?)<\/countryIso2Code>/)?.[1]?.trim();

      // Aliases (nameAlias)
      const aliases: string[] = [];
      const aliasRx = /<nameAlias[^>]*>([\s\S]*?)<\/nameAlias>/g;
      let am: RegExpExecArray | null;
      while ((am = aliasRx.exec(entry)) !== null) {
        const aWhole = am[1]?.match(/<wholeName>(.*?)<\/wholeName>/)?.[1]?.trim() ?? "";
        if (aWhole && aWhole !== name) aliases.push(aWhole);
      }

      entities.push({
        id:         `EU-${logicalId}`,
        name,
        aliases,
        listSource: "EU",
        entityType: subType.toLowerCase().includes("person") ? "individual" : "entity" as "individual" | "entity",
        ...(nationality ? { nationality } : {}),
      });
    }

    log.info({ count: entities.length, url }, "Liste EU chargée");
    return entities;
  } catch (err) {
    log.error({ err, url }, "Échec chargement liste EU");
    return [];
  }
}

// ─── Parser UN Security Council (XML) ────────────────────────────────────────

export async function fetchUnList(): Promise<SanctionEntity[]> {
  const url = ENV.UN_SANCTIONS_URL ?? DEFAULT_URLS.un;
  try {
    const xml      = await fetchWithRetry(url);
    const entities: SanctionEntity[] = [];

    const indivRx = /<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/g;
    let m: RegExpExecArray | null;

    while ((m = indivRx.exec(xml)) !== null) {
      const entry      = m[1] ?? "";
      const dataid     = entry.match(/<DATAID>(\d+)<\/DATAID>/)?.[1] ?? "";
      const firstName  = entry.match(/<FIRST_NAME>(.*?)<\/FIRST_NAME>/)?.[1]?.trim() ?? "";
      const secondName = entry.match(/<SECOND_NAME>(.*?)<\/SECOND_NAME>/)?.[1]?.trim() ?? "";
      const thirdName  = entry.match(/<THIRD_NAME>(.*?)<\/THIRD_NAME>/)?.[1]?.trim() ?? "";
      const name       = [firstName, secondName, thirdName].filter(Boolean).join(" ");
      if (!name) continue;

      const nationality = entry.match(/<NATIONALITY>(.*?)<\/NATIONALITY>/)?.[1]?.trim();

      // Aliases
      const aliases: string[] = [];
      const aliasRx = /<ALIAS>([\s\S]*?)<\/ALIAS>/g;
      let am: RegExpExecArray | null;
      while ((am = aliasRx.exec(entry)) !== null) {
        const aFirst  = am[1]?.match(/<ALIAS_NAME>(.*?)<\/ALIAS_NAME>/)?.[1]?.trim() ?? "";
        if (aFirst) aliases.push(aFirst);
      }

      entities.push({
        id:         `UN-${dataid}`,
        name,
        aliases,
        listSource: "UN",
        entityType: "individual" as "individual",
        programs:   ["UN-SC"],
        ...(nationality ? { nationality } : {}),
      });
    }

    // Entités (organisations)
    const entityRx = /<ENTITY>([\s\S]*?)<\/ENTITY>/g;
    while ((m = entityRx.exec(xml)) !== null) {
      const entry  = m[1] ?? "";
      const dataid = entry.match(/<DATAID>(\d+)<\/DATAID>/)?.[1] ?? "";
      const name   = entry.match(/<FIRST_NAME>(.*?)<\/FIRST_NAME>/)?.[1]?.trim() ?? "";
      if (!name) continue;

      const aliases: string[] = [];
      const aliasRx = /<ALIAS>([\s\S]*?)<\/ALIAS>/g;
      let am: RegExpExecArray | null;
      while ((am = aliasRx.exec(entry)) !== null) {
        const a = am[1]?.match(/<ALIAS_NAME>(.*?)<\/ALIAS_NAME>/)?.[1]?.trim() ?? "";
        if (a) aliases.push(a);
      }

      entities.push({
        id: `UN-E-${dataid}`, name, aliases,
        listSource: "UN", entityType: "entity", programs: ["UN-SC"],
      });
    }

    log.info({ count: entities.length, url }, "Liste ONU chargée");
    return entities;
  } catch (err) {
    log.error({ err, url }, "Échec chargement liste ONU");
    return [];
  }
}

// ─── Parser UK FCDO (XML — nouvelle liste unifiée depuis jan 2026) ────────────

export async function fetchUkList(): Promise<SanctionEntity[]> {
  const url = ENV.UK_SANCTIONS_URL ?? DEFAULT_URLS.uk;
  try {
    let raw: string;
    try {
      raw = await fetchWithRetry(url);
    } catch {
      const fallback = OPENSANCTIONS_FALLBACKS.uk;
      if (fallback) {
        log.warn({ url }, "UK FCDO XML inaccessible — tentative fallback OpenSanctions CSV");
        const csv = await fetchWithRetry(fallback);
        return parseOpenSanctionsCsv(csv, "UK");
      }
      throw new Error("Toutes les sources UK ont échoué");
    }

    // Parser XML FCDO (même format que ONU pour les individus)
    const entities: SanctionEntity[] = [];

    const indivRx = /<Individual>([\s\S]*?)<\/Individual>/gi;
    let m: RegExpExecArray | null;
    while ((m = indivRx.exec(raw)) !== null) {
      const entry = m[1] ?? "";
      const uid   = entry.match(/<UniqueId>(.*?)<\/UniqueId>/i)?.[1]?.trim() ?? "";

      // Construire le nom depuis les champs prénom/nom
      const firstName = entry.match(/<FirstName>(.*?)<\/FirstName>/i)?.[1]?.trim() ?? "";
      const lastName  = entry.match(/<LastName>(.*?)<\/LastName>/i)?.[1]?.trim()
                     ?? entry.match(/<Name>(.*?)<\/Name>/i)?.[1]?.trim() ?? "";
      const name = [firstName, lastName].filter(Boolean).join(" ");
      if (!name || name.length < 2) continue;

      // Aliases
      const aliases: string[] = [];
      const aliasRx = /<Alias[^>]*>([\s\S]*?)<\/Alias>/gi;
      let am: RegExpExecArray | null;
      while ((am = aliasRx.exec(entry)) !== null) {
        const a = am[1]?.match(/<Name>(.*?)<\/Name>/i)?.[1]?.trim()
               ?? am[1]?.trim();
        if (a && a !== name) aliases.push(a);
      }

      entities.push({
        id:         `UK-${uid || entities.length}`,
        name,
        aliases,
        listSource: "UK",
        entityType: "individual",
      });
    }

    // Entités (organisations)
    const entityRx = /<Entity>([\s\S]*?)<\/Entity>/gi;
    while ((m = entityRx.exec(raw)) !== null) {
      const entry = m[1] ?? "";
      const uid   = entry.match(/<UniqueId>(.*?)<\/UniqueId>/i)?.[1]?.trim() ?? "";
      const name  = entry.match(/<Name>(.*?)<\/Name>/i)?.[1]?.trim() ?? "";
      if (!name || name.length < 2) continue;

      entities.push({
        id:         `UK-E-${uid || entities.length}`,
        name,
        aliases:    [],
        listSource: "UK",
        entityType: "entity",
      });
    }

    log.info({ count: entities.length, url }, "Liste UK FCDO chargée (XML)");
    return entities;
  } catch (err) {
    log.error({ err, url }, "Échec chargement liste UK FCDO");
    return [];
  }
}

// ─── Chargement de toutes les listes ─────────────────────────────────────────

export interface ListStatus {
  provider:    string;
  count:       number;
  lastUpdate:  string | null;
  fromCache:   boolean;
  error?:      string;
}

export async function loadAllSanctionLists(forceRefresh = false): Promise<{
  entities:   SanctionEntity[];
  statuses:   ListStatus[];
  totalCount: number;
}> {
  const providers: Array<{
    key:     string;
    fetcher: () => Promise<SanctionEntity[]>;
  }> = [
    { key: "ofac", fetcher: fetchOfacList },
    { key: "eu",   fetcher: fetchEuList   },
    { key: "un",   fetcher: fetchUnList   },
    { key: "uk",   fetcher: fetchUkList   },
  ];

  const allEntities: SanctionEntity[] = [];
  const statuses:    ListStatus[]     = [];

  for (const { key, fetcher } of providers) {
    // Vérifier le cache sauf si forceRefresh
    if (!forceRefresh) {
      const cached = await getCached(key);
      if (cached && cached.length > 0) {
        allEntities.push(...cached);
        const lastUpdate = await redis.get(RedisKeys.screeningLastUpdate(key)).catch(() => null);
        statuses.push({ provider: key.toUpperCase(), count: cached.length, lastUpdate, fromCache: true });
        continue;
      }
    }

    // Fetch depuis la source
    const t0      = Date.now();
    const fresh   = await fetcher();
    const elapsed = Date.now() - t0;

    if (fresh.length > 0) {
      await setCache(key, fresh);
      allEntities.push(...fresh);
      statuses.push({
        provider:   key.toUpperCase(),
        count:      fresh.length,
        lastUpdate: new Date().toISOString(),
        fromCache:  false,
      });
      log.info({ provider: key, count: fresh.length, ms: elapsed }, "Liste rechargée");
    } else {
      // Fetch échoué — utiliser l'ancien cache si disponible
      const stale = await getCached(key);
      if (stale && stale.length > 0) {
        allEntities.push(...stale);
        statuses.push({
          provider:   key.toUpperCase(),
          count:      stale.length,
          lastUpdate: await redis.get(RedisKeys.screeningLastUpdate(key)).catch(() => null),
          fromCache:  true,
          error:      "Refresh échoué — données stales utilisées",
        });
      } else {
        // Aucun cache ET fetch échoué → données mock en dev
        const isDev = process.env["NODE_ENV"] !== "production";
        if (isDev) {
          const mock = getMockEntities(key.toUpperCase());
          await setCache(key, mock);
          allEntities.push(...mock);
          statuses.push({
            provider:   key.toUpperCase(),
            count:      mock.length,
            lastUpdate: new Date().toISOString(),
            fromCache:  false,
            error:      "Source indisponible — données de démonstration chargées",
          });
          log.warn({ provider: key }, "Source inaccessible — données mock chargées (dev)");
        } else {
          statuses.push({
            provider:   key.toUpperCase(),
            count:      0,
            lastUpdate: null,
            fromCache:  false,
            error:      "Fetch échoué, pas de cache",
          });
        }
      }
    }
  }

  // Dédupliquer par id
  const seen = new Set<string>();
  const deduped = allEntities.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // Écrire le statut global
  await redis.set(
    RedisKeys.screeningListStatus(),
    JSON.stringify({ updatedAt: new Date().toISOString(), total: deduped.length })
  ).catch(() => undefined);

  return { entities: deduped, statuses, totalCount: deduped.length };
}
