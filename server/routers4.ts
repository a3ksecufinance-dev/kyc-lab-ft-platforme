import { router } from "./_core/trpc";
import { authRouter }         from "./modules/auth/auth.router";
import { customersRouter }    from "./modules/customers/customers.router";
import { transactionsRouter } from "./modules/transactions/transactions.router";
import { alertsRouter }       from "./modules/alerts/alerts.router";
import { casesRouter }        from "./modules/cases/cases.router";
import { screeningRouter }    from "./modules/screening/screening.router";

// ─── À brancher prochainement ─────────────────────────────────────────────────
// import { reportsRouter }   from "./modules/reports/reports.router";
// import { dashboardRouter } from "./modules/dashboard/dashboard.router";
// import { adminRouter }     from "./modules/admin/admin.router";

export const appRouter = router({
  auth:         authRouter,
  customers:    customersRouter,
  transactions: transactionsRouter,
  alerts:       alertsRouter,
  cases:        casesRouter,
  screening:    screeningRouter,
});

export type AppRouter = typeof appRouter;
