/**
 * Bus d'événements eKYC — Server-Sent Events pour notifier les agents.
 *
 * Cas d'usage principal : un client remplit un magic-link puis clique
 * "Envoyer" (submitForAgentReview). L'agent voit apparaître la session dans
 * son tableau de bord sans refresh.
 *
 * Implementation : in-memory pub/sub sur EventEmitter. Suffisant pour un
 * déploiement mono-process. Pour multi-process, il faudra passer par
 * Redis pub/sub (BullMQ Events peut aussi servir).
 */

import { EventEmitter } from "node:events";
import type { Response, Request } from "express";
import { createLogger } from "../../_core/logger";

const log = createLogger("ekyc-events");

export type EkycEventName =
  | "session-created"
  | "session-review-ready"
  | "session-decided"
  | "session-abandoned";

export interface EkycEvent {
  event:     EkycEventName;
  sessionRef: string;
  status?:   string;
  channel?:  string;
  at:        string; // ISO
}

const bus = new EventEmitter();
bus.setMaxListeners(64);

export function emitEkycEvent(evt: Omit<EkycEvent, "at">): void {
  const full: EkycEvent = { ...evt, at: new Date().toISOString() };
  bus.emit("evt", full);
}

// ─── Handler SSE ─────────────────────────────────────────────────────────────

const HEARTBEAT_MS = 20_000; // Envoie un ping toutes les 20 s (évite timeout proxy)

export function handleEkycSseStream(_req: Request, res: Response): void {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx : désactive le buffering
  res.flushHeaders?.();

  const send = (evt: EkycEvent) => {
    res.write(`event: ${evt.event}\n`);
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, HEARTBEAT_MS);

  // Message d'accueil pour vérifier que le canal est ouvert côté client
  res.write(`: connected ${Date.now()}\n\n`);

  bus.on("evt", send);
  log.debug("SSE client connecté");

  const cleanup = () => {
    clearInterval(heartbeat);
    bus.off("evt", send);
    log.debug("SSE client déconnecté");
    res.end();
  };
  _req.on("close", cleanup);
  _req.on("error", cleanup);
}
