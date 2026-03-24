/**
 * Client HTTP vers le microservice ML Python.
 *
 * Appelé de façon asynchrone (fire-and-forget) après la création de transaction.
 * Un timeout court (3s) garantit que les erreurs du service ML
 * n'impactent jamais les transactions.
 */

import { ENV } from "../../_core/env";
import { createLogger } from "../../_core/logger";
import type { Transaction, Customer } from "../../../drizzle/schema";

const log = createLogger("ml-scoring-client");

const ML_SERVICE_URL = ENV.ML_SERVICE_URL;
const ML_API_KEY     = ENV.ML_INTERNAL_API_KEY;
const TIMEOUT_MS     = 3000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MlScoreResult {
  transactionId: string;
  mlScore: number;          // 0–100
  anomalyScore: number;     // score brut Isolation Forest
  xgbProba: number | null;  // probabilité XGBoost
  isAnomaly: boolean;
  modelVersion: string;
  explanation: string;
  scoredAt: string;
}

// ─── Client principal ─────────────────────────────────────────────────────────

export async function callMlScoring(
  tx: Transaction,
  customer: Customer,
): Promise<MlScoreResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = JSON.stringify({
      transaction_id:       tx.transactionId,
      customer_id:          tx.customerId,
      amount:               Number(tx.amount),
      currency:             tx.currency,
      transaction_type:     tx.transactionType,
      channel:              tx.channel,
      counterparty_country: tx.counterpartyCountry ?? null,
      transaction_date:     tx.transactionDate.toISOString(),
      // Customer
      customer_risk_score:  customer.riskScore,
      customer_risk_level:  customer.riskLevel,
      kyc_status:           customer.kycStatus,
      pep_status:           customer.pepStatus,
      sanction_status:      customer.sanctionStatus,
      monthly_income:       customer.monthlyIncome ? Number(customer.monthlyIncome) : null,
    });

    const response = await fetch(`${ML_SERVICE_URL}/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key":    ML_API_KEY,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      log.warn(
        { status: response.status, txId: tx.transactionId },
        "ML service erreur HTTP"
      );
      return null;
    }

    const result = await response.json() as MlScoreResult;

    log.info(
      {
        txId:        tx.transactionId,
        mlScore:     result.mlScore,
        isAnomaly:   result.isAnomaly,
        model:       result.modelVersion,
      },
      "Score ML reçu"
    );

    return result;

  } catch (err: unknown) {
    clearTimeout(timer);

    if (err instanceof Error && err.name === "AbortError") {
      log.warn({ txId: tx.transactionId }, `ML scoring timeout (${TIMEOUT_MS}ms) — ignoré`);
    } else {
      log.warn({ err, txId: tx.transactionId }, "ML scoring indisponible — ignoré");
    }
    return null;
  }
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function checkMlServiceHealth(): Promise<{
  available: boolean;
  modelReady: boolean;
  version: string | null;
}> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) return { available: false, modelReady: false, version: null };

    const data = await response.json() as {
      status: string;
      model_ready: boolean;
      model_version: string;
    };

    return {
      available:  data.status === "ok",
      modelReady: data.model_ready,
      version:    data.model_version ?? null,
    };
  } catch {
    return { available: false, modelReady: false, version: null };
  }
}
