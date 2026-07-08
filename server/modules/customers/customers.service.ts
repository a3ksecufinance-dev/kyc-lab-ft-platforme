import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import {
  findManyCustomers,
  findCustomerById,
  insertCustomer,
  updateCustomer,
  getCustomerStats,
  findDocumentsByCustomer,
  findUBOsByCustomer,
  findScreeningByCustomer,
  findTransactionsByCustomer,
  insertUBO,
  deleteUBO,
  type ListCustomersInput,
  type UpdateCustomerInput,
} from "./customers.repository";
import type { Customer } from "../../../drizzle/schema";
import { previewNameScreening } from "../screening/screening.service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  nationality?: string;
  residenceCountry?: string;
  address?: string;
  city?: string;
  profession?: string;
  employer?: string;
  sourceOfFunds?: string;
  monthlyIncome?: string;
  customerType: Customer["customerType"];
}

export interface AddUBOInput {
  customerId: number;
  firstName: string;
  lastName: string;
  nationality?: string;
  dateOfBirth?: string;
  ownershipPercentage?: string;
  role?: string;
  pepStatus: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function listCustomers(input: ListCustomersInput) {
  return findManyCustomers(input);
}

export async function getCustomerOrThrow(id: number): Promise<Customer> {
  const customer = await findCustomerById(id);
  if (!customer) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Client #${id} introuvable`,
    });
  }
  return customer;
}

export async function createCustomer(input: CreateCustomerInput) {
  const customerId = `KYC-${nanoid(8).toUpperCase()}`;

  // Risque initial automatique selon le type de client
  let initialRiskScore = 0;
  let initialRiskLevel: Customer["riskLevel"] = "LOW";

  if (input.customerType === "PEP") {
    initialRiskScore = 60;
    initialRiskLevel = "HIGH";
  } else if (input.customerType === "FOREIGN") {
    initialRiskScore = 25;
    initialRiskLevel = "MEDIUM";
  } else if (input.customerType === "CORPORATE") {
    initialRiskScore = 15;
    initialRiskLevel = "LOW";
  }

  const customer = await insertCustomer({
    customerId,
    ...input,
    monthlyIncome: input.monthlyIncome ?? null,
    kycStatus: "PENDING",
    riskLevel: initialRiskLevel,
    riskScore: initialRiskScore,
    pepStatus: input.customerType === "PEP",
  });

  return customer;
}

export async function updateCustomerStatus(
  id: number,
  updates: UpdateCustomerInput,
  actorRole: string
) {
  // Règle métier : seul supervisor+ peut changer le riskLevel
  if (updates.riskLevel !== undefined) {
    const allowedRoles = ["supervisor", "compliance_officer", "admin"];
    if (!allowedRoles.includes(actorRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seul un superviseur peut modifier le niveau de risque",
      });
    }
  }

  // Règle métier : si kycStatus → APPROVED, nextReviewDate dans 1 an
  if (updates.kycStatus === "APPROVED" && !updates.nextReviewDate) {
    const nextReview = new Date();
    nextReview.setFullYear(nextReview.getFullYear() + 1);
    updates.nextReviewDate = nextReview;
    updates.lastReviewDate = new Date();
  }

  return updateCustomer(id, updates);
}

export async function calculateRiskScore(customerId: number): Promise<{
  riskScore: number;
  riskLevel: Customer["riskLevel"];
  factors: Array<{ rule: string; score: number; reason: string }>;
}> {
  const customer = await getCustomerOrThrow(customerId);

  const factors: Array<{ rule: string; score: number; reason: string }> = [];
  let totalScore = 0;

  // Règle 1 : Type de client PEP
  if (customer.customerType === "PEP" || customer.pepStatus) {
    const score = 40;
    totalScore += score;
    factors.push({ rule: "PEP_STATUS", score, reason: "Client PEP confirmé" });
  }

  // Règle 2 : Client étranger (pays résidence ≠ nationalité)
  if (
    customer.customerType === "FOREIGN" ||
    (customer.nationality &&
      customer.residenceCountry &&
      customer.nationality !== customer.residenceCountry)
  ) {
    const score = 20;
    totalScore += score;
    factors.push({ rule: "FOREIGN_RESIDENT", score, reason: "Résident étranger ou non-résident" });
  }

  // Règle 3 : Statut sanction en attente ou match
  if (customer.sanctionStatus === "MATCH") {
    const score = 50;
    totalScore += score;
    factors.push({ rule: "SANCTION_MATCH", score, reason: "Correspondance liste sanctions" });
  } else if (customer.sanctionStatus === "REVIEW") {
    const score = 25;
    totalScore += score;
    factors.push({ rule: "SANCTION_REVIEW", score, reason: "En cours de vérification sanctions" });
  }

  // Règle 4 : Revenu mensuel élevé sans profession déclarée
  if (
    customer.monthlyIncome &&
    Number(customer.monthlyIncome) > 50000 &&
    !customer.profession
  ) {
    const score = 15;
    totalScore += score;
    factors.push({ rule: "HIGH_INCOME_NO_PROFESSION", score, reason: "Revenu élevé sans profession déclarée" });
  }

  // Règle 5 : Source de fonds non déclarée
  if (!customer.sourceOfFunds) {
    const score = 10;
    totalScore += score;
    factors.push({ rule: "NO_SOURCE_OF_FUNDS", score, reason: "Source de fonds non déclarée" });
  }

  // Score plafonné à 100
  const finalScore = Math.min(totalScore, 100);

  const riskLevel: Customer["riskLevel"] =
    finalScore >= 70 ? "CRITICAL"
    : finalScore >= 50 ? "HIGH"
    : finalScore >= 25 ? "MEDIUM"
    : "LOW";

  // Mettre à jour en DB
  await updateCustomer(customerId, { riskScore: finalScore, riskLevel });

  return { riskScore: finalScore, riskLevel, factors };
}

// ─── Helpers pour les relations ───────────────────────────────────────────────

export const getCustomerDocuments = (customerId: number) =>
  findDocumentsByCustomer(customerId);

export const getCustomerUBOs = (customerId: number) =>
  findUBOsByCustomer(customerId);

export const getCustomerScreening = (customerId: number) =>
  findScreeningByCustomer(customerId);

export const getCustomerTransactions = (customerId: number, limit?: number) =>
  findTransactionsByCustomer(customerId, limit);

export async function addUBO(input: AddUBOInput) {
  // Vérifier que le customer existe
  await getCustomerOrThrow(input.customerId);

  // Screening PEP/sanctions automatique — les UBO ≥ 25% sont soumis à la
  // même vigilance que le représentant légal (BAM circulaire 5/W/2023 art. 8).
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const screening = await previewNameScreening(fullName).catch(() => null);
  // PEP explicite si détecté par le screening, sinon on garde l'input
  const pepStatus = input.pepStatus || (screening?.isPep ?? false);

  const ubo = await insertUBO({
    customerId: input.customerId,
    firstName:  input.firstName,
    lastName:   input.lastName,
    pepStatus,
    ...(input.nationality         !== undefined && { nationality: input.nationality }),
    ...(input.dateOfBirth         !== undefined && { dateOfBirth: input.dateOfBirth }),
    ...(input.ownershipPercentage !== undefined && { ownershipPercentage: input.ownershipPercentage }),
    ...(input.role                !== undefined && { role: input.role }),
  });

  return { ubo, screening };
}

export async function removeUBO(uboId: number, customerId: number): Promise<void> {
  await getCustomerOrThrow(customerId);
  const ok = await deleteUBO(uboId, customerId);
  if (!ok) {
    throw new TRPCError({ code: "NOT_FOUND", message: `UBO #${uboId} introuvable pour ce client` });
  }
}

// ─── Couverture UBO pour personnes morales ───────────────────────────────────
//
// BAM circulaire 5/W/2023 : identifier les bénéficiaires effectifs directs et
// indirects détenant ≥ 25 % des parts. Si aucun UBO ≥ 25 % identifié, le
// représentant légal est réputé UBO (article 5 § 3).
//
// Cette fonction évalue la couverture ; à utiliser avant approbation KYC
// d'un customer CORPORATE.

export interface UboCoverage {
  totalUbos:        number;
  totalOwnership:   number;   // somme des pourcentages déclarés
  hasUboOver25:     boolean;
  hasPepUbo:        boolean;
  needsRepAsUbo:    boolean;  // si personne ≥ 25% → art. 5 § 3
  ready:            boolean;
  missing:          string[];
}

export async function assessUboCoverage(customerId: number): Promise<UboCoverage> {
  const customer = await getCustomerOrThrow(customerId);
  const uboList  = await findUBOsByCustomer(customerId);

  const parsed = uboList.map(u => ({
    ...u,
    pct: Number(u.ownershipPercentage ?? 0),
  }));
  const totalOwnership = parsed.reduce((s, u) => s + (isFinite(u.pct) ? u.pct : 0), 0);
  const hasUboOver25   = parsed.some(u => u.pct >= 25);
  const hasPepUbo      = parsed.some(u => u.pepStatus);
  const needsRepAsUbo  = !hasUboOver25;

  const missing: string[] = [];
  if (customer.customerType === "CORPORATE") {
    if (uboList.length === 0)   missing.push("Aucun bénéficiaire effectif déclaré");
    if (!hasUboOver25)          missing.push("Aucun UBO ≥ 25% — représentant légal doit être ajouté comme UBO");
    if (totalOwnership > 100.01) missing.push(`Somme des parts déclarées ${totalOwnership.toFixed(2)}% > 100%`);
  }

  return {
    totalUbos:      uboList.length,
    totalOwnership: Math.round(totalOwnership * 100) / 100,
    hasUboOver25,
    hasPepUbo,
    needsRepAsUbo,
    ready:          missing.length === 0,
    missing,
  };
}

export { getCustomerStats };

// ─── Gel des avoirs ───────────────────────────────────────────────────────────

export async function freezeCustomer(
  id: number,
  reason: string,
  frozenBy: number,
): Promise<Customer> {
  const customer = await getCustomerOrThrow(id);

  if (customer.frozenAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Client déjà gelé",
    });
  }

  return updateCustomer(id, {
    frozenAt:     new Date(),
    frozenReason: reason,
    frozenBy,
  });
}

export async function unfreezeCustomer(
  id: number,
  _unfrozenBy: number,
): Promise<Customer> {
  const customer = await getCustomerOrThrow(id);

  if (!customer.frozenAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Client non gelé",
    });
  }

  return updateCustomer(id, {
    frozenAt:     null,
    frozenReason: null,
    frozenBy:     null,
  });
}

// ─── RGPD — Droit à l'effacement ─────────────────────────────────────────────

export async function requestErasure(
  id: number,
  requestedBy: number,
): Promise<Customer> {
  const customer = await getCustomerOrThrow(id);

  if (customer.erasureRequestedAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Demande d'effacement déjà en cours",
    });
  }

  return updateCustomer(id, {
    erasureRequestedAt: new Date(),
    erasureRequestedBy: requestedBy,
  });
}

export async function processErasure(
  id: number,
  processedBy: number,
): Promise<Customer> {
  const customer = await getCustomerOrThrow(id);

  if (!customer.erasureRequestedAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Aucune demande d'effacement en attente",
    });
  }
  if (customer.erasureCompletedAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Effacement déjà effectué",
    });
  }

  // Anonymiser les données PII (conservation légale 5 ans : données financières gardées)
  const ANON = "[ANONYMISÉ]";
  return updateCustomer(id, {
    firstName:          ANON,
    lastName:           ANON,
    email:              null,
    phone:              null,
    dateOfBirth:        null,
    address:            null,
    city:               null,
    profession:         null,
    employer:           null,
    sourceOfFunds:      ANON,
    notes:              null,
    erasureCompletedAt: new Date(),
    erasureCompletedBy: processedBy,
  });
}
