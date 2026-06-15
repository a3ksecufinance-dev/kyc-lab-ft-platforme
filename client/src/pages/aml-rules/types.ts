import type React from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────

export const C = {
  surface: "var(--wr-card)",
  border:  "var(--wr-border)",
  border2: "var(--wr-border2)",
  text1:   "var(--wr-text-1)",
  text2:   "var(--wr-text-2)",
  text3:   "var(--wr-text-3)",
  text4:   "var(--wr-text-4)",
  gold:    "var(--wr-gold)",
  red:     "var(--wr-red)",
  amber:   "var(--wr-amber)",
  green:   "var(--wr-green)",
  blue:    "var(--wr-blue)",
  mono:    "var(--wr-font-mono)",
  serif:   "var(--wr-font-serif)",
  hover:   "var(--wr-hover)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type AmlRule = {
  id: number; ruleId: string; name: string; description: string | null;
  category: string; status: "ACTIVE" | "INACTIVE" | "TESTING";
  baseScore: number; priority: string; alertType: string;
  thresholdValue: string | null; windowMinutes: number | null;
  countThreshold: number | null; conditions: unknown;
  createdAt: Date; updatedAt: Date;
};

export type SimpleCondition = {
  type: "simple";
  field: string;
  op: ">=" | "<=" | ">" | "<" | "==" | "!=" | "in" | "not_in";
  value: string;
};

export type CompoundCondition = {
  type: "compound";
  logic: "AND" | "OR";
  rules: Condition[];
};

export type Condition = SimpleCondition | CompoundCondition;

export type JurisdictionProfile = {
  id: number;
  jurisdictionCode: string;
  jurisdictionName: string;
  isActive: boolean;
  currencyCode: string;
  thresholdSingleTx: string | null;
  thresholdStructuring: string | null;
  strMandatoryAbove: string | null;
  strDelayHours: number;
  sarDelayHours: number;
  enhancedDdPep: boolean;
  enhancedDdHighRisk: boolean;
  regulatorName: string | null;
  regulatorCode: string | null;
  reportingFormat: string;
  coveredCountries: string[] | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  THRESHOLD: "Seuil", FREQUENCY: "Fréquence", PATTERN: "Pattern",
  GEOGRAPHY: "Géographie", COUNTERPARTY: "Contrepartie",
  VELOCITY: "Vélocité", CUSTOMER: "Client",
};

export const CATEGORY_STYLE: Record<string, React.CSSProperties> = {
  THRESHOLD:    { color: "var(--wr-amber)",  background: "rgba(245,158,11,0.09)",  border: "1px solid rgba(245,158,11,0.22)"  },
  FREQUENCY:    { color: "var(--wr-blue)",   background: "rgba(74,158,255,0.09)",  border: "1px solid rgba(74,158,255,0.22)"  },
  PATTERN:      { color: "var(--wr-gold)",   background: "rgba(201,162,39,0.09)",  border: "1px solid rgba(201,162,39,0.2)"   },
  GEOGRAPHY:    { color: "var(--wr-red)",    background: "rgba(255,101,112,0.09)", border: "1px solid rgba(255,101,112,0.22)" },
  COUNTERPARTY: { color: "var(--wr-amber)",  background: "rgba(245,158,11,0.07)",  border: "1px solid rgba(245,158,11,0.2)"   },
  VELOCITY:     { color: "var(--wr-blue)",   background: "rgba(74,158,255,0.07)",  border: "1px solid rgba(74,158,255,0.2)"   },
  CUSTOMER:     { color: "var(--wr-green)",  background: "rgba(45,212,160,0.09)",  border: "1px solid rgba(45,212,160,0.22)"  },
};

export const FIELDS = [
  { group: "Transaction", options: [
    { value: "amount",             label: "Montant (MAD/EUR)" },
    { value: "currency",           label: "Devise" },
    { value: "channel",            label: "Canal (ONLINE/ATM...)" },
    { value: "transactionType",    label: "Type (TRANSFER...)" },
    { value: "counterpartyCountry",label: "Pays contrepartie (ISO)" },
    { value: "counterpartyBank",   label: "Banque contrepartie" },
    { value: "amountIsRound",      label: "Montant rond (>=5000, %1000)" },
    { value: "isHighAmount",       label: "Montant élevé (>=seuil ENV)" },
  ]},
  { group: "Client", options: [
    { value: "pepStatus",          label: "Statut PEP (true/false)" },
    { value: "riskLevel",          label: "Niveau risque (LOW/HIGH...)" },
    { value: "riskScore",          label: "Score risque (0-100)" },
    { value: "kycStatus",          label: "Statut KYC" },
    { value: "customerType",       label: "Type client (INDIVIDUAL...)" },
    { value: "residenceCountry",   label: "Pays résidence (ISO)" },
    { value: "nationality",        label: "Nationalité (ISO)" },
  ]},
  { group: "Agrégés 24h", options: [
    { value: "recentTxCount",      label: "Nb transactions récentes" },
    { value: "recentTxVolume",     label: "Volume total récent (MAD)" },
    { value: "volumeVariation",    label: "Variation volume (%)" },
  ]},
];

export const OPERATORS = [
  { value: ">=", label: ">=  supérieur ou égal" },
  { value: "<=", label: "<=  inférieur ou égal" },
  { value: ">",  label: ">  strictement supérieur" },
  { value: "<",  label: "<  strictement inférieur" },
  { value: "==", label: "=  égal à" },
  { value: "!=", label: "!=  différent de" },
  { value: "in",     label: "in  dans la liste (virgule)" },
  { value: "not_in", label: "not_in  hors liste" },
];

// Templates BAM Maroc / FATF
export const TEMPLATES = [
  {
    label: "Seuil BAM 10 000 MAD",
    icon: "\u{1F1F2}\u{1F1E6}",
    conditions: { type: "simple", field: "amount", op: ">=", value: "10000" } as Condition,
    category: "THRESHOLD", priority: "HIGH", score: 60, alertType: "THRESHOLD",
    desc: "Transaction unique >= 10 000 MAD -- seuil déclaratoire BAM Circulaire 5/W/2023",
  },
  {
    label: "Pays FATF risque élevé",
    icon: "\u{1F30D}",
    conditions: { type: "simple", field: "counterpartyCountry", op: "in", value: "KP,IR,MM,BY,RU,SY,YE,AF" } as Condition,
    category: "GEOGRAPHY", priority: "HIGH", score: 70, alertType: "THRESHOLD",
    desc: "Contrepartie dans un pays sous sanctions FATF ou liste grise",
  },
  {
    label: "Client PEP + montant > 5000",
    icon: "\u{1F464}",
    conditions: {
      type: "compound", logic: "AND",
      rules: [
        { type: "simple", field: "pepStatus",  op: "==", value: "true"  },
        { type: "simple", field: "amount",     op: ">=", value: "5000"  },
      ],
    } as Condition,
    category: "CUSTOMER", priority: "HIGH", score: 65, alertType: "PEP",
    desc: "Transaction PEP >= 5 000 MAD -- vigilance renforcée AMLD6 Art.18",
  },
  {
    label: "Structuring (Smurfing)",
    icon: "\u{1F4CA}",
    conditions: {
      type: "compound", logic: "AND",
      rules: [
        { type: "simple", field: "recentTxCount", op: ">=", value: "3"    },
        { type: "simple", field: "amount",         op: "<",  value: "9999" },
      ],
    } as Condition,
    category: "PATTERN", priority: "CRITICAL", score: 85, alertType: "PATTERN",
    desc: ">=3 transactions sous 10 000 MAD en 24h -- pattern structuring",
  },
  {
    label: "Variation volume +300%",
    icon: "\u{1F4C8}",
    conditions: { type: "simple", field: "volumeVariation", op: ">=", value: "300" } as Condition,
    category: "VELOCITY", priority: "MEDIUM", score: 55, alertType: "VELOCITY",
    desc: "Volume journalier > 3x la moyenne historique 30j",
  },
  {
    label: "Hawala / Réseau informel",
    icon: "\u{1F578}\u{FE0F}",
    conditions: {
      type: "compound", logic: "AND",
      rules: [
        { type: "simple", field: "channel",           op: "in", value: "BRANCH,ATM" },
        { type: "simple", field: "recentTxCount",      op: ">=", value: "5"          },
        { type: "simple", field: "residenceCountry",   op: "!=", value: "MA"         },
      ],
    } as Condition,
    category: "PATTERN", priority: "HIGH", score: 75, alertType: "PATTERN",
    desc: "Pattern hawala : flux cash agence/ATM + fréquence élevée + non-résident",
  },
];

// ─── CSS class helpers ───────────────────────────────────────────────────────

export const inputCls  = "w-full bg-[var(--wr-hover)] border border-[var(--wr-border2)] rounded-md px-3 py-2 text-xs font-mono text-[var(--wr-text-1)] placeholder-[var(--wr-text-4)] focus:outline-none focus:border-[var(--wr-blue)] transition-colors";
export const labelCls  = "block text-[10px] font-mono text-[var(--wr-text-3)] tracking-widest uppercase mb-1.5";
export const btnBlue   = "px-3 py-1.5 text-xs font-mono bg-[var(--wr-blue)]/20 border border-[var(--wr-blue)]/40 text-[var(--wr-blue)] rounded-md hover:bg-[var(--wr-blue)]/30 transition-colors";
export const btnGhost  = "px-3 py-1.5 text-xs font-mono border border-[var(--wr-border2)] text-[var(--wr-text-3)] rounded-md hover:border-[var(--wr-border)] transition-colors";
export const btnRed    = "px-3 py-1.5 text-xs font-mono bg-[rgba(255,101,112,0.08)] border border-[rgba(255,101,112,0.2)] text-[var(--wr-red)] rounded-md hover:bg-[rgba(255,101,112,0.14)] transition-colors";
