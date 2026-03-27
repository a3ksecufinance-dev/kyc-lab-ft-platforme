import "./env"; // Validation vars d'env en premier
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "./context";
import { appRouter } from "../routers";
import { checkDbHealth, closeDb } from "./db";
import { checkRedisHealth, closeRedis, redis } from "./redis";
import { createLogger } from "./logger";
import { ENV } from "./env";
import { startSanctionsScheduler, stopSanctionsScheduler } from "../modules/screening/screening.scheduler";
import { handleTransactionWebhook } from "../modules/transactions/transactions.webhook";
import { uploadAndProcessDocument } from "../modules/documents/documents.service";
import { verifyAccessToken } from "../modules/auth/auth.service";
// @ts-ignore — pnpm add multer @types/multer si documents upload utilisé
import multerPkg from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const log = createLogger("server");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ─── Métriques Prometheus (optionnel) ────────────────────────────────────────

let _metricsMiddleware: ((req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void) | null = null;
let _metricsRegistry: { contentType: string; metrics: () => Promise<string> } | null = null;
let _dbConnected: { set: (v: number) => void } | null = null;
let _redisConnected: { set: (v: number) => void } | null = null;
try {
  const m = await import("./metrics").catch(() => null);
  if (m) {
    _metricsMiddleware = m.metricsMiddleware;
    _metricsRegistry   = m.metricsRegistry;
    _dbConnected       = m.dbConnected;
    _redisConnected    = m.redisConnected;
    app.use(_metricsMiddleware!);
  }
} catch { /* prom-client non installé — métriques désactivées */ }

// ─── CORS ────────────────────────────────────────────────────────────────────

const allowedOrigins = ENV.CORS_ORIGINS.split(",").map((o) => o.trim());
app.use((req, res, next): void => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});

// ─── Security headers ─────────────────────────────────────────────────────────

app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ─── WEBHOOK CBS ─────────────────────────────────────────────────────────────
//
//  ⚠️  CE BLOC DOIT RESTER AVANT app.use(express.json())
//
//  Raison : express.json() consomme le body stream (req) de façon irréversible.
//  Le webhook a besoin du body brut (Buffer) pour vérifier la signature HMAC.
//  express.raw() sur cette route intercepte le body AVANT express.json() global.
//
// ─────────────────────────────────────────────────────────────────────────────

app.post(
  "/webhooks/transaction",
  express.raw({ type: "*/*" }),          // capture le body brut en Buffer
  async (req, res) => {
    // req.body est un Buffer grâce à express.raw()
    const buf: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : "{}");
    (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    await handleTransactionWebhook(req, res);
  }
);

// ─── express.json() GLOBAL ───────────────────────────────────────────────────
//
//  Placé ICI — après le webhook, avant tRPC et les autres routes REST.
//  tRPC utilise ce parser pour désérialiser les mutations/queries.
//  Le webhook ci-dessus n'est pas affecté car sa route est déjà enregistrée.
//
// ─────────────────────────────────────────────────────────────────────────────

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", async (_, res) => {
  const [db, redisHealth] = await Promise.all([
    checkDbHealth(),
    checkRedisHealth(),
  ]);

  _dbConnected?.set(db.status === "healthy" ? 1 : 0);
  _redisConnected?.set(redisHealth.status === "healthy" ? 1 : 0);

  const healthy = db.status === "healthy" && redisHealth.status === "healthy";

  res.status(healthy ? 200 : 503).json({
    status:    healthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    services:  { database: db, redis: redisHealth },
    version:   "2.0.0",
    env:       ENV.NODE_ENV,
  });
});

// ─── Métriques Prometheus ─────────────────────────────────────────────────────

app.get("/metrics", async (_, res) => {
  if (!_metricsRegistry) {
    res.status(503).send("# Prometheus metrics not available\n");
    return;
  }
  res.set("Content-Type", _metricsRegistry.contentType);
  res.end(await _metricsRegistry.metrics());
});

// ─── tRPC ─────────────────────────────────────────────────────────────────────

app.use(
  "/trpc",
  createExpressMiddleware({
    router:        appRouter,
    createContext,
    onError({ path, error }) {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        log.error({ path, error }, "Erreur interne tRPC");
      }
    },
  })
);

// ─── Upload documents (REST multipart) ───────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const multer: any = multerPkg ?? {
  memoryStorage: () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  single: () => (_: any, __: any, next: any) => next(),
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: (ENV.UPLOAD_MAX_SIZE_MB ?? 10) * 1024 * 1024 },
});

app.post(
  "/api/documents/upload",
  upload.single("file"),
  async (req, res): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token manquant" }); return;
    }
    const user = await verifyAccessToken(authHeader.slice(7)).catch(() => null);
    if (!user) { res.status(401).json({ error: "Token invalide" }); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req as any;
    if (!r.file) { res.status(400).json({ error: "Fichier manquant" }); return; }

    const customerId   = parseInt((r.body?.["customerId"]   ?? "") as string);
    const documentType = (r.body?.["documentType"] ?? "OTHER") as string;

    if (!customerId || isNaN(customerId)) {
      res.status(400).json({ error: "customerId requis" }); return;
    }

    try {
      const doc = await uploadAndProcessDocument({
        customerId,
        documentType,
        buffer:       r.file.buffer,
        originalName: r.file.originalname,
        mimeType:     r.file.mimetype,
        size:         r.file.size,
      });
      res.json({ success: true, document: doc });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur upload";
      res.status(400).json({ error: msg });
    }
  }
);

// ─── Fichiers statiques — uploads locaux ─────────────────────────────────────

const uploadsDir = path.resolve(ENV.UPLOAD_DIR);
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// ─── Frontend static (production uniquement) ──────────────────────────────────

if (ENV.NODE_ENV === "production") {
  const publicDir = path.join(__dirname, "../../public");
  app.use(express.static(publicDir));
  app.get("*", (_, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// ─── Démarrage ────────────────────────────────────────────────────────────────

async function start() {
  await redis.connect();
  startSanctionsScheduler();

  const server = app.listen(ENV.PORT, () => {
    log.info(`🚀 KYC-AML v2 démarré sur http://localhost:${ENV.PORT}`);
    log.info(`   Environnement : ${ENV.NODE_ENV}`);
    log.info(`   tRPC          : http://localhost:${ENV.PORT}/trpc`);
    log.info(`   Health        : http://localhost:${ENV.PORT}/health`);
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Arrêt gracieux en cours...");
    stopSanctionsScheduler();
    server.close(async () => {
      await Promise.all([closeDb(), closeRedis()]);
      log.info("Serveur arrêté proprement");
      process.exit(0);
    });
    setTimeout(() => {
      log.error("Forçage de l'arrêt après timeout");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

start().catch((err) => {
  log.fatal({ err }, "Échec démarrage serveur");
  process.exit(1);
});

export type { AppRouter } from "../routers";
