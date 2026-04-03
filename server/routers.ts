import { router } from "./_core/trpc";
import { authRouter }         from "./modules/auth/auth.router";
import { customersRouter }    from "./modules/customers/customers.router";
import { transactionsRouter } from "./modules/transactions/transactions.router";
import { alertsRouter }       from "./modules/alerts/alerts.router";
import { casesRouter }        from "./modules/cases/cases.router";
import { screeningRouter }    from "./modules/screening/screening.router";
import { reportsRouter }      from "./modules/reports/reports.router";
import { dashboardRouter }    from "./modules/dashboard/dashboard.router";
import { adminRouter }        from "./modules/admin/admin.router";
import { amlRulesRouter }     from "./modules/aml/aml-rules.router";
import { jurisdictionsRouter } from "./modules/aml/jurisdictions.router";

import { documentsRouter } from "./modules/documents/documents.router";
import { networkRouter }   from "./modules/network/network.router";
import { pkycRouter }      from "./modules/customers/pkyc.router";

export const appRouter = router({
  auth:          authRouter,
  customers:     customersRouter,
  transactions:  transactionsRouter,
  alerts:        alertsRouter,
  cases:         casesRouter,
  screening:     screeningRouter,
  reports:       reportsRouter,
  dashboard:     dashboardRouter,
  admin:         adminRouter,
  amlRules:      amlRulesRouter,
  jurisdictions: jurisdictionsRouter,
  documents:     documentsRouter,
  network:       networkRouter,
  pkyc:          pkycRouter,
});

export type AppRouter = typeof appRouter;
