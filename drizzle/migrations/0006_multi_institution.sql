-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0006 — Multi-Institution Support
-- Banque Classique / Microfinance / Établissement de Paiement avec Wallets
--
-- RÈGLE D'OR : PUREMENT ADDITIF — aucun DROP, aucun ALTER NOT NULL
--              sur des colonnes existantes, aucune modification de type.
--
-- Les tables existantes ne sont pas modifiées (sauf ADD COLUMN nullable).
-- Les valeurs d'enum sont ajoutées avec IF NOT EXISTS → idempotent.
-- Les nouvelles colonnes sur `transactions` sont nullable → pas d'impact
-- sur les INSERT existants.
-- ─────────────────────────────────────────────────────────────────────────────

--> statement-breakpoint

-- ─── Section 1 : Nouveaux types d'enum ───────────────────────────────────────
-- transaction_type : types spécifiques mobile money / agent
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'AGENT_CASH_IN';
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'AGENT_CASH_OUT';
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'MOBILE_MONEY_IN';
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'MOBILE_MONEY_OUT';
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'P2P_TRANSFER';
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'MERCHANT_PAYMENT';
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'BILL_PAYMENT';
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'BULK_DISBURSEMENT';

-- channel : canaux mobile money et agent
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'AGENT';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'USSD';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'ORANGE_MONEY';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'WAVE';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'CIH_MOBILE';

-- alert_type : types d'alertes wallet
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'P2P_VELOCITY';
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'AGENT_MULE';
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'SMALL_ACCUMULATION';
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'MERCHANT_BYPASS';
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'DORMANT_REACTIVATION';

-- report_type : rapports réglementaires BAM établissement de paiement
ALTER TYPE "report_type" ADD VALUE IF NOT EXISTS 'BAM_MONTHLY';
ALTER TYPE "report_type" ADD VALUE IF NOT EXISTS 'BAM_QUARTERLY';
ALTER TYPE "report_type" ADD VALUE IF NOT EXISTS 'BAM_ANNUAL';

-- customer_type : types client spécifiques
ALTER TYPE "customer_type" ADD VALUE IF NOT EXISTS 'AGENT';
ALTER TYPE "customer_type" ADD VALUE IF NOT EXISTS 'MERCHANT';

--> statement-breakpoint

-- ─── Section 2 : Table wallets ────────────────────────────────────────────────
-- Un wallet par client (peut en avoir plusieurs : un par provider).
-- kyc_tier en VARCHAR (pas enum PG) pour éviter les migrations futures.

CREATE TABLE IF NOT EXISTS "wallets" (
  "id"                SERIAL PRIMARY KEY,
  "wallet_id"         VARCHAR(50)       NOT NULL UNIQUE,
  "customer_id"       INTEGER           NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,

  -- Provider mobile money ou interne
  "provider"          VARCHAR(50)       NOT NULL DEFAULT 'INTERNAL',
  -- Ex: 'ORANGE_MONEY' | 'WAVE' | 'CIH_MOBILE' | 'INTERNAL'

  "phone_number"      VARCHAR(30),
  "msisdn"            VARCHAR(30),           -- format international E.164

  -- Solde et monnaie
  "balance"           NUMERIC(15, 2)    NOT NULL DEFAULT 0,
  "currency"          VARCHAR(10)       NOT NULL DEFAULT 'MAD',

  -- Tier KYC associé au wallet (ALLEGED | STANDARD | RENFORCE)
  "kyc_tier"          VARCHAR(20)       NOT NULL DEFAULT 'ALLEGED',

  -- Plafonds réglementaires par tier (MAD)
  "daily_limit"       NUMERIC(15, 2),
  "monthly_limit"     NUMERIC(15, 2),

  -- Statut
  "is_active"         BOOLEAN           NOT NULL DEFAULT TRUE,
  "is_dormant"        BOOLEAN           NOT NULL DEFAULT FALSE,
  "last_activity_at"  TIMESTAMP,
  "dormant_since"     TIMESTAMP,
  "reactivated_at"    TIMESTAMP,

  "created_at"        TIMESTAMP         NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMP         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "wallets_customer_idx"  ON "wallets" ("customer_id");
CREATE INDEX IF NOT EXISTS "wallets_provider_idx"  ON "wallets" ("provider");
CREATE INDEX IF NOT EXISTS "wallets_tier_idx"      ON "wallets" ("kyc_tier");
CREATE INDEX IF NOT EXISTS "wallets_dormant_idx"   ON "wallets" ("is_dormant")
  WHERE "is_dormant" = TRUE;

--> statement-breakpoint

-- ─── Section 3 : Table agent_accounts ────────────────────────────────────────
-- Réseau d'agents (personnes physiques ou points de vente) effectuant
-- des opérations de cash-in/cash-out pour le compte de l'établissement.

CREATE TABLE IF NOT EXISTS "agent_accounts" (
  "id"                SERIAL PRIMARY KEY,
  "agent_id"          VARCHAR(50)       NOT NULL UNIQUE,
  "user_id"           INTEGER           REFERENCES "users"("id") ON DELETE SET NULL,
  -- user lié si l'agent a un accès back-office

  "name"              VARCHAR(200)      NOT NULL,
  "phone"             VARCHAR(30),
  "region"            VARCHAR(100),
  "city"              VARCHAR(100),
  "license_number"    VARCHAR(100),

  -- Float de l'agent (liquidités confiées par l'établissement)
  "float_balance"     NUMERIC(15, 2)    NOT NULL DEFAULT 0,
  "currency"          VARCHAR(10)       NOT NULL DEFAULT 'MAD',

  -- Compteurs journaliers (remis à zéro à minuit)
  "daily_tx_count"    INTEGER           NOT NULL DEFAULT 0,
  "daily_tx_volume"   NUMERIC(15, 2)    NOT NULL DEFAULT 0,

  "is_active"         BOOLEAN           NOT NULL DEFAULT TRUE,
  "last_activity_at"  TIMESTAMP,

  -- Évaluation risque agent
  "risk_score"        INTEGER           NOT NULL DEFAULT 0,  -- 0-100
  "risk_flags"        JSONB,            -- codes de risques déclenchés

  "created_at"        TIMESTAMP         NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMP         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "agent_accounts_user_idx"    ON "agent_accounts" ("user_id");
CREATE INDEX IF NOT EXISTS "agent_accounts_region_idx"  ON "agent_accounts" ("region");
CREATE INDEX IF NOT EXISTS "agent_accounts_risk_idx"    ON "agent_accounts" ("risk_score");
CREATE INDEX IF NOT EXISTS "agent_accounts_active_idx"  ON "agent_accounts" ("is_active")
  WHERE "is_active" = TRUE;

--> statement-breakpoint

-- ─── Section 4 : Table kyc_tier_snapshots ────────────────────────────────────
-- Historique des changements de tier KYC (auditabilité réglementaire).

CREATE TABLE IF NOT EXISTS "kyc_tier_snapshots" (
  "id"              SERIAL PRIMARY KEY,
  "customer_id"     INTEGER           NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "wallet_id"       INTEGER           REFERENCES "wallets"("id") ON DELETE SET NULL,
  "previous_tier"   VARCHAR(20),
  "new_tier"        VARCHAR(20)       NOT NULL,
  "reason"          TEXT,
  "triggered_by"    INTEGER           REFERENCES "users"("id") ON DELETE SET NULL,
  "auto_triggered"  BOOLEAN           NOT NULL DEFAULT FALSE,
  "created_at"      TIMESTAMP         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "kyc_tier_snaps_customer_idx" ON "kyc_tier_snapshots" ("customer_id");
CREATE INDEX IF NOT EXISTS "kyc_tier_snaps_wallet_idx"   ON "kyc_tier_snapshots" ("wallet_id");
CREATE INDEX IF NOT EXISTS "kyc_tier_snaps_date_idx"     ON "kyc_tier_snapshots" ("created_at");

--> statement-breakpoint

-- ─── Section 5 : Colonnes additives sur transactions ─────────────────────────
-- Nullable → tous les INSERT existants continuent de fonctionner sans changement.

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "wallet_id"    INTEGER REFERENCES "wallets"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "agent_id"     INTEGER REFERENCES "agent_accounts"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "ussd_session" VARCHAR(100);

CREATE INDEX IF NOT EXISTS "transactions_wallet_idx"
  ON "transactions" ("wallet_id") WHERE "wallet_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "transactions_agent_idx"
  ON "transactions" ("agent_id")  WHERE "agent_id"  IS NOT NULL;

--> statement-breakpoint

-- ─── Section 6 : Vue utilitaire (lecture seule) ───────────────────────────────
-- Facilite les requêtes de reporting BAM sans JOIN complexes.

CREATE OR REPLACE VIEW "v_wallet_activity" AS
SELECT
  w.id                AS wallet_id,
  w.wallet_id         AS wallet_ref,
  w.customer_id,
  w.provider,
  w.kyc_tier,
  w.balance,
  w.currency,
  w.is_dormant,
  COUNT(t.id)         AS tx_count_30d,
  COALESCE(SUM(t.amount::NUMERIC), 0) AS tx_volume_30d
FROM "wallets" w
LEFT JOIN "transactions" t
  ON t.wallet_id = w.id
  AND t.transaction_date >= NOW() - INTERVAL '30 days'
GROUP BY
  w.id, w.wallet_id, w.customer_id, w.provider,
  w.kyc_tier, w.balance, w.currency, w.is_dormant;
