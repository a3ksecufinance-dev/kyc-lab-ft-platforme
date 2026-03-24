import { z } from "zod";
import { router, analystProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  listCustomers,
  getCustomerOrThrow,
  createCustomer,
  updateCustomerStatus,
  calculateRiskScore,
  getCustomerDocuments,
  getCustomerUBOs,
  getCustomerScreening,
  getCustomerTransactions,
  addUBO,
  getCustomerStats,
  type CreateCustomerInput,
  type AddUBOInput,
} from "./customers.service";
import type { ListCustomersInput, UpdateCustomerInput } from "./customers.repository";

// ─── Schémas Zod ─────────────────────────────────────────────────────────────

const riskLevelEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const kycStatusEnum = z.enum(["PENDING", "IN_REVIEW", "APPROVED", "REJECTED", "EXPIRED"]);
const customerTypeEnum = z.enum(["INDIVIDUAL", "CORPORATE", "PEP", "FOREIGN"]);

// ─── Router ───────────────────────────────────────────────────────────────────

export const customersRouter = router({

  /**
   * Liste paginée avec filtres — analyst+
   */
  list: analystProc
    .input(z.object({
      page:         z.number().int().positive().default(1),
      limit:        z.number().int().min(1).max(100).default(20),
      search:       z.string().optional(),
      riskLevel:    riskLevelEnum.optional(),
      kycStatus:    kycStatusEnum.optional(),
      country:      z.string().optional(),
      customerType: customerTypeEnum.optional(),
    }))
    .query(async ({ input }) => {
      const params: ListCustomersInput = {
        page: input.page,
        limit: input.limit,
        ...(input.search       !== undefined && { search: input.search }),
        ...(input.riskLevel    !== undefined && { riskLevel: input.riskLevel }),
        ...(input.kycStatus    !== undefined && { kycStatus: input.kycStatus }),
        ...(input.country      !== undefined && { country: input.country }),
        ...(input.customerType !== undefined && { customerType: input.customerType }),
      };
      return listCustomers(params);
    }),

  /**
   * Détail d'un client — analyst+
   */
  getById: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getCustomerOrThrow(input.id);
    }),

  /**
   * Créer un client — analyst+
   */
  create: analystProc
    .input(z.object({
      firstName:        z.string().min(1).max(100),
      lastName:         z.string().min(1).max(100),
      email:            z.string().email().optional(),
      phone:            z.string().max(50).optional(),
      dateOfBirth:      z.string().optional(),
      nationality:      z.string().max(10).optional(),
      residenceCountry: z.string().max(10).optional(),
      address:          z.string().optional(),
      city:             z.string().max(100).optional(),
      profession:       z.string().max(200).optional(),
      employer:         z.string().max(200).optional(),
      sourceOfFunds:    z.string().max(200).optional(),
      monthlyIncome:    z.string().optional(),
      customerType:     customerTypeEnum.default("INDIVIDUAL"),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);

      const params: CreateCustomerInput = {
        firstName:    input.firstName,
        lastName:     input.lastName,
        customerType: input.customerType,
        ...(input.email            !== undefined && { email: input.email }),
        ...(input.phone            !== undefined && { phone: input.phone }),
        ...(input.dateOfBirth      !== undefined && { dateOfBirth: input.dateOfBirth }),
        ...(input.nationality      !== undefined && { nationality: input.nationality }),
        ...(input.residenceCountry !== undefined && { residenceCountry: input.residenceCountry }),
        ...(input.address          !== undefined && { address: input.address }),
        ...(input.city             !== undefined && { city: input.city }),
        ...(input.profession       !== undefined && { profession: input.profession }),
        ...(input.employer         !== undefined && { employer: input.employer }),
        ...(input.sourceOfFunds    !== undefined && { sourceOfFunds: input.sourceOfFunds }),
        ...(input.monthlyIncome    !== undefined && { monthlyIncome: input.monthlyIncome }),
      };

      const customer = await createCustomer(params);

      await log({
        action: "CUSTOMER_CREATED",
        entityType: "customer",
        entityId: customer.customerId,
        details: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          customerType: customer.customerType,
          initialRiskLevel: customer.riskLevel,
        },
      });

      return {
        id: customer.id,
        customerId: customer.customerId,
        riskLevel: customer.riskLevel,
        riskScore: customer.riskScore,
      };
    }),

  /**
   * Mettre à jour — analyst pour notes/kycStatus, supervisor pour riskLevel
   */
  update: analystProc
    .input(z.object({
      id:              z.number().int().positive(),
      kycStatus:       kycStatusEnum.optional(),
      riskLevel:       riskLevelEnum.optional(),
      riskScore:       z.number().int().min(0).max(100).optional(),
      pepStatus:       z.boolean().optional(),
      notes:           z.string().optional(),
      assignedAnalyst: z.number().int().positive().nullable().optional(),
      nextReviewDate:  z.string().datetime().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const { id, ...rest } = input;

      const before = await getCustomerOrThrow(id);

      const updates: UpdateCustomerInput = {
        ...(rest.kycStatus       !== undefined && { kycStatus: rest.kycStatus }),
        ...(rest.riskLevel       !== undefined && { riskLevel: rest.riskLevel }),
        ...(rest.riskScore       !== undefined && { riskScore: rest.riskScore }),
        ...(rest.pepStatus       !== undefined && { pepStatus: rest.pepStatus }),
        ...(rest.notes           !== undefined && { notes: rest.notes }),
        ...(rest.assignedAnalyst !== undefined && { assignedAnalyst: rest.assignedAnalyst }),
        ...(rest.nextReviewDate  !== undefined && { nextReviewDate: new Date(rest.nextReviewDate) }),
      };

      const updated = await updateCustomerStatus(id, updates, ctx.user.role);

      if (rest.kycStatus && rest.kycStatus !== before.kycStatus) {
        await log({
          action: "CUSTOMER_KYC_STATUS_CHANGED",
          entityType: "customer",
          entityId: updated.customerId,
          details: { from: before.kycStatus, to: rest.kycStatus },
        });
      } else if (rest.riskLevel && rest.riskLevel !== before.riskLevel) {
        await log({
          action: "CUSTOMER_RISK_LEVEL_CHANGED",
          entityType: "customer",
          entityId: updated.customerId,
          details: { from: before.riskLevel, to: rest.riskLevel },
        });
      } else {
        await log({
          action: "CUSTOMER_UPDATED",
          entityType: "customer",
          entityId: updated.customerId,
          details: rest as Record<string, unknown>,
        });
      }

      return updated;
    }),

  /**
   * Calculer le score de risque — analyst+
   */
  calculateRiskScore: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);

      const result = await calculateRiskScore(input.id);
      const customer = await getCustomerOrThrow(input.id);

      await log({
        action: "CUSTOMER_RISK_SCORE_CALCULATED",
        entityType: "customer",
        entityId: customer.customerId,
        details: {
          riskScore: result.riskScore,
          riskLevel: result.riskLevel,
          factors: result.factors as unknown as Record<string, unknown>[],
        },
      });

      return result;
    }),

  /**
   * Statistiques globales — analyst+
   */
  stats: analystProc
    .query(async () => getCustomerStats()),

  /**
   * Documents du client — analyst+
   */
  getDocuments: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await getCustomerOrThrow(input.customerId);
      return getCustomerDocuments(input.customerId);
    }),

  /**
   * UBOs (Bénéficiaires Effectifs) — analyst+
   */
  getUBOs: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await getCustomerOrThrow(input.customerId);
      return getCustomerUBOs(input.customerId);
    }),

  addUBO: analystProc
    .input(z.object({
      customerId:          z.number().int().positive(),
      firstName:           z.string().min(1).max(100),
      lastName:            z.string().min(1).max(100),
      nationality:         z.string().max(10).optional(),
      dateOfBirth:         z.string().optional(),
      ownershipPercentage: z.string().optional(),
      role:                z.string().max(100).optional(),
      pepStatus:           z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);

      const params: AddUBOInput = {
        customerId: input.customerId,
        firstName:  input.firstName,
        lastName:   input.lastName,
        pepStatus:  input.pepStatus,
        ...(input.nationality         !== undefined && { nationality: input.nationality }),
        ...(input.dateOfBirth         !== undefined && { dateOfBirth: input.dateOfBirth }),
        ...(input.ownershipPercentage !== undefined && { ownershipPercentage: input.ownershipPercentage }),
        ...(input.role                !== undefined && { role: input.role }),
      };

      const ubo = await addUBO(params);
      const customer = await getCustomerOrThrow(input.customerId);

      await log({
        action: "UBO_ADDED",
        entityType: "customer",
        entityId: customer.customerId,
        details: {
          uboId: ubo.id,
          firstName: ubo.firstName,
          lastName: ubo.lastName,
          ownershipPercentage: ubo.ownershipPercentage,
        },
      });

      return ubo;
    }),

  /**
   * Résultats screening du client — analyst+
   */
  getScreening: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await getCustomerOrThrow(input.customerId);
      return getCustomerScreening(input.customerId);
    }),

  /**
   * Transactions du client — analyst+
   */
  getTransactions: analystProc
    .input(z.object({
      customerId: z.number().int().positive(),
      limit:      z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      await getCustomerOrThrow(input.customerId);
      return getCustomerTransactions(input.customerId, input.limit);
    }),
});
