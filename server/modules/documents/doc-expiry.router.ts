import { router, analystProc, adminProc } from "../../_core/trpc";
import { getDocExpiryStats }              from "./doc-expiry.service";
import { forceDocExpiryRun, getDocExpirySchedulerStatus } from "./doc-expiry.scheduler";

export const docExpiryRouter = router({

  // ── Stats expiration (nb expirés, expirant bientôt) ──────────────────────────
  stats: analystProc.query(async () => {
    return getDocExpiryStats();
  }),

  // ── État du scheduler ─────────────────────────────────────────────────────────
  schedulerStatus: adminProc.query(() => {
    return getDocExpirySchedulerStatus();
  }),

  // ── Forcer un run manuel (admin) ──────────────────────────────────────────────
  forceRun: adminProc.mutation(async () => {
    return forceDocExpiryRun();
  }),
});
