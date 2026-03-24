import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import {
  findManyTransactions,
  findTransactionById,
  insertTransaction,
  updateTransaction,
  getTransactionStats,
  findAlertsByCustomer,
  type ListTransactionsInput,
} from "./transactions.repository";
import { runAmlRules } from "../aml/aml.engine";
import { runDynamicAmlRules } from "../aml/aml-rules.engine";
import { callMlScoring } from "../aml/ml-scoring.client";
import { findCustomerById } from "../customers/customers.repository";
import { createLogger } from "../../_core/logger";

const log = createLogger("transactions");
import type { Transaction } from "../../../drizzle/schema";

// ─── Screening asynchrone de la contrepartie ─────────────────────────────────

async function screenCounterpartyAsync(
  counterpartyName: string,
  customerId:       number,
  transactionId:    number,
): Promise<void> {
  try {
    const { matchAgainstMultipleLists }  = await import("../screening/screening.matcher");
    const { getSanctionLists }           = await import("../screening/screening.service");
    const { insertScreeningResult }      = await import("../screening/screening.repository");
    const { ENV }                        = await import("../../_core/env");

    const entities  = await getSanctionLists();
    const threshold = ENV.SCREENING_REVIEW_THRESHOLD;

    const { bestMatch } = matchAgainstMultipleLists(counterpartyName, entities, threshold);

    if (bestMatch.score >= threshold) {
      // Créer un résultat de screening rattaché au client de la transaction
      await insertScreeningResult({
        customerId,
        screeningType:   "SANCTIONS",
        status:          bestMatch.score >= ENV.SCREENING_MATCH_THRESHOLD ? "MATCH" : "REVIEW",
        matchScore:      bestMatch.score,
        matchedEntity:   bestMatch.matchedEntity ?? null,
        listSource:      `${bestMatch.listSource ?? "?"} (contrepartie)`,
        confidenceScore: bestMatch.score,
        details:         { counterparty: counterpartyName, transactionId } as unknown as null,
        decision:        "PENDING",
      });

      log.warn({
        counterparty: counterpartyName,
        score:        bestMatch.score,
        matched:      bestMatch.matchedEntity,
        transactionId,
      }, "Contrepartie correspondance sanctions");
    }
  } catch (err) {
    log.warn({ err, counterpartyName }, "Erreur screening contrepartie");
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateTransactionInput {
  customerId: number;
  amount: string;
  currency?: string | undefined;
  transactionType: Transaction["transactionType"];
  channel?: Transaction["channel"] | undefined;
  counterparty?: string | undefined;
  counterpartyCountry?: string | undefined;
  counterpartyBank?: string | undefined;
  purpose?: string | undefined;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function listTransactions(input: ListTransactionsInput) {
  return findManyTransactions(input);
}

export async function getTransactionOrThrow(id: number): Promise<Transaction> {
  const tx = await findTransactionById(id);
  if (!tx) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Transaction #${id} introuvable` });
  }
  return tx;
}

/**
 * Créer une transaction et déclencher immédiatement le moteur AML.
 * Les alertes sont créées dans la même requête si des règles sont déclenchées.
 */
export async function createTransaction(input: CreateTransactionInput) {
  // Vérifier que le customer existe et est approuvé
  const customer = await findCustomerById(input.customerId);
  if (!customer) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable" });
  }
  if (customer.kycStatus === "REJECTED") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Transaction refusée : client KYC rejeté",
    });
  }

  const transactionId = `TXN-${nanoid(10).toUpperCase()}`;

  // Insérer en statut PENDING avant analyse AML
  const tx = await insertTransaction({
    transactionId,
    customerId: input.customerId,
    amount: input.amount,
    currency: input.currency ?? "EUR",
    transactionType: input.transactionType,
    channel: input.channel ?? "ONLINE",
    counterparty: input.counterparty ?? null,
    counterpartyCountry: input.counterpartyCountry ?? null,
    counterpartyBank: input.counterpartyBank ?? null,
    purpose: input.purpose ?? null,
    riskScore: 0,
    status: "PENDING",
    isSuspicious: false,
  });

  // Déclencher le moteur AML de manière asynchrone
  // Ne bloque pas la réponse mais enregistre les alertes
  // Moteur AML dynamique (règles DB) — fire-and-forget
  // Fallback automatique sur le moteur statique si la table est vide
  runDynamicAmlRules(tx, customer).catch(() =>
    runAmlRules(tx, customer).catch(() => {
      // Les erreurs AML ne bloquent jamais la transaction
    })
  );

  // ML Scoring Python — fire-and-forget, timeout 3s
  // S'exécute en parallèle des règles AML, ne bloque pas
  callMlScoring(tx, customer).catch(() => {
    // Service ML indisponible → ignoré silencieusement
  });

  // Screening sanctions de la contrepartie — fire-and-forget
  if (input.counterparty) {
    void screenCounterpartyAsync(input.counterparty, input.customerId, tx.id);
  }

  return tx;
}

/**
 * Marquer une transaction comme complétée (après validation externe)
 */
export async function completeTransaction(id: number): Promise<Transaction> {
  const tx = await getTransactionOrThrow(id);

  if (tx.status === "BLOCKED") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Transaction bloquée — ne peut pas être complétée",
    });
  }

  return updateTransaction(id, { status: "COMPLETED" });
}

/**
 * Bloquer manuellement une transaction — supervisor+
 */
export async function blockTransaction(
  id: number,
  reason: string
): Promise<Transaction> {
  const tx = await getTransactionOrThrow(id);

  if (tx.status === "COMPLETED" || tx.status === "REVERSED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Transaction déjà ${tx.status} — ne peut pas être bloquée`,
    });
  }

  return updateTransaction(id, {
    status: "BLOCKED",
    isSuspicious: true,
    flagReason: reason,
  });
}

export { getTransactionStats, findAlertsByCustomer as getAlertsByCustomer };
