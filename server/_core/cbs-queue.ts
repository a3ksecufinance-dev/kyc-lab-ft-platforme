/**
 * CBS Outbound Queue — File d'attente pour appels CBS sortants
 *
 * Queue Redis légère (pas de BullMQ) pour les appels CBS :
 *   - pushKycUpdate, blockCustomerAccounts, pushAlert
 *   - Retry avec backoff exponentiel (1s → 2s → 4s → 8s → 16s)
 *   - Max 5 tentatives, puis dead-letter
 *   - Circuit breaker intégré (fast-fail si CBS en panne)
 *
 * Clés Redis :
 *   cbs:queue:pending   — sorted set (score = nextRunAt timestamp)
 *   cbs:queue:failed    — list (dead-letter jobs)
 *   cbs:queue:completed — compteur
 *   cbs:queue:job:{id}  — hash (job data)
 */

import { redis } from "./redis";
import { getCbsClient } from "./cbs";
import { cbsCircuitBreaker, CircuitOpenError } from "./circuit-breaker";
import { createLogger } from "./logger";
import { nanoid } from "nanoid";

const log = createLogger("cbs-queue");

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_RETRIES      = 5;
const BASE_DELAY_MS    = 1_000;   // 1s
const MAX_DELAY_MS     = 30_000;  // 30s
const POLL_INTERVAL_MS = 2_000;   // 2s polling
const JOB_TTL_SECONDS  = 86_400;  // 24h

// ─── Keys ───────────────────────────────────────────────────────────────────

const KEYS = {
  pending:   "cbs:queue:pending",
  failed:    "cbs:queue:failed",
  completed: "cbs:queue:completed",
  job:       (id: string) => `cbs:queue:job:${id}`,
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export type CbsJobType = "PUSH_KYC_UPDATE" | "BLOCK_ACCOUNTS" | "UNBLOCK_ACCOUNTS" | "PUSH_ALERT";

export interface CbsJob {
  id:          string;
  type:        CbsJobType;
  payload:     Record<string, unknown>;
  attempts:    number;
  maxRetries:  number;
  createdAt:   number;     // epoch ms
  nextRunAt:   number;     // epoch ms
  lastError:   string | null;
  status:      "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
}

export interface QueueStats {
  pending:   number;
  failed:    number;
  completed: number;
}

// ─── Enqueue ────────────────────────────────────────────────────────────────

export async function enqueueCbsJob(type: CbsJobType, payload: Record<string, unknown>): Promise<string> {
  const id = `cbsjob_${nanoid(12)}`;
  const now = Date.now();

  const job: CbsJob = {
    id,
    type,
    payload,
    attempts:   0,
    maxRetries: MAX_RETRIES,
    createdAt:  now,
    nextRunAt:  now,
    lastError:  null,
    status:     "PENDING",
  };

  const pipeline = redis.pipeline();
  pipeline.setex(KEYS.job(id), JOB_TTL_SECONDS, JSON.stringify(job));
  pipeline.zadd(KEYS.pending, now, id);
  await pipeline.exec();

  log.info({ jobId: id, type }, "CBS job enqueued");
  return id;
}

// ─── Process single job ─────────────────────────────────────────────────────

async function processJob(jobId: string): Promise<boolean> {
  const raw = await redis.get(KEYS.job(jobId));
  if (!raw) {
    await redis.zrem(KEYS.pending, jobId);
    return false;
  }

  const job: CbsJob = JSON.parse(raw);
  job.attempts++;
  job.status = "PROCESSING";
  await redis.setex(KEYS.job(jobId), JOB_TTL_SECONDS, JSON.stringify(job));

  try {
    await cbsCircuitBreaker.execute(async () => {
      await executeCbsCall(job);
    });

    // Success
    job.status = "COMPLETED";
    job.lastError = null;
    await redis.setex(KEYS.job(jobId), JOB_TTL_SECONDS, JSON.stringify(job));
    await redis.zrem(KEYS.pending, jobId);
    await redis.incr(KEYS.completed);

    log.info({ jobId, type: job.type, attempts: job.attempts }, "CBS job completed");
    return true;

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    job.lastError = errMsg;

    if (err instanceof CircuitOpenError) {
      // Circuit open — reschedule with longer delay
      const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, job.attempts));
      job.nextRunAt = Date.now() + delay;
      job.status = "PENDING";
      await redis.setex(KEYS.job(jobId), JOB_TTL_SECONDS, JSON.stringify(job));
      await redis.zadd(KEYS.pending, job.nextRunAt, jobId);
      log.warn({ jobId, type: job.type, delay }, "CBS job delayed — circuit open");
      return false;
    }

    if (job.attempts >= job.maxRetries) {
      // Dead letter
      job.status = "FAILED";
      await redis.setex(KEYS.job(jobId), JOB_TTL_SECONDS, JSON.stringify(job));
      await redis.zrem(KEYS.pending, jobId);
      await redis.lpush(KEYS.failed, jobId);
      log.error({ jobId, type: job.type, attempts: job.attempts, error: errMsg }, "CBS job → dead letter");
      return false;
    }

    // Retry with exponential backoff
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, job.attempts - 1));
    job.nextRunAt = Date.now() + delay;
    job.status = "PENDING";
    await redis.setex(KEYS.job(jobId), JOB_TTL_SECONDS, JSON.stringify(job));
    await redis.zadd(KEYS.pending, job.nextRunAt, jobId);

    log.warn({ jobId, type: job.type, attempts: job.attempts, delay, error: errMsg }, "CBS job retry scheduled");
    return false;
  }
}

// ─── Execute CBS call ───────────────────────────────────────────────────────

async function executeCbsCall(job: CbsJob): Promise<void> {
  const cbs = getCbsClient();
  if (!cbs) throw new Error("CBS client non disponible (CBS_MODE=absent)");

  const p = job.payload;

  switch (job.type) {
    case "PUSH_KYC_UPDATE":
      await cbs.pushKycUpdate(p as unknown as Parameters<typeof cbs.pushKycUpdate>[0]);
      break;

    case "BLOCK_ACCOUNTS":
      await cbs.blockCustomerAccounts(p as unknown as Parameters<typeof cbs.blockCustomerAccounts>[0]);
      break;

    case "UNBLOCK_ACCOUNTS":
      await cbs.unblockCustomerAccounts(
        p["customerId"] as string,
        p["reason"] as string,
      );
      break;

    case "PUSH_ALERT":
      await cbs.pushAlert(p as unknown as Parameters<typeof cbs.pushAlert>[0]);
      break;

    default:
      throw new Error(`Type de job CBS inconnu : ${job.type}`);
  }
}

// ─── Poll loop ──────────────────────────────────────────────────────────────

let _polling = false;
let _pollTimer: ReturnType<typeof setInterval> | null = null;

async function pollOnce(): Promise<number> {
  const now = Date.now();

  // Get jobs ready to run (score <= now)
  const readyIds = await redis.zrangebyscore(KEYS.pending, "-inf", now, "LIMIT", 0, 10);
  if (readyIds.length === 0) return 0;

  let processed = 0;
  for (const jobId of readyIds) {
    await processJob(jobId);
    processed++;
  }
  return processed;
}

export function startCbsQueueWorker(): void {
  if (_polling) return;
  _polling = true;

  _pollTimer = setInterval(async () => {
    try {
      await pollOnce();
    } catch (err) {
      log.error({ err }, "Erreur polling CBS queue");
    }
  }, POLL_INTERVAL_MS);

  log.info({ interval: POLL_INTERVAL_MS }, "CBS queue worker démarré");
}

export function stopCbsQueueWorker(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
  _polling = false;
  log.info("CBS queue worker arrêté");
}

// ─── Stats & Management ─────────────────────────────────────────────────────

export async function getQueueStats(): Promise<QueueStats> {
  const pipeline = redis.pipeline();
  pipeline.zcard(KEYS.pending);
  pipeline.llen(KEYS.failed);
  pipeline.get(KEYS.completed);
  const results = await pipeline.exec();

  return {
    pending:   (results?.[0]?.[1] as number) ?? 0,
    failed:    (results?.[1]?.[1] as number) ?? 0,
    completed: Number((results?.[2]?.[1] as string) ?? "0"),
  };
}

export async function getFailedJobs(limit = 20): Promise<CbsJob[]> {
  const ids = await redis.lrange(KEYS.failed, 0, limit - 1);
  const jobs: CbsJob[] = [];

  for (const id of ids) {
    const raw = await redis.get(KEYS.job(id));
    if (raw) jobs.push(JSON.parse(raw) as CbsJob);
  }

  return jobs;
}

export async function retryFailedJob(jobId: string): Promise<boolean> {
  const raw = await redis.get(KEYS.job(jobId));
  if (!raw) return false;

  const job: CbsJob = JSON.parse(raw);
  job.attempts = 0;
  job.status = "PENDING";
  job.nextRunAt = Date.now();
  job.lastError = null;

  const pipeline = redis.pipeline();
  pipeline.setex(KEYS.job(jobId), JOB_TTL_SECONDS, JSON.stringify(job));
  pipeline.zadd(KEYS.pending, job.nextRunAt, jobId);
  pipeline.lrem(KEYS.failed, 1, jobId);
  await pipeline.exec();

  log.info({ jobId, type: job.type }, "Failed CBS job requeued for retry");
  return true;
}

export async function retryAllFailed(): Promise<number> {
  const ids = await redis.lrange(KEYS.failed, 0, -1);
  let count = 0;

  for (const id of ids) {
    const ok = await retryFailedJob(id);
    if (ok) count++;
  }

  return count;
}

export async function clearFailedJobs(): Promise<number> {
  const ids = await redis.lrange(KEYS.failed, 0, -1);
  if (ids.length === 0) return 0;

  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.del(KEYS.job(id));
  }
  pipeline.del(KEYS.failed);
  await pipeline.exec();

  return ids.length;
}
