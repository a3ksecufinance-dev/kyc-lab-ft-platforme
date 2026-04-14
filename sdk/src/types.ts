/**
 * KYC-CBS SDK — Types communs
 * Contrats de données entre la plateforme KYC-AML et les systèmes Core Banking.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

export interface CbsClientConfig {
  /** URL de base du CBS (ex: https://cbs.banque.fr/api/v2) */
  baseUrl:    string;
  /** Clé API ou token OAuth Bearer */
  apiKey:     string;
  /** Timeout en ms (défaut: 10 000) */
  timeout?:   number;
  /** Activer les traces de débogage (défaut: false) */
  debug?:     boolean;
  /** En-têtes additionnels passés à chaque requête */
  headers?:   Record<string, string>;
}

// ─── Customer / Account ───────────────────────────────────────────────────────

export interface CbsCustomer {
  id:            string;
  externalRef?:  string;   // référence interne CBS
  firstName:     string;
  lastName:      string;
  dateOfBirth?:  string;   // ISO 8601
  nationality?:  string;   // ISO 3166-1 alpha-2
  address?:      CbsAddress;
  phone?:        string;
  email?:        string;
  kycStatus:     "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  riskLevel:     "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  accounts:      CbsAccount[];
  createdAt:     string;
  updatedAt:     string;
}

export interface CbsAddress {
  street?:     string;
  city?:       string;
  postalCode?: string;
  country:     string;  // ISO 3166-1 alpha-3
}

export interface CbsAccount {
  id:          string;
  iban?:       string;
  currency:    string;  // ISO 4217
  balance:     number;
  isActive:    boolean;
  accountType: "CURRENT" | "SAVINGS" | "LOAN" | "ESCROW" | "WALLET";
  openedAt:    string;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface CbsTransaction {
  id:              string;
  accountId:       string;
  counterpartId?:  string;   // ID du bénéficiaire/donneur d'ordre
  amount:          number;
  currency:        string;
  direction:       "DEBIT" | "CREDIT";
  type:            string;   // WIRE, SEPA_CREDIT, CASH, etc.
  channel:         string;
  reference?:      string;   // référence libre CBS
  description?:    string;
  status:          "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";
  valueDate:       string;
  bookingDate:     string;
  isSuspicious?:   boolean;
  metadata?:       Record<string, unknown>;
}

export interface CbsTransactionList {
  items:   CbsTransaction[];
  total:   number;
  page:    number;
  limit:   number;
  hasMore: boolean;
}

// ─── KYC update push ─────────────────────────────────────────────────────────

export interface CbsKycUpdatePayload {
  customerId:  string;
  kycStatus:   "APPROVED" | "REJECTED" | "EXPIRED";
  riskLevel:   "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  validUntil?: string;  // ISO 8601 — date d'expiration du KYC
  source:      string;  // "KYC_PLATFORM_V2"
  updatedAt:   string;
}

// ─── Block / Freeze ───────────────────────────────────────────────────────────

export interface CbsBlockPayload {
  customerId: string;
  reason:     string;
  blockedBy:  string;
  reference?: string;  // référence dossier ou cas
}

export interface CbsBlockResult {
  success:    boolean;
  reference:  string;
  frozenAt:   string;
}

// ─── Alert push ───────────────────────────────────────────────────────────────

export interface CbsAlertPayload {
  customerId:    string;
  alertType:     string;
  severity:      "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description:   string;
  linkedTransactions?: string[];
  reportedAt:    string;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class CbsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly rawResponse?: unknown,
  ) {
    super(message);
    this.name = "CbsApiError";
  }
}

export class CbsTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`CBS request timed out after ${timeoutMs}ms`);
    this.name = "CbsTimeoutError";
  }
}
