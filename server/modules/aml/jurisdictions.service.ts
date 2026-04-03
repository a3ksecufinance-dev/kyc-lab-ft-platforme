/**
 * Service de gestion des profils de juridictions AML
 *
 * Chaque juridiction définit :
 *  - Les seuils réglementaires adaptés (montants dans la devise locale)
 *  - Les obligations de déclaration (STR/SAR, délais légaux)
 *  - Le régulateur compétent (TRACFIN, UTRF, NCA, FinCEN...)
 *  - Les pays couverts
 *
 * Le moteur AML utilise le profil de la juridiction du client
 * pour adapter les seuils de déclenchement.
 */

import { db } from "../../_core/db";
import { jurisdictionProfiles } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../../_core/logger";
import { ENV } from "../../_core/env";
import type { JurisdictionProfile } from "../../../drizzle/schema";

const log = createLogger("jurisdictions");

// ─── Cache en mémoire (TTL 5 minutes) ────────────────────────────────────────

const cache = new Map<string, { profile: JurisdictionProfile; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function getJurisdictionProfile(
  countryCode: string,
): Promise<JurisdictionProfile | null> {
  const code = countryCode.toUpperCase();

  // Cache
  const cached = cache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  try {
    // 1. Chercher un profil qui couvre ce pays
    const all = await db
      .select()
      .from(jurisdictionProfiles)
      .where(eq(jurisdictionProfiles.isActive, true));

    // Chercher par jurisdiction_code exact d'abord
    let profile = all.find((p) => p.jurisdictionCode === code);

    // Puis chercher dans les covered_countries
    if (!profile) {
      profile = all.find((p) => {
        const countries = p.coveredCountries as string[];
        return Array.isArray(countries) && countries.includes(code);
      });
    }

    // Fallback sur EU si pays européen non trouvé
    if (!profile) {
      profile = all.find((p) => p.jurisdictionCode === "EU");
    }

    if (profile) {
      cache.set(code, { profile, expiresAt: Date.now() + CACHE_TTL });
      return profile;
    }

    return null;
  } catch (err) {
    log.warn({ err, countryCode }, "Erreur lecture profil juridiction");
    return null;
  }
}

// ─── Seuils effectifs pour une juridiction ────────────────────────────────────

export interface JurisdictionThresholds {
  singleTx:         number;
  structuring:      number;
  structuringWindowH: number;
  frequencyCount:   number;
  cash:             number;
  currency:         string;
  strMandatoryAbove: number;
  strDelayHours:    number;
  sarDelayHours:    number;
  regulatorCode:    string;
  reportingFormat:  string;
  enhancedDdPep:    boolean;
  enhancedDdHighRisk: boolean;
}

export async function getEffectiveThresholds(
  residenceCountry: string | null | undefined,
): Promise<JurisdictionThresholds> {
  // Valeurs globales depuis ENV (défaut)
  const defaults: JurisdictionThresholds = {
    singleTx:          ENV.AML_THRESHOLD_SINGLE_TX,
    structuring:       ENV.AML_THRESHOLD_STRUCTURING,
    structuringWindowH: ENV.AML_STRUCTURING_WINDOW_HOURS,
    frequencyCount:    ENV.AML_FREQUENCY_THRESHOLD,
    cash:              ENV.AML_THRESHOLD_SINGLE_TX,
    currency:          "EUR",
    strMandatoryAbove: ENV.AML_THRESHOLD_SINGLE_TX,
    strDelayHours:     24,
    sarDelayHours:     72,
    regulatorCode:     ENV.TRACFIN_ENTITY_ID?.split("-")[0] ?? "LOCAL",
    reportingFormat:   "GOAML_2",
    enhancedDdPep:     true,
    enhancedDdHighRisk: true,
  };

  if (!residenceCountry) return defaults;

  const profile = await getJurisdictionProfile(residenceCountry);
  if (!profile) return defaults;

  return {
    singleTx:          profile.thresholdSingleTx   ? Number(profile.thresholdSingleTx)   : defaults.singleTx,
    structuring:       profile.thresholdStructuring ? Number(profile.thresholdStructuring) : defaults.structuring,
    structuringWindowH: profile.structuringWindowH  ?? defaults.structuringWindowH,
    frequencyCount:    profile.frequencyThreshold   ?? defaults.frequencyCount,
    cash:              profile.cashThreshold        ? Number(profile.cashThreshold)        : defaults.cash,
    currency:          profile.currencyCode,
    strMandatoryAbove: profile.strMandatoryAbove    ? Number(profile.strMandatoryAbove)    : defaults.strMandatoryAbove,
    strDelayHours:     profile.strDelayHours        ?? defaults.strDelayHours,
    sarDelayHours:     profile.sarDelayHours        ?? defaults.sarDelayHours,
    regulatorCode:     profile.regulatorCode        ?? defaults.regulatorCode,
    reportingFormat:   profile.reportingFormat      ?? defaults.reportingFormat,
    enhancedDdPep:     profile.enhancedDdPep,
    enhancedDdHighRisk: profile.enhancedDdHighRisk,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listJurisdictions() {
  return db
    .select()
    .from(jurisdictionProfiles)
    .orderBy(jurisdictionProfiles.jurisdictionCode);
}

export async function getJurisdictionById(id: number) {
  const [p] = await db
    .select()
    .from(jurisdictionProfiles)
    .where(eq(jurisdictionProfiles.id, id))
    .limit(1);
  return p ?? null;
}

export async function upsertJurisdiction(
  data: Omit<typeof jurisdictionProfiles.$inferInsert, "id" | "createdAt" | "updatedAt">,
): Promise<JurisdictionProfile> {
  const [result] = await db
    .insert(jurisdictionProfiles)
    .values({ ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: jurisdictionProfiles.jurisdictionCode,
      set:    { ...data, updatedAt: new Date() },
    })
    .returning();

  if (!result) throw new Error("Erreur upsert juridiction");

  // Invalider le cache
  cache.delete(data.jurisdictionCode.toUpperCase());

  log.info({ code: data.jurisdictionCode }, "Profil juridiction mis à jour");
  return result;
}

export async function toggleJurisdiction(id: number, isActive: boolean): Promise<JurisdictionProfile> {
  const [result] = await db
    .update(jurisdictionProfiles)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(jurisdictionProfiles.id, id))
    .returning();

  if (!result) throw new Error("Juridiction introuvable");
  cache.clear(); // invalider tout le cache
  return result;
}

export function invalidateJurisdictionCache(): void {
  cache.clear();
}
