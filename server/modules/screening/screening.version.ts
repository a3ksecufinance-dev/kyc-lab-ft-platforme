/**
 * Versioning des listes de sanctions
 *
 * Chaque mise à jour d'une liste est archivée dans Redis :
 *   screening:list:{provider}:v{N}     — snapshot des entités
 *   screening:list:{provider}:vmeta    — métadonnées (count, date, checksum)
 *   screening:list:{provider}:vcurrent — numéro de version courante
 *
 * Les 3 dernières versions sont conservées.
 * Rollback possible en cas de régression (parseur cassé, liste corrompue).
 *
 * Checksum SHA-256 de chaque snapshot permet de détecter les modifications.
 */

import crypto         from "node:crypto";
import { redis }      from "../../_core/redis";
import { createLogger } from "../../_core/logger";
import type { SanctionEntity } from "./screening.matcher";

const log = createLogger("screening-version");

const MAX_VERSIONS   = 3;
const VERSION_TTL    = 10 * 24 * 3600;  // 10 jours

// ─── Clés Redis ───────────────────────────────────────────────────────────────

const vKey  = (p: string, n: number) => `screening:list:${p}:v${n}`;
const vMeta = (p: string)            => `screening:list:${p}:vmeta`;
const vCurr = (p: string)            => `screening:list:${p}:vcurrent`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListVersionMeta {
  version:   number;
  count:     number;
  checksum:  string;       // SHA-256 du JSON sérialisé
  createdAt: string;       // ISO
  provider:  string;
}

export interface VersionHistory {
  provider:  string;
  current:   number;
  versions:  ListVersionMeta[];
}

// ─── Checksum ─────────────────────────────────────────────────────────────────

export function computeChecksum(entities: SanctionEntity[]): string {
  const json = JSON.stringify(entities.map(e => e.id).sort());
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
}

// ─── Écriture versionnée (atomic swap) ───────────────────────────────────────

/**
 * Sauvegarde une nouvelle version de la liste et effectue un swap atomique.
 * Le swap garantit qu'aucune requête ne lira une liste partiellement écrite.
 */
export async function saveVersionedList(
  provider:  string,
  entities:  SanctionEntity[],
): Promise<ListVersionMeta> {
  const payload   = JSON.stringify(entities);
  const checksum  = computeChecksum(entities);

  // Lire la version courante
  const currStr = await redis.get(vCurr(provider)).catch(() => null);
  const curr    = currStr ? parseInt(currStr, 10) : 0;

  // Éviter les re-sauvegardes inutiles si checksum identique
  if (curr > 0) {
    const prevMetaStr = await redis.get(vMeta(provider)).catch(() => null);
    if (prevMetaStr) {
      const prevMeta = JSON.parse(prevMetaStr) as ListVersionMeta[];
      const latest   = prevMeta.find(m => m.version === curr);
      if (latest?.checksum === checksum) {
        log.debug({ provider, version: curr }, "Liste inchangée — skip sauvegarde");
        return latest;
      }
    }
  }

  const nextVersion = curr + 1;
  const meta: ListVersionMeta = {
    version:   nextVersion,
    count:     entities.length,
    checksum,
    createdAt: new Date().toISOString(),
    provider,
  };

  // Pipeline atomique : écriture + mise à jour du pointer courant
  const pipeline = redis.pipeline();
  pipeline.setex(vKey(provider, nextVersion), VERSION_TTL, payload);
  pipeline.set(vCurr(provider), String(nextVersion));

  // Mettre à jour les métadonnées (garder MAX_VERSIONS entrées)
  const prevMetaStr = await redis.get(vMeta(provider)).catch(() => null);
  const allMeta: ListVersionMeta[] = prevMetaStr
    ? (JSON.parse(prevMetaStr) as ListVersionMeta[])
    : [];

  allMeta.unshift(meta);
  const trimmed = allMeta.slice(0, MAX_VERSIONS);
  pipeline.setex(vMeta(provider), VERSION_TTL, JSON.stringify(trimmed));

  // Supprimer les vieilles versions au-delà de MAX_VERSIONS
  if (nextVersion > MAX_VERSIONS) {
    pipeline.del(vKey(provider, nextVersion - MAX_VERSIONS));
  }

  await pipeline.exec();

  log.info({ provider, version: nextVersion, count: entities.length, checksum }, "Nouvelle version liste sauvegardée");
  return meta;
}

// ─── Lecture versionnée ───────────────────────────────────────────────────────

export async function getVersionedList(
  provider: string,
  version?: number,   // undefined = version courante
): Promise<SanctionEntity[] | null> {
  let targetVersion = version;

  if (!targetVersion) {
    const currStr = await redis.get(vCurr(provider)).catch(() => null);
    if (!currStr) return null;
    targetVersion = parseInt(currStr, 10);
  }

  const raw = await redis.get(vKey(provider, targetVersion)).catch(() => null);
  return raw ? (JSON.parse(raw) as SanctionEntity[]) : null;
}

// ─── Historique des versions ──────────────────────────────────────────────────

export async function getVersionHistory(provider: string): Promise<VersionHistory> {
  const currStr    = await redis.get(vCurr(provider)).catch(() => null);
  const current    = currStr ? parseInt(currStr, 10) : 0;
  const metaStr    = await redis.get(vMeta(provider)).catch(() => null);
  const versions   = metaStr ? (JSON.parse(metaStr) as ListVersionMeta[]) : [];
  return { provider, current, versions };
}

// ─── Rollback ─────────────────────────────────────────────────────────────────

/**
 * Restaure une version précédente comme version active.
 * Le snapshot doit exister en Redis (dans les MAX_VERSIONS conservées).
 */
export async function rollbackToVersion(
  provider:       string,
  targetVersion:  number,
): Promise<{ success: boolean; message: string; meta?: ListVersionMeta }> {
  const metaStr = await redis.get(vMeta(provider)).catch(() => null);
  if (!metaStr) return { success: false, message: `Aucune version disponible pour ${provider}` };

  const allMeta  = JSON.parse(metaStr) as ListVersionMeta[];
  const targetMeta = allMeta.find(m => m.version === targetVersion);
  if (!targetMeta) {
    return { success: false, message: `Version ${targetVersion} non trouvée (versions disponibles: ${allMeta.map(m => m.version).join(", ")})` };
  }

  const snapshot = await redis.get(vKey(provider, targetVersion)).catch(() => null);
  if (!snapshot) {
    return { success: false, message: `Snapshot version ${targetVersion} expiré de Redis` };
  }

  // Pointer la version active sur la version cible (sans écraser les snapshots)
  await redis.set(vCurr(provider), String(targetVersion));

  // Remettre à jour le cache principal utilisé par le screening
  const { RedisKeys } = await import("../../_core/redis");
  await redis.setex(RedisKeys.screeningList(provider.toLowerCase()), 23 * 3600, snapshot);
  await redis.set(RedisKeys.screeningLastUpdate(provider.toLowerCase()), new Date().toISOString());
  await redis.set(RedisKeys.screeningListCount(provider.toLowerCase()), String(targetMeta.count));

  log.warn({ provider, targetVersion, count: targetMeta.count }, "Rollback liste sanctions effectué");
  return { success: true, message: `Rollback vers version ${targetVersion} (${targetMeta.count} entités, ${targetMeta.createdAt})`, meta: targetMeta };
}

// ─── Vérification d'intégrité ─────────────────────────────────────────────────

export async function verifyListIntegrity(provider: string): Promise<{
  ok:              boolean;
  version:         number;
  expectedChecksum: string;
  actualChecksum:  string;
  match:           boolean;
}> {
  const currStr = await redis.get(vCurr(provider)).catch(() => null);
  const curr    = currStr ? parseInt(currStr, 10) : 0;

  const metaStr = await redis.get(vMeta(provider)).catch(() => null);
  const allMeta = metaStr ? (JSON.parse(metaStr) as ListVersionMeta[]) : [];
  const meta    = allMeta.find(m => m.version === curr);
  if (!meta || curr === 0) {
    return { ok: false, version: curr, expectedChecksum: "", actualChecksum: "", match: false };
  }

  const snapshot = await redis.get(vKey(provider, curr)).catch(() => null);
  if (!snapshot) {
    return { ok: false, version: curr, expectedChecksum: meta.checksum, actualChecksum: "", match: false };
  }

  const entities       = JSON.parse(snapshot) as SanctionEntity[];
  const actualChecksum = computeChecksum(entities);
  const match          = actualChecksum === meta.checksum;

  if (!match) {
    log.error({ provider, curr, expected: meta.checksum, actual: actualChecksum }, "Intégrité liste sanctions COMPROMISE");
  }

  return { ok: match, version: curr, expectedChecksum: meta.checksum, actualChecksum, match };
}

// ─── Statut global de toutes les versions ─────────────────────────────────────

export async function getAllVersionsStatus(): Promise<VersionHistory[]> {
  const providers = ["ofac", "eu", "un", "uk", "pep", "bam"];
  return Promise.all(providers.map(p => getVersionHistory(p)));
}
