import pino from "pino";
import { ENV } from "./env";

// ─── Transports ───────────────────────────────────────────────────────────────

function buildTransport() {
  const targets: object[] = [];

  // Console (pretty en dev, JSON en prod)
  if (ENV.LOG_FORMAT === "pretty") {
    targets.push({
      target: "pino-pretty",
      level:  ENV.LOG_LEVEL,
      options: {
        colorize:      true,
        translateTime: "SYS:HH:MM:ss",
        ignore:        "pid,hostname",
        messageFormat: "[{module}] {msg}",
      },
    });
  } else {
    targets.push({ target: "pino/file", level: ENV.LOG_LEVEL, options: { destination: 1 } });
  }

  // Loki (si configuré)
  const lokiUrl = process.env["LOKI_URL"];
  if (lokiUrl) {
    targets.push({
      target: "pino-loki",
      level:  ENV.LOG_LEVEL,
      options: {
        host:   lokiUrl,
        labels: { app: "kyc-aml-v2", env: ENV.NODE_ENV },
        batching:         true,
        interval:         5,         // envoyer toutes les 5 secondes
        silenceErrors:    true,       // ne pas crasher si Loki est down
      },
    });
  }

  if (targets.length === 1) return targets[0] as Parameters<typeof pino>[0]["transport"];
  return { targets } as Parameters<typeof pino>[0]["transport"];
}

const _transport = buildTransport();
export const logger = _transport
  ? pino({
      level: ENV.LOG_LEVEL,
      transport: _transport,
      base: { app: "kyc-aml-v2", env: ENV.NODE_ENV },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label: string) => ({ level: label }) },
    })
  : pino({
      level: ENV.LOG_LEVEL,
      base: { app: "kyc-aml-v2", env: ENV.NODE_ENV },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label: string) => ({ level: label }) },
    });

// Logger enfant par module
export function createLogger(module: string) {
  return logger.child({ module });
}

export type Logger = ReturnType<typeof createLogger>;
