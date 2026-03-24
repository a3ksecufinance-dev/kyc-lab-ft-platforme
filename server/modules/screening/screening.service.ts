import { TRPCError } from "@trpc/server";
import { ENV } from "../../_core/env";
import { createLogger } from "../../_core/logger";
import { matchAgainstMultipleLists, type SanctionEntity } from "./screening.matcher";
import { loadAllSanctionLists } from "./screening.lists";
import {
  insertScreeningResult,
  findScreeningByCustomer,
  findScreeningById,
  updateScreeningDecision,
  getPendingScreenings,
} from "./screening.repository";
import { updateCustomer } from "../customers/customers.repository";

const log = createLogger("screening");

// ─── Chargement des listes (avec cache Redis) ─────────────────────────────────

export async function getSanctionLists(): Promise<SanctionEntity[]> {
  const { entities } = await loadAllSanctionLists(false);
  return entities;
}

// ─── Service de screening ─────────────────────────────────────────────────────

export async function screenCustomer(
  customerId:   number,
  customerName: string,
): Promise<{
  sanctionsResult: Awaited<ReturnType<typeof insertScreeningResult>>;
  status:          "CLEAR" | "MATCH" | "REVIEW";
}> {
  const entities        = await getSanctionLists();
  const matchThreshold  = ENV.SCREENING_MATCH_THRESHOLD;
  const reviewThreshold = ENV.SCREENING_REVIEW_THRESHOLD;

  // Matching multi-listes avec NLP amélioré
  const { bestMatch, bySource, totalChecked } = matchAgainstMultipleLists(
    customerName, entities, reviewThreshold
  );

  const status: "CLEAR" | "MATCH" | "REVIEW" =
    bestMatch.score >= matchThreshold  ? "MATCH"
    : bestMatch.score >= reviewThreshold ? "REVIEW"
    : "CLEAR";

  const sanctionsResult = await insertScreeningResult({
    customerId,
    screeningType:   "SANCTIONS",
    status,
    matchScore:      bestMatch.score,
    matchedEntity:   bestMatch.matchedEntity ?? null,
    listSource:      bestMatch.listSource ?? null,
    confidenceScore: bestMatch.score,
    details: {
      matchedAlias:  bestMatch.matchedAlias,
      matchMethod:   bestMatch.matchMethod,
      entityId:      bestMatch.entityId,
      bySource,
      totalChecked,
      thresholds: { match: matchThreshold, review: reviewThreshold },
    } as unknown as null,
    decision: "PENDING",
  });

  // Mettre à jour le sanctionStatus du customer
  await updateCustomer(customerId, {
    sanctionStatus: status === "MATCH" || status === "REVIEW" ? status : "CLEAR",
  });

  log.info(
    {
      customerId, status,
      score:       bestMatch.score,
      matched:     bestMatch.matchedEntity,
      listSource:  bestMatch.listSource,
      method:      bestMatch.matchMethod,
      totalLists:  Object.keys(bySource).length,
    },
    "Screening sanctions terminé"
  );

  return { sanctionsResult, status };
}

export async function reviewScreeningResult(
  id:         number,
  decision:   "CONFIRMED" | "DISMISSED" | "ESCALATED",
  reviewedBy: number,
  reason:     string,
) {
  const existing = await findScreeningById(id);
  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Résultat screening #${id} introuvable` });
  }
  if (existing.decision !== "PENDING") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ce résultat a déjà été examiné" });
  }
  return updateScreeningDecision(id, decision, reviewedBy, reason);
}

export const getCustomerScreenings = (customerId: number) =>
  findScreeningByCustomer(customerId);

export { getPendingScreenings };

