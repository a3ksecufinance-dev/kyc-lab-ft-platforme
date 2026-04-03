-- Migration 0004 : Sécurité & Conformité RGPD
-- Points couverts :
--   1. Agrandissement colonnes PII pour chiffrement AES-256-GCM (base64url)
--   2. Gel des avoirs (asset freeze) sur les clients
--   3. Droit à l'effacement RGPD (erasure request / completion)
--   4. Profils de juridictions AML

-- ─── 1. Agrandissement colonnes PII ──────────────────────────────────────────
ALTER TABLE customers
  ALTER COLUMN first_name TYPE text,
  ALTER COLUMN last_name  TYPE text,
  ALTER COLUMN email      TYPE text,
  ALTER COLUMN phone      TYPE text,
  ALTER COLUMN date_of_birth TYPE text;

-- ─── 2. Gel des avoirs ────────────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS frozen_at     TIMESTAMP,
  ADD COLUMN IF NOT EXISTS frozen_reason TEXT,
  ADD COLUMN IF NOT EXISTS frozen_by     INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customers_frozen_idx ON customers (frozen_at) WHERE frozen_at IS NOT NULL;

-- ─── 3. Droit à l'effacement RGPD ────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS erasure_requested_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS erasure_completed_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS erasure_requested_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS erasure_completed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ─── 4. Profils de juridictions AML ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jurisdiction_profiles (
  id                     SERIAL PRIMARY KEY,
  jurisdiction_code      VARCHAR(10)  NOT NULL UNIQUE,  -- ex: FR, MA, UK, US, EU
  jurisdiction_name      VARCHAR(200) NOT NULL,
  is_active              BOOLEAN      NOT NULL DEFAULT true,

  -- Seuils réglementaires (NULL = utiliser valeur globale)
  threshold_single_tx    NUMERIC(15,2),          -- Seuil transaction unique
  threshold_structuring  NUMERIC(15,2),          -- Seuil structuring
  structuring_window_h   INTEGER,                -- Fenêtre temporelle (heures)
  frequency_threshold    INTEGER,                -- Nb transactions / fenêtre
  cash_threshold         NUMERIC(15,2),          -- Seuil espèces déclaratoire
  currency_code          VARCHAR(10)  NOT NULL DEFAULT 'EUR',

  -- Obligations réglementaires
  str_mandatory_above    NUMERIC(15,2),          -- STR obligatoire au-dessus de
  str_delay_hours        INTEGER      DEFAULT 24, -- Délai légal déclaration STR
  sar_delay_hours        INTEGER      DEFAULT 72,
  enhanced_dd_pep        BOOLEAN      DEFAULT true,
  enhanced_dd_high_risk  BOOLEAN      DEFAULT true,

  -- Régulateur
  regulator_name         VARCHAR(200),           -- ex: TRACFIN, UTRF, FinCEN
  regulator_code         VARCHAR(50),            -- ex: TRACFIN, UTRF
  goaml_entity_type      VARCHAR(50),            -- Type entité GoAML local
  reporting_format       VARCHAR(50)  DEFAULT 'GOAML_2',  -- GOAML_2, FinCEN_CTR, etc.

  -- Pays couverts par ce profil (array JSON)
  covered_countries      JSONB        DEFAULT '[]',

  created_by             INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  updated_by             INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Profils par défaut
INSERT INTO jurisdiction_profiles
  (jurisdiction_code, jurisdiction_name, threshold_single_tx, threshold_structuring,
   structuring_window_h, frequency_threshold, cash_threshold, currency_code,
   str_mandatory_above, str_delay_hours, sar_delay_hours,
   regulator_name, regulator_code, reporting_format, covered_countries)
VALUES
  ('FR', 'France',             10000, 3000, 24, 10, 10000, 'EUR', 10000, 24, 72,
   'TRACFIN', 'TRACFIN', 'GOAML_2', '["FR"]'),

  ('MA', 'Maroc',              100000, 30000, 24, 10, 100000, 'MAD', 100000, 24, 72,
   'Bank Al-Maghrib / UTRF', 'UTRF', 'GOAML_2', '["MA"]'),

  ('UK', 'Royaume-Uni',        10000, 3000, 24, 10, 10000, 'GBP', 10000, 24, 72,
   'National Crime Agency', 'NCA', 'SAR_UK', '["GB"]'),

  ('US', 'États-Unis',         10000, 3000, 24, 10, 10000, 'USD', 10000, 24, 72,
   'FinCEN', 'FINCEN', 'CTR_SAR', '["US"]'),

  ('EU', 'Union Européenne',   10000, 3000, 24, 10, 10000, 'EUR', 10000, 24, 72,
   'AMLA (2025)', 'AMLA', 'GOAML_2', '["DE","IT","ES","NL","BE","AT","PT","PL","IE","SE","DK","FI","GR","CZ","HU","RO","BG","HR","SK","SI","LT","LV","EE","CY","LU","MT"]'),

  ('AE', 'Émirats Arabes Unis',55000, 15000, 24, 10, 55000, 'AED', 55000, 24, 48,
   'Central Bank UAE / AMLD', 'CBUAE', 'GOAML_2', '["AE"]'),

  ('SN', 'Sénégal (UEMOA)',    6000000, 1500000, 24, 10, 6000000, 'XOF', 6000000, 48, 72,
   'CENTIF', 'CENTIF', 'GOAML_2', '["SN","BJ","BF","GW","CI","ML","NE","TG"]')

ON CONFLICT (jurisdiction_code) DO NOTHING;
