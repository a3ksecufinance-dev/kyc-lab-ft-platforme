// ─── Types partagés licensing — frontend & backend ───────────────────────────
// Ce fichier est importé côté serveur ET côté client (via le context React).
// Ne pas importer de modules Node.js ici.

// ─── Modules licenciables ────────────────────────────────────────────────────

export const LICENSE_MODULES = {
  core:           "Core KYC/AML",
  aml_engine:     "Moteur AML",
  wallets:        "Wallets",
  wallet_aml:     "Règles AML Wallet",
  agents:         "Réseau Agents",
  correspondent:  "Banques Correspondantes",
  ekyc:           "eKYC (OCR + Identité)",
  reporting:      "Reporting Réglementaire",
  bam_reports:    "Rapports BAM",
  pkyc:           "Perpetual KYC",
  travel_rule:    "Travel Rule FATF",
  ml_scoring:     "Scoring ML",
  cbs_connect:    "Intégration CBS",
} as const;

export type LicenseModule = keyof typeof LICENSE_MODULES;

export const ALL_LICENSE_MODULES = Object.keys(LICENSE_MODULES) as LicenseModule[];

// ─── Packs commerciaux ──────────────────────────────────────────────────────

export const LICENSE_PACKS = {
  essential: {
    label: "Essential",
    modules: ["core", "aml_engine", "reporting"] as LicenseModule[],
  },
  standard: {
    label: "Standard",
    modules: ["core", "aml_engine", "reporting", "ekyc", "cbs_connect"] as LicenseModule[],
  },
  mobile: {
    label: "Mobile",
    modules: [
      "core", "aml_engine", "reporting", "ekyc", "cbs_connect",
      "wallets", "wallet_aml", "agents",
    ] as LicenseModule[],
  },
  enterprise: {
    label: "Enterprise",
    modules: ALL_LICENSE_MODULES,
  },
} as const;

export type LicensePack = keyof typeof LICENSE_PACKS;

// ─── Payload de la clé de licence ───────────────────────────────────────────

export interface LicensePayload {
  /** UUID unique de la licence */
  lid: string;
  /** Nom du client */
  client: string;
  /** Type d'institution */
  type: "CLASSIC_BANK" | "MICROFINANCE" | "PAYMENT_INSTITUTION";
  /** Modules activés */
  modules: LicenseModule[];
  /** Nombre max d'utilisateurs actifs */
  maxUsers: number;
  /** Timestamp d'émission (epoch seconds) */
  iat: number;
  /** Timestamp d'expiration (epoch seconds) */
  exp: number;
}

// ─── Statut licence ─────────────────────────────────────────────────────────

export type LicenseStatus = "ACTIVE" | "EXPIRED" | "GRACE" | "INVALID" | "NONE";

/** Nombre de jours de grâce après expiration (lecture seule, pas de nouvelles données) */
export const LICENSE_GRACE_DAYS = 15;

// ─── Info licence exposée au frontend ───────────────────────────────────────

export interface LicenseInfo {
  status: LicenseStatus;
  licenseId: string | null;
  clientName: string | null;
  institutionType: string | null;
  modules: LicenseModule[];
  maxUsers: number;
  currentUsers: number;
  issuedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  /** true si licence en période de grâce (fonctionnalités lecture seule) */
  graceMode: boolean;
}

// ─── Mapping modules → feature flags ────────────────────────────────────────
// Utilisé par institution.ts pour dériver les flags depuis la licence active.

export const MODULE_TO_FLAGS: Record<LicenseModule, string[]> = {
  core:           [],  // toujours actif si licence valide
  aml_engine:     [],  // toujours actif si licence valide
  wallets:        ["wallets", "walletKyc", "mobileTransactionTypes"],
  wallet_aml:     ["walletAml"],
  agents:         ["agentAccounts", "agentNetwork"],
  correspondent:  ["correspondentBanking"],
  ekyc:           ["enhancedOnboarding"],
  reporting:      [],  // toujours actif si licence valide
  bam_reports:    ["bamReports"],
  pkyc:           [],  // module gated séparément
  travel_rule:    [],  // module gated séparément
  ml_scoring:     [],  // module gated séparément
  cbs_connect:    ["mobileConnectors"],
};
