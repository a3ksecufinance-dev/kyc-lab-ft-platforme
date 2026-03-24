import { router } from "./_core/trpc";
import { authRouter } from "./modules/auth/auth.router";
import { customersRouter } from "./modules/customers/customers.router";

// ─── À compléter au fur et à mesure des modules ───────────────────────────────
// import { transactionsRouter } from "./modules/transactions/transactions.router";
// import { amlRouter } from "./modules/aml/aml.router";
// import { alertsRouter } from "./modules/alerts/alerts.router";
// import { casesRouter } from "./modules/cases/cases.router";
// import { screeningRouter } from "./modules/screening/screening.router";
// import { reportsRouter } from "./modules/reports/reports.router";
// import { dashboardRouter } from "./modules/dashboard/dashboard.router";
// import { adminRouter } from "./modules/admin/admin.router";

export const appRouter = router({
  auth: authRouter,
  customers: customersRouter,
  // transactions: transactionsRouter,
  // aml: amlRouter,
  // alerts: alertsRouter,
  // cases: casesRouter,
  // screening: screeningRouter,
  // reports: reportsRouter,
  // dashboard: dashboardRouter,
  // admin: adminRouter,
});

export type AppRouter = typeof appRouter;
