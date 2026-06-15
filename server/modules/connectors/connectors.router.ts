/**
 * Connectors Router — Phase G
 *
 * Supervision et contrôle des connecteurs CBS :
 *   - dashboard (health, circuit breaker, queue stats)
 *   - retry jobs en échec
 *   - reset circuit breaker
 */

import { z } from "zod";
import { router, supervisorProc, adminProc } from "../../_core/trpc";
import { cbsCircuitBreaker } from "../../_core/circuit-breaker";
import {
  getConnectorDashboard,
  checkCbsHealth,
  getCircuitBreakerStatus,
  retryFailedJob,
  retryAllFailed,
  clearFailedJobs,
} from "./connectors.service";
import { getQueueStats, getFailedJobs, enqueueCbsJob } from "../../_core/cbs-queue";

export const connectorsRouter = router({

  dashboard: supervisorProc
    .query(() => getConnectorDashboard()),

  cbsHealth: supervisorProc
    .query(() => checkCbsHealth()),

  circuitBreaker: supervisorProc
    .query(() => getCircuitBreakerStatus()),

  queueStats: supervisorProc
    .query(() => getQueueStats()),

  failedJobs: supervisorProc
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .query(({ input }) => getFailedJobs(input.limit)),

  retryJob: supervisorProc
    .input(z.object({ jobId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const ok = await retryFailedJob(input.jobId);
      return { success: ok };
    }),

  retryAllFailed: adminProc
    .mutation(async () => {
      const count = await retryAllFailed();
      return { retriedCount: count };
    }),

  clearFailed: adminProc
    .mutation(async () => {
      const count = await clearFailedJobs();
      return { clearedCount: count };
    }),

  resetCircuitBreaker: adminProc
    .mutation(async () => {
      await cbsCircuitBreaker.reset();
      return { success: true };
    }),

  // Test: enqueue a manual CBS job (admin only, for testing)
  enqueueTest: adminProc
    .input(z.object({
      type:    z.enum(["PUSH_KYC_UPDATE", "BLOCK_ACCOUNTS", "UNBLOCK_ACCOUNTS", "PUSH_ALERT"]),
      payload: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      const jobId = await enqueueCbsJob(input.type, input.payload);
      return { jobId };
    }),
});
