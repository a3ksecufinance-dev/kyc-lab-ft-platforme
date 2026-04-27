-- Migration 0008 — Suivi dépôt ANRF sur les rapports STR/SAR
-- Ajoute le suivi du cycle de vie réglementaire post-transmission

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS anrf_deposit_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS anrf_reference    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS anrf_status       VARCHAR(20);
