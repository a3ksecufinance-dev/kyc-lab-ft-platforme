/**
 * Institution Feature Flags — source de vérité unique
 *
 * Deux modes de fonctionnement :
 *
 * 1. MODE LICENCE (production) :
 *    LICENSE_KEY configuré → les flags sont dérivés des modules licenciés.
 *    L'institution type vient du payload de la licence.
 *
 * 2. MODE LEGACY (développement) :
 *    Pas de LICENSE_KEY → flags dérivés de INSTITUTION_TYPE env var
 *    via la matrice hardcodée (comportement d'origine).
 *
 * Usage : getInstitutionFlags().walletAml → boolean
 */

import type { InstitutionFeatureFlags, InstitutionType } from "../../shared/institution.types";
import { getLicense, getLicensedModules } from "./license";
import { MODULE_TO_FLAGS } from "../../shared/license.types";
import type { LicenseModule } from "../../shared/license.types";

// ─── Matrice des flags par type d'institution (mode legacy) ──────────────────

const FLAGS_BY_TYPE: Record<InstitutionType, Omit<InstitutionFeatureFlags, "institutionName">> = {
  CLASSIC_BANK: {
    institutionType:        "CLASSIC_BANK",
    wallets:                false,
    agentAccounts:          false,
    mobileTransactionTypes: false,
    walletKyc:              false,
    enhancedOnboarding:     false,
    walletAml:              false,
    bamReports:             false,
    mobileConnectors:       false,
    agentNetwork:           false,
    correspondentBanking:   true,    // banques classiques ont des correspondants SWIFT
  },

  MICROFINANCE: {
    institutionType:        "MICROFINANCE",
    wallets:                true,
    agentAccounts:          true,
    mobileTransactionTypes: true,
    walletKyc:              true,
    enhancedOnboarding:     false,   // tier STANDARD suffit en microfinance
    walletAml:              true,
    bamReports:             false,
    mobileConnectors:       false,
    agentNetwork:           true,
    correspondentBanking:   false,   // microfinance locale sans correspondants
  },

  PAYMENT_INSTITUTION: {
    institutionType:        "PAYMENT_INSTITUTION",
    wallets:                true,
    agentAccounts:          true,
    mobileTransactionTypes: true,
    walletKyc:              true,
    enhancedOnboarding:     true,
    walletAml:              true,
    bamReports:             true,
    mobileConnectors:       true,
    agentNetwork:           true,
    correspondentBanking:   true,    // PI ont des partenaires bancaires à évaluer
  },
};

// ─── Dérivation des flags depuis les modules licenciés ──────────────────────

function buildFlagsFromLicense(
  institutionType: InstitutionType,
  institutionName: string,
  modules: LicenseModule[],
): InstitutionFeatureFlags {
  // Partir de tout à false
  const flags: InstitutionFeatureFlags = {
    institutionType,
    institutionName,
    wallets:                false,
    agentAccounts:          false,
    mobileTransactionTypes: false,
    walletKyc:              false,
    enhancedOnboarding:     false,
    walletAml:              false,
    bamReports:             false,
    mobileConnectors:       false,
    agentNetwork:           false,
    correspondentBanking:   false,
  };

  // Activer les flags correspondant aux modules licenciés
  for (const mod of modules) {
    const flagKeys = MODULE_TO_FLAGS[mod];
    if (flagKeys) {
      for (const key of flagKeys) {
        if (key in flags) {
          (flags as any)[key] = true;
        }
      }
    }
  }

  return flags;
}

// ─── Singleton ────────────────────────────────────────────────────────────────
// Évalué une seule fois au premier appel, puis mis en cache.
// getInstitutionFlags() est un lookup pur à coût zéro dans les chemins chauds.

let _flags: InstitutionFeatureFlags | null = null;

export function getInstitutionFlags(): InstitutionFeatureFlags {
  if (_flags) return _flags;

  const licenseState = getLicense();
  const institutionName = process.env["INSTITUTION_NAME"] ?? "Établissement Financier";

  if (licenseState.mode === "licensed" && licenseState.payload && licenseState.status !== "EXPIRED") {
    // ── Mode licence : dériver les flags des modules licenciés ────────────
    const modules = getLicensedModules();
    const instType = licenseState.payload.type as InstitutionType;

    _flags = buildFlagsFromLicense(
      instType,
      licenseState.payload.client || institutionName,
      modules,
    );
  } else {
    // ── Mode legacy : matrice hardcodée par INSTITUTION_TYPE ──────────────
    const rawType = process.env["INSTITUTION_TYPE"] ?? "CLASSIC_BANK";
    const institutionType = (
      rawType === "MICROFINANCE" || rawType === "PAYMENT_INSTITUTION"
        ? rawType
        : "CLASSIC_BANK"
    ) as InstitutionType;

    _flags = {
      ...FLAGS_BY_TYPE[institutionType],
      institutionName,
    };
  }

  return _flags;
}

/**
 * Réinitialise le singleton — uniquement pour les tests.
 * Ne jamais appeler en production.
 */
export function _resetInstitutionFlags(): void {
  _flags = null;
}
