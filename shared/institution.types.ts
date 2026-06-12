// ─── Types partagés institution — frontend & backend ─────────────────────────
// Ce fichier est importé côté serveur ET côté client (via le context React).
// Ne pas importer de modules Node.js ici.

export type InstitutionType =
  | "CLASSIC_BANK"
  | "MICROFINANCE"
  | "PAYMENT_INSTITUTION";

/**
 * Feature flags dérivés de INSTITUTION_TYPE.
 * Calculés une seule fois au démarrage serveur, exposés au frontend via
 * l'endpoint tRPC `institution.getConfig`.
 *
 * CLASSIC_BANK → tous les flags = false → comportement actuel inchangé.
 */
export interface InstitutionFeatureFlags {
  institutionType: InstitutionType;
  institutionName: string;

  // ── Schéma / données ────────────────────────────────────────────────────────
  /** Tables wallets et kyc_tier_snapshots sont utilisées */
  wallets: boolean;
  /** Table agent_accounts est utilisée */
  agentAccounts: boolean;
  /** Nouveaux types de transactions (AGENT_CASH_IN, P2P_TRANSFER…) visibles en UI */
  mobileTransactionTypes: boolean;

  // ── KYC ─────────────────────────────────────────────────────────────────────
  /** Système de tiers KYC : ALLÉÉ / STANDARD / RENFORCÉ */
  walletKyc: boolean;
  /** Le tier RENFORCÉ déclenche un flux EDD complet */
  enhancedOnboarding: boolean;

  // ── AML ─────────────────────────────────────────────────────────────────────
  /** 5 règles AML wallet chargées en complément des 11 règles existantes */
  walletAml: boolean;

  // ── Reporting ───────────────────────────────────────────────────────────────
  /** Rapports réglementaires BAM pour établissements de paiement */
  bamReports: boolean;

  // ── Connecteurs ─────────────────────────────────────────────────────────────
  /** Endpoints webhook Orange Money, Wave, etc. actifs */
  mobileConnectors: boolean;

  // ── Interface agent ─────────────────────────────────────────────────────────
  /** Page et règles de gestion du réseau d'agents */
  agentNetwork: boolean;

  // ── Correspondent Banking ────────────────────────────────────────────────────
  /** Module banque correspondante (FATF R.13) : évaluation, revue annuelle, senior mgmt approval */
  correspondentBanking: boolean;
}

// ─── Tier KYC ────────────────────────────────────────────────────────────────

export type KycTier = "ALLEGED" | "STANDARD" | "RENFORCE";

export interface KycTierConfig {
  tier: KycTier;
  label: string;
  /** Plafond transaction unique (MAD) */
  maxSingleTx: number;
  /** Plafond mensuel (MAD) */
  maxMonthly: number;
  /** Documents minimum requis */
  requiredDocuments: string[];
  /** Délai de revue périodique (jours) */
  reviewPeriodDays: number;
}

export const KYC_TIER_CONFIGS: Record<KycTier, KycTierConfig> = {
  ALLEGED: {
    tier:              "ALLEGED",
    label:             "KYC Allégé",
    maxSingleTx:       5_000,
    maxMonthly:        20_000,
    requiredDocuments: ["ID_CARD"],
    reviewPeriodDays:  180,
  },
  STANDARD: {
    tier:              "STANDARD",
    label:             "KYC Standard",
    maxSingleTx:       50_000,
    maxMonthly:        200_000,
    requiredDocuments: ["ID_CARD", "PROOF_OF_ADDRESS"],
    reviewPeriodDays:  365,
  },
  RENFORCE: {
    tier:              "RENFORCE",
    label:             "KYC Renforcé (EDD)",
    maxSingleTx:       500_000,
    maxMonthly:        2_000_000,
    requiredDocuments: ["ID_CARD", "PROOF_OF_ADDRESS", "BANK_STATEMENT"],
    reviewPeriodDays:  90,
  },
};

// ─── Labels ───────────────────────────────────────────────────────────────────

export const INSTITUTION_TYPE_LABELS: Record<InstitutionType, string> = {
  CLASSIC_BANK:        "Banque Classique",
  MICROFINANCE:        "Banque de Microfinance",
  PAYMENT_INSTITUTION: "Établissement de Paiement",
};

export const KYC_TIER_LABELS: Record<KycTier, string> = {
  ALLEGED:  "Allégé",
  STANDARD: "Standard",
  RENFORCE: "Renforcé",
};

// ─── Feature flags par défaut (CLASSIC_BANK) ─────────────────────────────────
// Utilisé comme valeur initiale dans le React context (avant fetch du serveur).

export const CLASSIC_BANK_FLAGS: InstitutionFeatureFlags = {
  institutionType:        "CLASSIC_BANK",
  institutionName:        "Établissement Financier",
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
