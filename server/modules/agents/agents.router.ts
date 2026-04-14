/**
 * Agents Router — actif uniquement si agentAccounts=true
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, analystProc, supervisorProc, adminProc } from "../../_core/trpc";
import { getInstitutionFlags } from "../../_core/institution";
import { createAuditFromContext } from "../../_core/audit";
import {
  listAgents,
  getAgentById,
  createAgent,
  adjustFloat,
  updateAgentRisk,
  setAgentActive,
  getAgentStats,
  getAgentActivity,
} from "./agents.service";

function requireAgents() {
  if (!getInstitutionFlags().agentAccounts) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Module agents non activé pour cette institution" });
  }
}

export const agentsRouter = router({

  list: analystProc
    .input(z.object({
      page:     z.number().int().positive().default(1),
      limit:    z.number().int().min(1).max(100).default(20),
      region:   z.string().optional(),
      isActive: z.boolean().optional(),
      search:   z.string().optional(),
      riskMin:  z.number().int().min(0).max(100).optional(),
    }))
    .query(({ input }) => {
      requireAgents();
      return listAgents({
        page:  input.page,
        limit: input.limit,
        ...(input.region   !== undefined && { region:   input.region }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.search   !== undefined && { search:   input.search }),
        ...(input.riskMin  !== undefined && { riskMin:  input.riskMin }),
      });
    }),

  get: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      requireAgents();
      const agent = await getAgentById(input.id);
      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: `Agent ${input.id} introuvable` });
      return agent;
    }),

  create: supervisorProc
    .input(z.object({
      name:          z.string().min(2).max(200),
      phone:         z.string().max(30).optional(),
      region:        z.string().max(100).optional(),
      city:          z.string().max(100).optional(),
      licenseNumber: z.string().max(100).optional(),
      currency:      z.string().max(10).optional(),
      userId:        z.number().int().positive().optional(),
    }))
    .mutation(({ input }) => {
      requireAgents();
      return createAgent({
        name: input.name,
        ...(input.phone         !== undefined && { phone:         input.phone }),
        ...(input.region        !== undefined && { region:        input.region }),
        ...(input.city          !== undefined && { city:          input.city }),
        ...(input.licenseNumber !== undefined && { licenseNumber: input.licenseNumber }),
        ...(input.currency      !== undefined && { currency:      input.currency }),
        ...(input.userId        !== undefined && { userId:        input.userId }),
      });
    }),

  adjustFloat: supervisorProc
    .input(z.object({
      agentId: z.number().int().positive(),
      delta:   z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAgents();
      const log = createAuditFromContext(ctx);
      const result = await adjustFloat(input.agentId, input.delta);
      await log({ action: "TRANSACTION_CREATED", entityType: "transaction",
        entityId: String(input.agentId),
        details: { agentId: input.agentId, delta: input.delta, action: "FLOAT_ADJUSTED" } });
      return result;
    }),

  updateRisk: supervisorProc
    .input(z.object({
      agentId:   z.number().int().positive(),
      riskScore: z.number().int().min(0).max(100),
      riskFlags: z.unknown().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAgents();
      const log = createAuditFromContext(ctx);
      const result = await updateAgentRisk(input.agentId, input.riskScore, input.riskFlags);
      await log({ action: "CUSTOMER_RISK_LEVEL_CHANGED", entityType: "customer",
        entityId: String(input.agentId),
        details: { agentId: input.agentId, riskScore: input.riskScore } });
      return result;
    }),

  setActive: adminProc
    .input(z.object({
      agentId:  z.number().int().positive(),
      isActive: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAgents();
      const log = createAuditFromContext(ctx);
      const result = await setAgentActive(input.agentId, input.isActive);
      await log({ action: "USER_DEACTIVATED", entityType: "user",
        entityId: String(input.agentId),
        details: { agentId: input.agentId, isActive: input.isActive } });
      return result;
    }),

  activity: analystProc
    .input(z.object({
      agentId: z.number().int().positive(),
      days:    z.number().int().min(1).max(365).default(30),
    }))
    .query(({ input }) => {
      requireAgents();
      return getAgentActivity(input.agentId, input.days);
    }),

  stats: analystProc
    .query(() => {
      requireAgents();
      return getAgentStats();
    }),
});
