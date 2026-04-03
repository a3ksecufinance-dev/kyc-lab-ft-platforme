import { z }            from "zod";
import { router, analystProc, adminProc } from "../../_core/trpc";
import {
  getPkycDashboardStats,
  getPkycQueue,
  getCustomerDriftHistory,
  runPkycForCustomer,
} from "./pkyc.service";
import {
  forcePkycRun,
  getPkycSchedulerStatus,
} from "./pkyc.scheduler";
import { findCustomerById } from "./customers.repository";
import { TRPCError } from "@trpc/server";

export const pkycRouter = router({

  // ── Dashboard stats ─────────────────────────────────────────────────────────
  dashboard: analystProc.query(async () => {
    return getPkycDashboardStats();
  }),

  // ── File de revue — clients dont le drift dépasse le seuil ──────────────────
  queue: analystProc
    .input(z.object({
      page:  z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      return getPkycQueue(input.page, input.limit);
    }),

  // ── Historique de dérive pour un client ─────────────────────────────────────
  customerHistory: analystProc
    .input(z.object({
      customerId: z.number().int().positive(),
      days:       z.number().int().min(7).max(365).default(30),
    }))
    .query(async ({ input }) => {
      return getCustomerDriftHistory(input.customerId, input.days);
    }),

  // ── Lancer le scoring pKYC pour un client unique (on-demand) ─────────────────
  runForCustomer: analystProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const customer = await findCustomerById(input.customerId);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable" });
      return runPkycForCustomer(customer, new Date());
    }),

  // ── Forcer un run nuitier complet (admin) ────────────────────────────────────
  forceRun: adminProc.mutation(async () => {
    return forcePkycRun();
  }),

  // ── État du scheduler ────────────────────────────────────────────────────────
  schedulerStatus: adminProc.query(() => {
    return getPkycSchedulerStatus();
  }),
});
