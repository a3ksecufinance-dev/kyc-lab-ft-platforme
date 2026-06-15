/**
 * Service Configuration système — Phase D
 *
 * Configuration dynamique stockée en BDD (system_config).
 * Les valeurs sont organisées par catégorie :
 *   - aml        : seuils AML (transaction unique, structuring, fenêtre)
 *   - screening  : seuils matching, auto-update, stale threshold
 *   - wallet     : limites par tier BAM (ALLEGED, STANDARD, RENFORCE)
 *   - sla        : délais SLA alertes/dossiers
 *   - institution: nom, type, paramètres généraux
 *
 * Chaque entrée a une clé unique, une catégorie, un label humain et une description.
 * Les valeurs sont JSON (number, string, boolean, object).
 */

import { eq } from "drizzle-orm";
import { db } from "../../_core/db";
import { systemConfig } from "../../../drizzle/schema";
import { createLogger } from "../../_core/logger";

const log = createLogger("config");

// ─── Valeurs par défaut (seed) ───────────────────────────────────────────────

const DEFAULT_CONFIG = [
  // AML
  { key: "aml.threshold_single_tx", value: 10000, category: "aml", label: "Seuil transaction unique (MAD)", description: "Montant au-dessus duquel une transaction déclenche un STR automatique" },
  { key: "aml.threshold_structuring", value: 3000, category: "aml", label: "Seuil structuring (MAD)", description: "Montant en dessous duquel le fractionnement est détecté" },
  { key: "aml.structuring_window_hours", value: 24, category: "aml", label: "Fenêtre structuring (heures)", description: "Fenêtre temporelle pour la détection de structuring" },
  { key: "aml.frequency_threshold", value: 10, category: "aml", label: "Seuil fréquence transactions", description: "Nombre max de transactions par fenêtre avant alerte" },
  { key: "aml.volume_variation_threshold", value: 300, category: "aml", label: "Seuil variation volume (%)", description: "Variation de volume en % déclenchant une alerte" },

  // Screening
  { key: "screening.match_threshold", value: 80, category: "screening", label: "Seuil match sanctions (%)", description: "Score minimum pour considérer un MATCH confirmé" },
  { key: "screening.review_threshold", value: 50, category: "screening", label: "Seuil review sanctions (%)", description: "Score minimum pour déclencher une revue manuelle" },
  { key: "screening.stale_threshold_hours", value: 36, category: "screening", label: "Alerte liste périmée (heures)", description: "Durée max sans mise à jour avant alerte stale" },

  // Wallet tier limits
  { key: "wallet.tier_alleged_daily", value: 5000, category: "wallet", label: "Plafond journalier ALLÉGÉ (MAD)", description: "Limite quotidienne pour les wallets KYC allégé" },
  { key: "wallet.tier_alleged_monthly", value: 20000, category: "wallet", label: "Plafond mensuel ALLÉGÉ (MAD)", description: "Limite mensuelle pour les wallets KYC allégé" },
  { key: "wallet.tier_standard_daily", value: 50000, category: "wallet", label: "Plafond journalier STANDARD (MAD)", description: "Limite quotidienne pour les wallets KYC standard" },
  { key: "wallet.tier_standard_monthly", value: 200000, category: "wallet", label: "Plafond mensuel STANDARD (MAD)", description: "Limite mensuelle pour les wallets KYC standard" },
  { key: "wallet.tier_renforce_daily", value: 500000, category: "wallet", label: "Plafond journalier RENFORCÉ (MAD)", description: "Limite quotidienne pour les wallets KYC renforcé" },
  { key: "wallet.tier_renforce_monthly", value: 2000000, category: "wallet", label: "Plafond mensuel RENFORCÉ (MAD)", description: "Limite mensuelle pour les wallets KYC renforcé" },

  // SLA
  { key: "sla.alert_low_hours", value: 72, category: "sla", label: "SLA alerte LOW (heures)", description: "Délai max de traitement pour les alertes de priorité LOW" },
  { key: "sla.alert_medium_hours", value: 24, category: "sla", label: "SLA alerte MEDIUM (heures)", description: "Délai max de traitement pour les alertes de priorité MEDIUM" },
  { key: "sla.alert_high_hours", value: 4, category: "sla", label: "SLA alerte HIGH (heures)", description: "Délai max de traitement pour les alertes de priorité HIGH" },
  { key: "sla.alert_critical_hours", value: 2, category: "sla", label: "SLA alerte CRITICAL (heures)", description: "Délai max de traitement pour les alertes de priorité CRITICAL" },
  { key: "sla.case_default_days", value: 30, category: "sla", label: "SLA dossier standard (jours)", description: "Délai max de clôture pour les dossiers standard" },
  { key: "sla.case_critical_days", value: 15, category: "sla", label: "SLA dossier CRITICAL (jours)", description: "Délai max de clôture pour les dossiers HIGH/CRITICAL" },

  // Institution
  { key: "institution.name", value: "Établissement Financier", category: "institution", label: "Nom de l'institution", description: "Nom affiché dans l'interface et les rapports" },
  { key: "institution.country", value: "MA", category: "institution", label: "Pays (ISO 3166)", description: "Code pays de l'institution" },
  { key: "institution.currency", value: "MAD", category: "institution", label: "Devise principale", description: "Devise par défaut pour les transactions et plafonds" },
  { key: "institution.kyc_review_months", value: 12, category: "institution", label: "Périodicité revue KYC (mois)", description: "Fréquence de révision obligatoire des dossiers KYC" },
] as const;

// ─── Seed ────────────────────────────────────────────────────────────────────

export async function seedDefaultConfig(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const cfg of DEFAULT_CONFIG) {
    const existing = await db
      .select({ id: systemConfig.id })
      .from(systemConfig)
      .where(eq(systemConfig.key, cfg.key))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(systemConfig).values({
        key:         cfg.key,
        value:       cfg.value,
        category:    cfg.category,
        label:       cfg.label,
        description: cfg.description,
      });
      inserted++;
    } else {
      skipped++;
    }
  }

  if (inserted > 0) log.info({ inserted, skipped }, "Configuration système initialisée");
  return { inserted, skipped };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function getAllConfig() {
  return db.select().from(systemConfig).orderBy(systemConfig.category, systemConfig.key);
}

export async function getConfigByCategory(category: string) {
  return db.select().from(systemConfig).where(eq(systemConfig.category, category));
}

export async function getConfigValue(key: string): Promise<unknown | null> {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
  return row?.value ?? null;
}

export async function updateConfigValue(
  key: string,
  value: unknown,
  userId: number,
): Promise<{ success: boolean }> {
  const result = await db
    .update(systemConfig)
    .set({ value: value as never, updatedBy: userId, updatedAt: new Date() })
    .where(eq(systemConfig.key, key));

  if ((result.rowCount ?? 0) === 0) {
    return { success: false };
  }

  log.info({ key, userId }, "Configuration mise à jour");
  return { success: true };
}

export async function getCategories(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: systemConfig.category })
    .from(systemConfig)
    .orderBy(systemConfig.category);
  return rows.map(r => r.category);
}
