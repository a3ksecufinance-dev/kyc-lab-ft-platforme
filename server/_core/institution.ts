/**
 * Institution Feature Flags — source de vérité unique
 *
 * Lit ENV.INSTITUTION_TYPE au démarrage et produit un objet InstitutionFeatureFlags
 * immutable pour toute la durée de vie du processus.
 *
 * Usage : getInstitutionFlags().walletAml → boolean
 *
 * CLASSIC_BANK (défaut) : tous les flags = false → zéro impact sur le comportement actuel.
 */

import type { InstitutionFeatureFlags, InstitutionType } from "../../shared/institution.types";

// ─── Matrice des flags par type d'institution ─────────────────────────────────

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

// ─── Singleton ────────────────────────────────────────────────────────────────
// Évalué une seule fois au premier appel, puis mis en cache.
// getInstitutionFlags() est un lookup pur à coût zéro dans les chemins chauds.

let _flags: InstitutionFeatureFlags | null = null;

export function getInstitutionFlags(): InstitutionFeatureFlags {
  if (_flags) return _flags;

  const rawType = process.env["INSTITUTION_TYPE"] ?? "CLASSIC_BANK";
  const institutionType = (
    rawType === "MICROFINANCE" || rawType === "PAYMENT_INSTITUTION"
      ? rawType
      : "CLASSIC_BANK"
  ) as InstitutionType;

  const institutionName = process.env["INSTITUTION_NAME"] ?? "Établissement Financier";

  _flags = {
    ...FLAGS_BY_TYPE[institutionType],
    institutionName,
  };

  return _flags;
}

/**
 * Réinitialise le singleton — uniquement pour les tests.
 * Ne jamais appeler en production.
 */
export function _resetInstitutionFlags(): void {
  _flags = null;
}
