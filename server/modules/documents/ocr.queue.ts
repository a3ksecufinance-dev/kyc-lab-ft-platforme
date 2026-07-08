/**
 * Queue OCR — traite les uploads d'image de façon asynchrone.
 *
 * Motivation :
 *   L'OCR d'une CIN (8 Mo) prend 5-15 s, ce qui bloque l'agent le temps que
 *   la requête HTTP se termine. En file d'attente, l'agent reçoit un jobId
 *   immédiatement et poll le résultat.
 *
 * Payload : image encodée base64 dans le job (ok jusqu'à ~10 MB).
 * Connexion BullMQ dédiée (exige maxRetriesPerRequest: null).
 */

import { Queue, Worker, QueueEvents, type Job, type ConnectionOptions } from "bullmq";
import { ENV }           from "../../_core/env";
import { createLogger }  from "../../_core/logger";
import { uploadImage, type UploadImageResult } from "./ekyc-session.service";

const log = createLogger("ocr-queue");

export const OCR_QUEUE_NAME = "ekyc-ocr";

// BullMQ exige maxRetriesPerRequest: null pour son worker. On construit des
// options ioredis à partir de REDIS_URL — chaque instance (queue, worker,
// events) crée sa propre connexion sous le capot.
function buildConnection(): ConnectionOptions {
  const url = new URL(ENV.REDIS_URL);
  const opts: ConnectionOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
  };
  const password = ENV.REDIS_PASSWORD ?? (url.password ? decodeURIComponent(url.password) : undefined);
  if (password) opts.password = password;
  if (url.username && url.username !== "default") opts.username = url.username;
  const db = url.pathname.replace(/^\//, "");
  if (db) opts.db = Number(db);
  return opts;
}

// ─── Types du job ────────────────────────────────────────────────────────────

export interface OcrJobPayload {
  sessionRef:      string;
  side:            "recto" | "verso";
  imageBase64:     string;
  mimeType:        string;
  skipQualityGate?: boolean;
}

export type OcrJobResult = Omit<UploadImageResult, "session"> & {
  sessionRef: string;
  newStatus:  UploadImageResult["session"]["status"];
};

// ─── Singleton Queue ─────────────────────────────────────────────────────────

let _queue:  Queue<OcrJobPayload, OcrJobResult> | null = null;
let _worker: Worker<OcrJobPayload, OcrJobResult> | null = null;
let _events: QueueEvents | null = null;

export function getOcrQueue(): Queue<OcrJobPayload, OcrJobResult> {
  if (_queue) return _queue;
  const queue = new Queue<OcrJobPayload, OcrJobResult>(OCR_QUEUE_NAME, {
    connection: buildConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff:  { type: "exponential", delay: 2_000 },
      // Rétention : 200 succès pendant 1h, 500 échecs pendant 24h
      removeOnComplete: { count: 200, age: 60 * 60 },
      removeOnFail:     { count: 500, age: 24 * 60 * 60 },
    },
  });
  _queue = queue;
  return queue;
}

// ─── Worker + lifecycle (démarré/arrêté par _core/index.ts) ──────────────────

export function startOcrWorker(): void {
  if (_worker) return;

  _worker = new Worker<OcrJobPayload, OcrJobResult>(
    OCR_QUEUE_NAME,
    async (job: Job<OcrJobPayload, OcrJobResult>) => {
      const { sessionRef, side, imageBase64, mimeType, skipQualityGate } = job.data;
      const buffer = Buffer.from(imageBase64, "base64");
      const result = await uploadImage({
        sessionRef,
        side,
        buffer,
        mimeType,
        ...(skipQualityGate ? { skipQualityGate: true } : {}),
      });
      // On ne renvoie pas l'objet session complet (colonnes JSON lourdes) —
      // seulement les champs utiles au client.
      const { session, ...rest } = result;
      return {
        ...rest,
        sessionRef: session.sessionRef,
        newStatus:  session.status,
      };
    },
    {
      connection:  buildConnection(),
      concurrency: ENV.OCR_QUEUE_CONCURRENCY,
    },
  );

  _worker.on("completed", (job) => {
    log.info({ jobId: job.id, sessionRef: job.data.sessionRef }, "Job OCR terminé");
  });
  _worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "Job OCR échoué");
  });

  _events = new QueueEvents(OCR_QUEUE_NAME, { connection: buildConnection() });

  log.info({ concurrency: ENV.OCR_QUEUE_CONCURRENCY }, "OCR worker démarré");
}

export async function stopOcrWorker(): Promise<void> {
  await Promise.allSettled([
    _worker?.close(),
    _events?.close(),
    _queue?.close(),
  ]);
  _worker = null;
  _events = null;
  _queue  = null;
  log.info("OCR worker arrêté");
}
