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

import { documentsRouter }    from "./modules/documents/documents.router";
import { docExpiryRouter }   from "./modules/documents/doc-expiry.router";
import { networkRouter }      from "./modules/network/network.router";
import { pkycRouter }         from "./modules/customers/pkyc.router";
import { institutionRouter }          from "./modules/institution/institution.router";
import { walletsRouter }              from "./modules/wallets/wallets.router";
import { agentsRouter }               from "./modules/agents/agents.router";
import { bamRouter }                  from "./modules/reports/bam.router";
import { enhancedOnboardingRouter }   from "./modules/customers/enhanced-onboarding.router";
import { travelRuleRouter }           from "./modules/travel-rule/travel-rule.router";
import { iso20022Router }             from "./modules/iso20022/iso20022.router";
import { slaRouter }                  from "./modules/sla/sla.router";
import { approvalsRouter }            from "./modules/approvals/approvals.router";
import { correspondentRouter }        from "./modules/correspondent/correspondent.router";
import { licenseRouter }              from "./modules/license/license.router";
import { notificationsRouter }        from "./modules/notifications/notifications.router";
import { configRouter }               from "./modules/config/config.router";
import { connectorsRouter }           from "./modules/connectors/connectors.router";
import { goodGuysRouter }             from "./modules/aml/good-guys.router";
import { silencingRouter }            from "./modules/aml/silencing.router";

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
  docExpiry:     docExpiryRouter,
  network:       networkRouter,
  pkyc:          pkycRouter,
  institution:         institutionRouter,
  wallets:             walletsRouter,
  agents:              agentsRouter,
  bam:                 bamRouter,
  enhancedOnboarding:  enhancedOnboardingRouter,
  travelRule:          travelRuleRouter,
  iso20022:            iso20022Router,
  sla:                 slaRouter,
  approvals:           approvalsRouter,
  correspondent:       correspondentRouter,
  license:             licenseRouter,
  notifications:       notificationsRouter,
  config:              configRouter,
  connectors:          connectorsRouter,
  goodGuys:            goodGuysRouter,
  silencing:           silencingRouter,
});

export type AppRouter = typeof appRouter;
