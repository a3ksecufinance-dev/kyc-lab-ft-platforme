/**
 * Chargement et mise à jour automatique des listes de sanctions et PPE.
 *
 * Sources publiques gratuites :
 *  - OFAC SDN (US Treasury)   : ~17 000 entités — XML
 *  - EU Financial Sanctions   : ~4 500 entités  — XML
 *  - UN Security Council      : ~750 entités    — XML
 *  - UK FCDO (ex-OFSI)        : ~3 000 entités  — XML
 *  - PEP OpenSanctions        : ~1 700 000 PPE  — CSV (source principale PPE)
 *  - BAM / ANRF               : liste nationale marocaine — URL configurable
 *
 * Mise à jour : toutes les nuits à 02:00 UTC (configurable via SCREENING_UPDATE_CRON)
 * Cache Redis : 23h TTL — survit aux redémarrages grâce à la persistance Redis
 * Surveillance : alerte si une liste est stale > SCREENING_STALE_THRESHOLD_HOURS
 */

import { ENV }            from "../../_core/env";
import { redis, RedisKeys } from "../../_core/redis";
import { createLogger }    from "../../_core/logger";
import { db }              from "../../_core/db";
import { alerts }          from "../../../drizzle/schema";
import { nanoid }          from "nanoid";
import { saveVersionedList, getVersionedList } from "./screening.version";
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
  // UK FCDO — nouvelle liste unifiée depuis jan 2026 (remplace OFSI)
  // Fallback OpenSanctions si URL officielle change
  uk:   "https://assets.publishing.service.gov.uk/media/uk-sanctions-list.xml",
  // PEP — OpenSanctions dataset gratuit (usage non-commercial)
  // ~1 700 000 entrées issues de 50+ sources PEP mondiales
  pep:  "https://data.opensanctions.org/datasets/latest/peps/targets.simple.csv",
  // BAM / ANRF — liste nationale marocaine (URL fournie par BAM si accès accordé)
  // En l'absence d'URL officielle BAM publique, OpenSanctions couvre le Maroc
  bam:  "",  // configurable via BAM_SANCTIONS_URL
} as const;

// Miroirs OpenSanctions (fallback si source officielle inaccessible)
// OpenSanctions agrège toutes les listes officielles et les met à jour quotidiennement
const OPENSANCTIONS_FALLBACKS: Partial<Record<string, string>> = {
  ofac: "https://data.opensanctions.org/datasets/latest/us_ofac_sdn/targets.simple.csv",
  eu:   "https://data.opensanctions.org/datasets/latest/eu_fsf/targets.simple.csv",
  uk:   "https://data.opensanctions.org/datasets/latest/gb_fcdo_sanctions/targets.simple.csv",
  un:   "https://data.opensanctions.org/datasets/latest/un_sc_sanctions/targets.simple.csv",
  // MENA : Maroc + Golfe via OpenSanctions
  bam:  "https://data.opensanctions.org/datasets/latest/ma_anrf/targets.simple.csv",
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

// Données mock PEP (dev uniquement) — personnalités politiques notoires
// Utilisées quand l'URL OpenSanctions est inaccessible (timeout réseau en dev)
function getMockPepEntities(): SanctionEntity[] {
  return [
    { id: "PEP-MOCK-001", name: "Vladimir Putin",          aliases: ["Vladimir Vladimirovich Putin", "Poutine"],             listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-002", name: "Xi Jinping",              aliases: ["Xi Jin Ping", "Jinping Xi"],                           listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-003", name: "Kim Jong Un",             aliases: ["Kim Jong-un", "Kim Jongun"],                           listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-004", name: "Bashar Al Assad",         aliases: ["Bashar Assad", "Bachar Al-Assad"],                     listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-005", name: "Alexander Lukashenko",    aliases: ["Lukashenko", "A. Lukashenko"],                         listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-006", name: "Nicolas Maduro",          aliases: ["Maduro Moros", "Nicolas Maduro Moros"],                listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-007", name: "Robert Mugabe",           aliases: ["R. Mugabe"],                                           listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-008", name: "Muammar Gaddafi",         aliases: ["Muammar Qadhafi", "Kadhafi"],                          listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-009", name: "Omar Al Bashir",          aliases: ["Omar Bashir", "Al-Bashir"],                            listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-010", name: "Slobodan Milosevic",      aliases: ["S. Milosevic"],                                        listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-011", name: "Pervez Musharraf",        aliases: ["P. Musharraf", "Musharaf"],                            listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-012", name: "Idi Amin Dada",           aliases: ["Idi Amin", "I.A. Dada"],                               listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-013", name: "Teodoro Obiang Nguema",   aliases: ["Obiang", "T. Obiang"],                                 listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-014", name: "Nursultan Nazarbayev",    aliases: ["Nazarbayev", "N. Nazarbaev"],                          listSource: "PEP", entityType: "individual", programs: ["PEP"] },
    { id: "PEP-MOCK-015", name: "Gurbanguly Berdimuhamedow", aliases: ["Berdimuhamedov", "Berdymukhammedov"],                listSource: "PEP", entityType: "individual", programs: ["PEP"] },
  ];
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

// ─── Cache Redis (atomic swap) ────────────────────────────────────────────────
// L'atomic swap évite qu'une requête screening lise une liste partiellement écrite.
// Flux : écriture dans une clé temporaire ":next", puis RENAME atomique.

async function getCached(provider: string): Promise<SanctionEntity[] | null> {
  try {
    // Essayer d'abord le cache versionné (plus fiable)
    const versioned = await getVersionedList(provider);
    if (versioned && versioned.length > 0) return versioned;
    // Fallback sur le cache legacy
    const data = await redis.get(RedisKeys.screeningList(provider));
    return data ? (JSON.parse(data) as SanctionEntity[]) : null;
  } catch { return null; }
}

async function setCache(provider: string, entities: SanctionEntity[]): Promise<void> {
  try {
    const payload = JSON.stringify(entities);
    const nextKey = `${RedisKeys.screeningList(provider)}:next`;

    // 1. Écrire dans la clé temporaire
    await redis.setex(nextKey, LIST_TTL + 3600, payload);

    // 2. Pipeline atomique : rename + mise à jour des métadonnées
    const pipeline = redis.pipeline();
    pipeline.rename(nextKey, RedisKeys.screeningList(provider));
    pipeline.set(RedisKeys.screeningLastUpdate(provider), new Date().toISOString());
    pipeline.set(RedisKeys.screeningListCount(provider), String(entities.length));
    await pipeline.exec();

    // 3. Sauvegarder une version archivée (pour rollback)
    await saveVersionedList(provider, entities);
  } catch (err) {
    log.warn({ err, provider }, "Erreur mise en cache liste sanctions");
  }
}

// ─── Alerte compliance quand une liste est stale ──────────────────────────────

async function createStaleAlert(provider: string, ageHours: number): Promise<void> {
  if (process.env["NODE_ENV"] !== "production") return;  // alertes DB seulement en prod
  try {
    // Éviter les doublons : vérifier si une alerte OPEN existe déjà pour ce provider
    const existingKey = `screening:stale:alert:${provider}`;
    const alreadyAlerting = await redis.get(existingKey).catch(() => null);
    if (alreadyAlerting) return;

    await db.insert(alerts).values({
      alertId:   `ALT-${nanoid(8).toUpperCase()}`,
      alertType: "SYSTEM",
      priority:  ageHours > 72 ? "HIGH" : "MEDIUM",
      status:    "OPEN",
      reason:    `Liste sanctions ${provider.toUpperCase()} non mise à jour depuis ${ageHours}h (seuil: ${ENV.SCREENING_STALE_THRESHOLD_HOURS}h). Risque de faux CLEAR sur screening.`,
      riskScore: ageHours > 72 ? 80 : 50,
      createdAt: new Date(),
    } as never);

    // Bloquer les doublons pendant 6h
    await redis.setex(existingKey, 6 * 3600, "1");
    log.warn({ provider, ageHours }, "Alerte compliance créée — liste sanctions stale");
  } catch (err) {
    log.error({ err, provider }, "Impossible de créer l'alerte stale en DB");
  }
}

// ─── Fetch avec retry ─────────────────────────────────────────────────────────
// Timeout plus long pour les gros fichiers :
//   OFAC SDN XML  : ~50 MB  → 90s
//   EU XML        : ~15 MB  → 60s
//   OpenSanctions PEP CSV : ~200 MB → 180s

async function fetchWithRetry(url: string, maxRetries = 2, timeoutMs = 90_000): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent":     "KYC-AML-Compliance/2.0 (sanctions-screening)",
          "Accept":         "application/xml, text/xml, text/csv, */*",
          "Accept-Encoding":"gzip, deflate",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries - 1) {
        const backoff = 2000 * (i + 1);
        log.warn({ url, attempt: i + 1, backoffMs: backoff }, "Fetch échoué — retry");
        await new Promise(r => setTimeout(r, backoff));
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
        entityType: "individual" as const,
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

// ─── Parser PEP — OpenSanctions CSV ──────────────────────────────────────────
// Format OpenSanctions "targets.simple.csv" :
//   id, caption, schema, properties, datasets, first_seen, last_seen
// "schema" = Person pour les PPE individuels, LegalEntity pour structures
// La colonne "properties" est un JSON compressé avec aliases, country, etc.

export async function fetchPepList(): Promise<SanctionEntity[]> {
  const url = ENV.PEP_LIST_URL ?? DEFAULT_URLS.pep;
  if (!url) return [];

  try {
    // CSV PEP peut dépasser 200 MB — timeout étendu à 3 min
    const csv = await fetchWithRetry(url, 2, 180_000);
    const lines  = csv.split("\n");
    const header = lines[0]?.split(",").map(h => h.trim().replace(/"/g, "")) ?? [];
    const idIdx     = header.indexOf("id");
    const nameIdx   = header.indexOf("caption");
    const schemaIdx = header.indexOf("schema");

    const entities: SanctionEntity[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      // Parsing CSV simple (sans quotes imbriquées)
      const cols   = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
      const id     = cols[idIdx]?.trim();
      const name   = cols[nameIdx]?.trim();
      const schema = cols[schemaIdx]?.trim() ?? "";

      if (!name || name.length < 2) continue;

      // Schema Person → individual, LegalEntity → entity
      const entityType: SanctionEntity["entityType"] =
        schema === "Person" ? "individual" :
        schema === "LegalEntity" ? "entity" : "individual";

      entities.push({
        id:         `PEP-${id ?? i}`,
        name,
        aliases:    [],
        listSource: "PEP",
        entityType,
        programs:   ["PEP"],
      });
    }

    log.info({ count: entities.length, url }, "Liste PEP (OpenSanctions) chargée");
    return entities;
  } catch (err) {
    log.error({ err, url }, "Échec chargement liste PEP");
    // En développement : utiliser les données mock PEP pour permettre les tests
    if (process.env["NODE_ENV"] !== "production") {
      const mock = getMockPepEntities();
      log.warn({ count: mock.length }, "Liste PEP inaccessible — données mock PEP chargées (dev)");
      return mock;
    }
    return [];
  }
}

// ─── Parser BAM / ANRF (Maroc) ───────────────────────────────────────────────
// L'ANRF (Autorité Nationale du Renseignement Financier) publie une liste
// nationale des personnes et entités sous sanctions marocaines.
//
// Format : configurable (XML ou CSV selon la source)
// URL    : fournie par BAM ou ANRF sur demande d'agrément
// Fallback : OpenSanctions dataset ma_anrf (si disponible)

export async function fetchBamList(): Promise<SanctionEntity[]> {
  const url = ENV.BAM_SANCTIONS_URL ?? OPENSANCTIONS_FALLBACKS["bam"] ?? "";
  if (!url) {
    log.info("BAM_SANCTIONS_URL non configurée — liste BAM/ANRF ignorée");
    return [];
  }

  try {
    let raw: string;
    try {
      raw = await fetchWithRetry(url, 2, 60_000);
    } catch {
      log.warn({ url }, "BAM/ANRF source inaccessible — ignoré");
      return [];
    }

    // Détection automatique du format
    const trimmed = raw.trimStart();
    if (trimmed.startsWith("<") || trimmed.startsWith("<?xml")) {
      // XML — réutiliser le parser OpenSanctions-like ou UN-like
      const entities: SanctionEntity[] = [];
      const itemRx = /<(?:Individual|Entity|Person)[^>]*>([\s\S]*?)<\/(?:Individual|Entity|Person)>/gi;
      let m: RegExpExecArray | null;
      while ((m = itemRx.exec(raw)) !== null) {
        const entry = m[1] ?? "";
        const uid   = entry.match(/<(?:Id|UniqueId|ID)>(.*?)<\/(?:Id|UniqueId|ID)>/i)?.[1]?.trim() ?? String(entities.length);
        const firstName = entry.match(/<(?:FirstName|Prenom|FIRST_NAME)>(.*?)<\/(?:FirstName|Prenom|FIRST_NAME)>/i)?.[1]?.trim() ?? "";
        const lastName  = entry.match(/<(?:LastName|Nom|LAST_NAME|Name)>(.*?)<\/(?:LastName|Nom|LAST_NAME|Name)>/i)?.[1]?.trim() ?? "";
        const name      = [firstName, lastName].filter(Boolean).join(" ");
        if (!name || name.length < 2) continue;
        entities.push({ id: `BAM-${uid}`, name, aliases: [], listSource: "BAM", entityType: "individual" });
      }
      log.info({ count: entities.length, url }, "Liste BAM/ANRF (XML) chargée");
      return entities;
    } else {
      // CSV — parser OpenSanctions standard
      const entities = parseOpenSanctionsCsv(raw, "BAM");
      log.info({ count: entities.length, url }, "Liste BAM/ANRF (CSV) chargée");
      return entities;
    }
  } catch (err) {
    log.error({ err, url }, "Échec chargement liste BAM/ANRF");
    return [];
  }
}

// ─── Surveillance de fraîcheur des listes ─────────────────────────────────────

export interface ListHealthReport {
  provider:       string;
  count:          number;
  lastUpdate:     string | null;
  ageHours:       number | null;
  isStale:        boolean;
  staleSince?:    string;
}

export async function checkListsHealth(): Promise<{
  reports:    ListHealthReport[];
  anyStale:   boolean;
  staleCount: number;
  totalEntities: number;
}> {
  const staleThresholdHours = ENV.SCREENING_STALE_THRESHOLD_HOURS;
  const providers = ["ofac", "eu", "un", "uk", "pep", "bam", "custom"];
  const reports: ListHealthReport[] = [];
  let totalEntities = 0;

  for (const key of providers) {
    const lastUpdateStr = await redis.get(RedisKeys.screeningLastUpdate(key)).catch(() => null);
    const countStr      = await redis.get(RedisKeys.screeningListCount(key)).catch(() => null);
    const count         = countStr ? parseInt(countStr, 10) : 0;

    // Si jamais chargée, pas d'alerte (optionnel)
    if (!lastUpdateStr && count === 0) continue;

    totalEntities += count;

    let ageHours: number | null = null;
    let isStale = false;
    let staleSince: string | undefined;

    if (lastUpdateStr) {
      const lastUpdate = new Date(lastUpdateStr);
      ageHours = Math.round((Date.now() - lastUpdate.getTime()) / 3_600_000);
      isStale  = ageHours > staleThresholdHours;
      if (isStale) staleSince = lastUpdateStr;
    } else if (count > 0) {
      // Données présentes mais pas de timestamp → considérer stale
      isStale  = true;
    }

    reports.push({
      provider:   key.toUpperCase(),
      count,
      lastUpdate: lastUpdateStr,
      ageHours,
      isStale,
      ...(staleSince ? { staleSince } : {}),
    });
  }

  const staleCount = reports.filter(r => r.isStale).length;

  if (staleCount > 0) {
    const staleProviders = reports.filter(r => r.isStale).map(r => r.provider);
    log.warn(
      { staleProviders },
      `⚠️  ${staleCount} liste(s) de sanctions non mises à jour depuis plus de ${staleThresholdHours}h`
    );
    // Créer des alertes DB pour chaque liste stale (prod uniquement)
    for (const report of reports.filter(r => r.isStale)) {
      const ageH = report.ageHours ?? (staleThresholdHours + 1);
      await createStaleAlert(report.provider.toLowerCase(), ageH).catch(() => undefined);
    }
  }

  return { reports, anyStale: staleCount > 0, staleCount, totalEntities };
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
    key:      string;
    fetcher:  () => Promise<SanctionEntity[]>;
    optional?: boolean;   // true = pas d'erreur si vide (liste non configurée)
  }> = [
    { key: "ofac", fetcher: fetchOfacList },
    { key: "eu",   fetcher: fetchEuList   },
    { key: "un",   fetcher: fetchUnList   },
    { key: "uk",   fetcher: fetchUkList   },
    { key: "pep",  fetcher: fetchPepList,  optional: true },  // PPE — optionnel
    { key: "bam",  fetcher: fetchBamList,  optional: true },  // BAM/ANRF — optionnel
  ];

  const allEntities: SanctionEntity[] = [];
  const statuses:    ListStatus[]     = [];

  for (const { key, fetcher, optional } of providers) {
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
    const t0 = Date.now();
    let fresh: SanctionEntity[];
    try {
      fresh = await fetcher();
    } catch (fetchErr) {
      log.error({ provider: key, err: fetchErr }, "Fetcher a lancé une exception non gérée");
      fresh = [];
    }
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
        // Aucun cache ET fetch échoué
        if (optional) {
          // PEP : mock en dev même si optional (pour tests de conformité)
          const isDev = process.env["NODE_ENV"] !== "production";
          if (key === "pep" && isDev) {
            const mock = getMockPepEntities();
            await setCache(key, mock);
            allEntities.push(...mock);
            statuses.push({
              provider:   key.toUpperCase(),
              count:      mock.length,
              lastUpdate: new Date().toISOString(),
              fromCache:  false,
              error:      "Source indisponible — données PEP de démonstration chargées",
            });
            log.warn({ provider: key }, "Source PEP inaccessible — données mock PEP chargées (dev)");
          } else {
          // Autre liste optionnelle (BAM, CUSTOM) : pas de mock, pas d'erreur bloquante
          statuses.push({
            provider:   key.toUpperCase(),
            count:      0,
            lastUpdate: null,
            fromCache:  false,
            error:      "Source non configurée ou inaccessible",
          });
          }
        } else {
          // Liste obligatoire (OFAC, EU, UN, UK) → mock en dev
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
            log.error({ provider: key }, "Liste obligatoire vide en production !");
          }
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
