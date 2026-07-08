import { TRPCError } from "@trpc/server";
import { ENV } from "../../_core/env";
import { createLogger } from "../../_core/logger";
import { matchAgainstMultipleLists, type SanctionEntity } from "./screening.matcher";
import { loadAllSanctionLists } from "./screening.lists";
import { searchAdverseMedia, type AdverseMediaReport } from "./adverse-media.service";
import {
  insertScreeningResult,
  findScreeningByCustomer,
  findScreeningById,
  updateScreeningDecision,
  getPendingScreenings,
} from "./screening.repository";
import { updateCustomer, requireCustomer } from "../customers/customers.repository";

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
  opts: { excludePep?: boolean } = { excludePep: true },
): Promise<{
  sanctionsResult: Awaited<ReturnType<typeof insertScreeningResult>>;
  status:          "CLEAR" | "MATCH" | "REVIEW";
  adverseMedia?:   AdverseMediaReport;
}> {
  await requireCustomer(customerId);

  const allEntities     = await getSanctionLists();
  // Par défaut : exclure les entités PEP du screening sanctions
  // (le check PEP est fait séparément dans le pipeline onboarding UC-3)
  const entities        = opts.excludePep !== false
    ? allEntities.filter(e => e.listSource !== "PEP")
    : allEntities;
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

  // ── Due diligence renforcée : adverse media si REVIEW/MATCH ────────────────
  //     BAM circulaire 5/W/2023 art. 15 — obligatoire pour PEP et HIGH_RISK.
  //     Le screening PEP est fait ailleurs, mais si un MATCH/REVIEW sanctions
  //     tombe on lance quand même adverse media (l'entité peut être PEP+sanct.)
  let adverseMedia: AdverseMediaReport | undefined;
  if (status !== "CLEAR") {
    try {
      adverseMedia = await searchAdverseMedia(customerName);
    } catch (err) {
      log.warn({ err, customerId }, "Adverse media échoué — poursuite");
    }
  }

  return { sanctionsResult, status, ...(adverseMedia ? { adverseMedia } : {}) };
}

// ─── Preview par nom (sans customer, sans persistance) ───────────────────────
//
// Utilisé après OCR pour donner à l'agent une vue immédiate de la
// correspondance PEP/sanctions dès qu'un nom + prénom sont extraits.
// PEP inclus ici (le check final /finalize reste séparé).
//
// N'écrit rien en base — c'est un aperçu.

export interface NameScreeningPreview {
  status:        "CLEAR" | "MATCH" | "REVIEW";
  matchScore:    number;
  matchedEntity: string | null;
  listSource:    string | null;
  matchMethod:   string | null;
  isPep:         boolean;
  totalChecked:  number;
}

export async function previewNameScreening(fullName: string): Promise<NameScreeningPreview> {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { status: "CLEAR", matchScore: 0, matchedEntity: null, listSource: null, matchMethod: null, isPep: false, totalChecked: 0 };
  }

  const entities        = await getSanctionLists(); // inclut PEP
  const matchThreshold  = ENV.SCREENING_MATCH_THRESHOLD;
  const reviewThreshold = ENV.SCREENING_REVIEW_THRESHOLD;

  const { bestMatch, totalChecked } = matchAgainstMultipleLists(
    trimmed, entities, reviewThreshold
  );

  const status: "CLEAR" | "MATCH" | "REVIEW" =
    bestMatch.score >= matchThreshold  ? "MATCH"
    : bestMatch.score >= reviewThreshold ? "REVIEW"
    : "CLEAR";

  return {
    status,
    matchScore:    bestMatch.score,
    matchedEntity: bestMatch.matchedEntity ?? null,
    listSource:    bestMatch.listSource ?? null,
    matchMethod:   bestMatch.matchMethod ?? null,
    isPep:         bestMatch.listSource === "PEP",
    totalChecked,
  };
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

