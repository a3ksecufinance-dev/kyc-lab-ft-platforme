/**
 * ML Explainability Service — XAI (Explainable AI)
 *
 * Produit des explications SHAP-like pour les scores de risque ML :
 *   - Contribution de chaque feature au score final
 *   - Facteurs positifs (qui augmentent le risque)
 *   - Facteurs atténuants (qui réduisent le risque)
 *   - Verdict lisible par un analyste compliance
 *
 * Deux modes :
 *   1. Appel au microservice ML Python (/explain) si disponible
 *   2. Calcul heuristique local (fallback) sans ML service
 *
 * Usage réglementaire : AMLD6 Art.8 — obligation de traçabilité des décisions
 * automatisées (droit à l'explication — RGPD Art.22 / Loi 09-08 Maroc Art.7)
 */

import { eq }              from "drizzle-orm";
import { db }              from "../../_core/db";
import { createLogger }    from "../../_core/logger";
import { ENV }             from "../../_core/env";
import { transactions, customers } from "../../../drizzle/schema";

const log = createLogger("ml-explain");

const ML_SERVICE_URL = ENV.ML_SERVICE_URL;
const ML_API_KEY     = ENV.ML_INTERNAL_API_KEY;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureContribution {
  feature:      string;    // Nom technique de la feature
  label:        string;    // Label lisible analyste
  value:        number | string | null;  // Valeur brute
  contribution: number;    // Contribution au score (-100 à +100)
  direction:    "RISK" | "SAFE" | "NEUTRAL";
  explanation:  string;    // Explication en français
}

export interface MlExplanation {
  transactionId:   string;
  customerId:      number;
  mlScore:         number;
  riskLevel:       "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  features:        FeatureContribution[];
  topRiskFactors:  FeatureContribution[];   // Top 3 facteurs de risque
  topSafeFactors:  FeatureContribution[];   // Top 3 facteurs atténuants
  narrative:       string;    // Explication narrative en français
  modelVersion:    string;
  explainedAt:     string;    // ISO 8601
  source:          "ML_SERVICE" | "LOCAL_HEURISTIC";
}

// ─── Appel au microservice ML ─────────────────────────────────────────────────

async function callMlExplain(
  txId: string,
  customerId: number,
): Promise<MlExplanation | null> {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/explain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key":    ML_API_KEY,
      },
      body:   JSON.stringify({ transaction_id: txId, customer_id: customerId }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      features:      Array<{ name: string; value: number; shap_value: number }>;
      base_score:    number;
      final_score:   number;
      model_version: string;
    };

    const features: FeatureContribution[] = data.features.map(f => ({
      feature:      f.name,
      label:        featureLabel(f.name),
      value:        f.value,
      contribution: Math.round(f.shap_value * 100),
      direction:    f.shap_value > 0.05 ? "RISK" : f.shap_value < -0.05 ? "SAFE" : "NEUTRAL",
      explanation:  featureExplanation(f.name, f.value, f.shap_value),
    }));

    return {
      transactionId:  txId,
      customerId,
      mlScore:        Math.round(data.final_score * 100),
      riskLevel:      scoreToLevel(data.final_score * 100),
      features,
      topRiskFactors: features.filter(f => f.direction === "RISK").slice(0, 3),
      topSafeFactors: features.filter(f => f.direction === "SAFE").slice(0, 3),
      narrative:      buildNarrative(features, data.final_score * 100),
      modelVersion:   data.model_version,
      explainedAt:    new Date().toISOString(),
      source:         "ML_SERVICE",
    };
  } catch {
    return null;
  }
}

// ─── Fallback heuristique local ───────────────────────────────────────────────

function computeLocalExplanation(
  tx: { transactionId: string; customerId: number; amount: string | number; currency: string | null;
        transactionType: string | null; counterpartyCountry: string | null; isSuspicious: boolean | null;
        riskScore: number | null },
  customer: { riskScore: number | null; riskLevel: string | null; kycStatus: string; pepStatus: boolean;
              sanctionStatus: string; monthlyIncome: string | number | null },
): MlExplanation {
  const features: FeatureContribution[] = [];
  const amount = Number(tx.amount);
  const income = customer.monthlyIncome ? Number(customer.monthlyIncome) : null;

  // Feature 1 : Montant
  const amountRatio = income ? amount / income : null;
  const amountContrib = amountRatio
    ? Math.min(Math.round(amountRatio * 30), 40)
    : (amount > 50000 ? 25 : amount > 10000 ? 10 : 0);
  features.push({
    feature:      "amount",
    label:        "Montant de la transaction",
    value:        amount,
    contribution: amountContrib,
    direction:    amountContrib > 10 ? "RISK" : "NEUTRAL",
    explanation:  amountRatio && amountRatio > 2
      ? `Montant ${(amountRatio).toFixed(1)}x le revenu mensuel déclaré — significatif`
      : amount > 50000 ? "Montant élevé (> 50 000 MAD)"
      : "Montant dans la norme",
  });

  // Feature 2 : Statut PEP
  features.push({
    feature:      "pep_status",
    label:        "Statut PEP (Personne Politiquement Exposée)",
    value:        customer.pepStatus ? 1 : 0,
    contribution: customer.pepStatus ? 35 : 0,
    direction:    customer.pepStatus ? "RISK" : "NEUTRAL",
    explanation:  customer.pepStatus
      ? "Client identifié comme PEP — surveillance renforcée obligatoire"
      : "Pas de statut PEP",
  });

  // Feature 3 : Pays contrepartie
  const highRiskCountries = ["IR", "KP", "SY", "YE", "LY", "SO", "SD", "MM", "RU", "BY"];
  const isHighRisk = tx.counterpartyCountry && highRiskCountries.includes(tx.counterpartyCountry);
  features.push({
    feature:      "counterparty_country",
    label:        "Pays de la contrepartie",
    value:        tx.counterpartyCountry ?? "N/A",
    contribution: isHighRisk ? 30 : 0,
    direction:    isHighRisk ? "RISK" : "NEUTRAL",
    explanation:  isHighRisk
      ? `Pays ${tx.counterpartyCountry} sous surveillance GAFI / liste noire`
      : "Pays de la contrepartie sans risque particulier",
  });

  // Feature 4 : Niveau de risque client
  const customerRiskContrib = customer.riskLevel === "CRITICAL" ? 25
    : customer.riskLevel === "HIGH" ? 15
    : customer.riskLevel === "MEDIUM" ? 5 : 0;
  features.push({
    feature:      "customer_risk_level",
    label:        "Niveau de risque client",
    value:        customer.riskLevel ?? "N/A",
    contribution: customerRiskContrib,
    direction:    customerRiskContrib > 0 ? "RISK" : "NEUTRAL",
    explanation:  `Profil de risque client : ${customer.riskLevel ?? "inconnu"}`,
  });

  // Feature 5 : Statut KYC
  const kycContrib = customer.kycStatus === "REJECTED" ? 20
    : customer.kycStatus === "PENDING" ? 10 : -5;
  features.push({
    feature:      "kyc_status",
    label:        "Statut KYC",
    value:        customer.kycStatus,
    contribution: kycContrib,
    direction:    kycContrib > 0 ? "RISK" : kycContrib < 0 ? "SAFE" : "NEUTRAL",
    explanation:  customer.kycStatus === "APPROVED"
      ? "KYC vérifié et approuvé — facteur atténuant"
      : customer.kycStatus === "PENDING" ? "KYC en attente de validation"
      : "KYC rejeté — signal d'alerte",
  });

  // Feature 6 : Statut sanctions
  const sanctionContrib = customer.sanctionStatus === "HIT" ? 50
    : customer.sanctionStatus === "REVIEW" ? 20 : 0;
  features.push({
    feature:      "sanction_status",
    label:        "Statut screening sanctions",
    value:        customer.sanctionStatus,
    contribution: sanctionContrib,
    direction:    sanctionContrib > 0 ? "RISK" : "NEUTRAL",
    explanation:  customer.sanctionStatus === "CLEAR"
      ? "Aucun hit sanctions détecté"
      : customer.sanctionStatus === "HIT" ? "HIT sanctions confirmé — blocage requis"
      : "Screening en cours de révision",
  });

  // Feature 7 : Type de transaction
  const highRiskTypes = ["CRYPTO_EXCHANGE", "WIRE_TRANSFER", "CASH_DEPOSIT", "AGENT_CASH_IN"];
  const txTypeContrib = highRiskTypes.includes(tx.transactionType ?? "") ? 15 : 0;
  features.push({
    feature:      "transaction_type",
    label:        "Type de transaction",
    value:        tx.transactionType ?? "N/A",
    contribution: txTypeContrib,
    direction:    txTypeContrib > 0 ? "RISK" : "NEUTRAL",
    explanation:  txTypeContrib > 0
      ? `${tx.transactionType} : type à risque élevé selon les typologies GAFI`
      : "Type de transaction standard",
  });

  const totalScore = tx.riskScore ?? Math.min(
    features.reduce((s, f) => s + f.contribution, 0), 100
  );

  return {
    transactionId:  tx.transactionId,
    customerId:     tx.customerId,
    mlScore:        totalScore,
    riskLevel:      scoreToLevel(totalScore),
    features:       features.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    topRiskFactors: features.filter(f => f.direction === "RISK").sort((a, b) => b.contribution - a.contribution).slice(0, 3),
    topSafeFactors: features.filter(f => f.direction === "SAFE").sort((a, b) => a.contribution - b.contribution).slice(0, 3),
    narrative:      buildNarrative(features, totalScore),
    modelVersion:   "heuristic-v1",
    explainedAt:    new Date().toISOString(),
    source:         "LOCAL_HEURISTIC",
  };
}

// ─── Entrée principale ────────────────────────────────────────────────────────

export async function explainTransaction(transactionDbId: number): Promise<MlExplanation | null> {
  const [tx] = await db.select({
    id:                 transactions.id,
    transactionId:      transactions.transactionId,
    customerId:         transactions.customerId,
    amount:             transactions.amount,
    currency:           transactions.currency,
    transactionType:    transactions.transactionType,
    counterpartyCountry: transactions.counterpartyCountry,
    isSuspicious:       transactions.isSuspicious,
    riskScore:          transactions.riskScore,
  }).from(transactions).where(eq(transactions.id, transactionDbId)).limit(1);
  if (!tx) return null;

  const [customer] = await db.select().from(customers).where(eq(customers.id, tx.customerId)).limit(1);
  if (!customer) return null;

  // Tentative via microservice ML
  const mlResult = await callMlExplain(tx.transactionId, tx.customerId);
  if (mlResult) {
    log.info({ txId: tx.transactionId, source: "ML_SERVICE" }, "Explication ML reçue");
    return mlResult;
  }

  // Fallback heuristique local
  log.debug({ txId: tx.transactionId }, "ML service indisponible — heuristique locale");
  return computeLocalExplanation({ ...tx, riskScore: tx.riskScore }, customer);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreToLevel(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function featureLabel(name: string): string {
  const labels: Record<string, string> = {
    amount:               "Montant",
    pep_status:           "Statut PEP",
    customer_risk_score:  "Score de risque client",
    customer_risk_level:  "Niveau de risque",
    kyc_status:           "Statut KYC",
    sanction_status:      "Sanctions",
    counterparty_country: "Pays contrepartie",
    transaction_type:     "Type de transaction",
    monthly_income:       "Revenu mensuel",
    channel:              "Canal de paiement",
  };
  return labels[name] ?? name;
}

function featureExplanation(name: string, value: number, shap: number): string {
  if (shap > 0.2) return `${featureLabel(name)} (${value}) contribue fortement au risque`;
  if (shap > 0.05) return `${featureLabel(name)} (${value}) augmente légèrement le risque`;
  if (shap < -0.1) return `${featureLabel(name)} (${value}) réduit significativement le risque`;
  return `${featureLabel(name)} (${value}) — impact neutre`;
}

function buildNarrative(features: FeatureContribution[], score: number): string {
  const level = scoreToLevel(score);
  const risks = features.filter(f => f.direction === "RISK" && f.contribution > 10);
  const safes = features.filter(f => f.direction === "SAFE");

  const levelLabel = { LOW: "faible", MEDIUM: "modéré", HIGH: "élevé", CRITICAL: "critique" }[level];

  let text = `Score de risque ${levelLabel} (${Math.round(score)}/100). `;

  if (risks.length > 0) {
    text += `Principaux facteurs de risque : ${risks.slice(0, 2).map(f => f.label).join(", ")}. `;
  }
  if (safes.length > 0) {
    text += `Facteurs atténuants : ${safes.slice(0, 2).map(f => f.label).join(", ")}. `;
  }
  if (level === "HIGH" || level === "CRITICAL") {
    text += "Revue manuelle recommandée.";
  }

  return text;
}
