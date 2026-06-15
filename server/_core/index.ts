import "./env"; // Validation vars d'env en premier
import { assertPiiEncryptionReady } from "./pii";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "./context";
import { appRouter } from "../routers";
import { checkDbHealth, closeDb } from "./db";
import { checkRedisHealth, closeRedis, redis } from "./redis";
import { createLogger } from "./logger";
import { ENV } from "./env";
import { startSanctionsScheduler, stopSanctionsScheduler } from "../modules/screening/screening.scheduler";
import { startMlRetrainScheduler, stopMlRetrainScheduler } from "../modules/aml/ml-retrain.scheduler";
import { startPkycScheduler, stopPkycScheduler }           from "../modules/customers/pkyc.scheduler";
import { startSlaScheduler, stopSlaScheduler }             from "../modules/sla/sla.scheduler";
import { handleTransactionWebhook } from "../modules/transactions/transactions.webhook";
import {
  handleOrangeMoney,
  handleWave,
  handleCihMobile,
} from "../modules/connectors/mobile-connectors.webhook";
import { uploadAndProcessDocument } from "../modules/documents/documents.service";
import { verifyAccessToken }         from "../modules/auth/auth.service";
import { checkS3Health, validateStorageConfig } from "./upload";
import multerPkg from "multer";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const log = createLogger("server");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Trust le premier proxy (nginx) pour lire X-Forwarded-For et X-Real-IP
app.set("trust proxy", 1);

// ─── Métriques Prometheus (optionnel) ────────────────────────────────────────

// eslint-disable-next-line no-useless-assignment
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

const rawCorsOrigins = ENV.CORS_ORIGINS.split(",").map((o) => o.trim());
// CORS_ORIGINS=* est interdit en production — uniquement dev/staging
const corsWildcard = rawCorsOrigins.includes("*");
if (corsWildcard && ENV.NODE_ENV === "production") {
  log.error("⛔  ERREUR FATALE : CORS_ORIGINS=* est interdit en production. " +
    "Définissez les origines autorisées explicitement (ex: https://app.votre-domaine.fr).");
  process.exit(1);
}
app.use((req, res, next): void => {
  const origin = req.headers.origin;
  if (origin && (corsWildcard || rawCorsOrigins.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", corsWildcard ? "*" : origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (!corsWildcard) res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});

// CSRF: Not applicable — API uses Bearer token auth (not cookies).
// Browsers cannot automatically attach Authorization headers cross-origin.

// ─── Security headers ─────────────────────────────────────────────────────────

app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "));
  if (ENV.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// ─── Rate limiting global ─────────────────────────────────────────────────────
//
//  3 niveaux de protection :
//  1. Global  : 200 req/min par IP (contre le scraping/bruteforce général)
//  2. API     : 100 req/min par IP sur /trpc (configurable via ENV)
//  3. Upload  : 20 req/min par IP sur /api/documents/upload (coûteux côté serveur)
//
// ─────────────────────────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Trop de requêtes — réessayez dans une minute" },
  skip: (req) => req.path === "/health" || req.path === "/metrics",
});

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max:      ENV.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Limite API dépassée — réessayez dans une minute" },
});

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Trop d'uploads — réessayez dans une minute" },
});

app.use(globalLimiter);
app.use("/trpc", apiLimiter);
app.use("/api/documents/upload", uploadLimiter);

// Rate limit sensitive auth operations
const sensitiveAuthLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives — réessayez dans 15 minutes" },
});

app.use("/trpc/auth.refresh", sensitiveAuthLimiter);
app.use("/trpc/auth.requestReset", sensitiveAuthLimiter);
app.use("/trpc/auth.confirmReset", sensitiveAuthLimiter);

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

// ─── WEBHOOKS MOBILE MONEY ────────────────────────────────────────────────────
//  Même contrainte : ces routes sont enregistrées AVANT express.json() pour
//  que express.raw() puisse capturer le body brut nécessaire à la vérification HMAC.
// ─────────────────────────────────────────────────────────────────────────────

for (const [path, handler] of [
  ["/webhooks/mobile/orange", handleOrangeMoney],
  ["/webhooks/mobile/wave",   handleWave],
  ["/webhooks/mobile/cih",    handleCihMobile],
] as const) {
  app.post(path, express.raw({ type: "*/*" }), async (req, res) => {
    const buf: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : "{}");
    (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    await handler(req, res);
  });
}

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
  const [db, redisHealth, s3] = await Promise.all([
    checkDbHealth(),
    checkRedisHealth(),
    checkS3Health(),
  ]);

  _dbConnected?.set(db.status === "healthy" ? 1 : 0);
  _redisConnected?.set(redisHealth.status === "healthy" ? 1 : 0);

  const healthy = db.status === "healthy" && redisHealth.status === "healthy";

  res.status(healthy ? 200 : 503).json({
    status:    healthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    services:  { database: db, redis: redisHealth, storage: s3 },
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

const multer: any = multerPkg ?? {
  memoryStorage: () => ({}),
  single: () => (_: unknown, __: unknown, next: () => void) => next(),
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

// ─── Contact landing page (public — pas d'auth) ──────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

app.post("/api/contact", async (req, res): Promise<void> => {
  const { firstName, lastName, email, company, type, phone } = req.body ?? {};

  if (!firstName || !lastName || !email || !company) {
    res.status(400).json({ error: "Champs obligatoires manquants" }); return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: "Email invalide" }); return;
  }

  const { sendEmail } = await import("./mailer");
  await sendEmail({
    to: "a.bensleten@cyberstrat.ma",
    subject: `[WatchReg] Nouvelle demande de démo — ${escapeHtml(company)}`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f8faf8;border-radius:12px;">
        <div style="background:#1B5E20;padding:20px 24px;border-radius:8px;margin-bottom:24px;">
          <h2 style="color:#fff;margin:0;font-size:20px;">Nouvelle demande de démo — WatchReg</h2>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#555;font-size:14px;width:40%">Prénom</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0d1b0d">${escapeHtml(firstName)}</td></tr>
          <tr><td style="padding:8px 0;color:#555;font-size:14px;">Nom</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0d1b0d">${escapeHtml(lastName)}</td></tr>
          <tr><td style="padding:8px 0;color:#555;font-size:14px;">Email</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#1B5E20"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding:8px 0;color:#555;font-size:14px;">Établissement</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0d1b0d">${escapeHtml(company)}</td></tr>
          <tr><td style="padding:8px 0;color:#555;font-size:14px;">Type</td><td style="padding:8px 0;font-size:14px;color:#0d1b0d">${escapeHtml(type ?? "—")}</td></tr>
          <tr><td style="padding:8px 0;color:#555;font-size:14px;">Téléphone</td><td style="padding:8px 0;font-size:14px;color:#0d1b0d">${escapeHtml(phone ?? "—")}</td></tr>
        </table>
        <div style="margin-top:24px;padding:16px;background:#E8F5E9;border-radius:8px;font-size:13px;color:#2E7D32;">
          Répondre directement à <strong>${escapeHtml(email)}</strong> pour planifier la démo.
        </div>
      </div>
    `,
  });

  res.json({ success: true });
});

// ─── Fichiers statiques — uploads locaux ─────────────────────────────────────

const uploadsDir = path.resolve(ENV.UPLOAD_DIR);
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// ─── Frontend static (production uniquement) ──────────────────────────────────

if (ENV.NODE_ENV === "production") {
  // En prod le bundle serveur est dist/index.js → __dirname = dist/
  // Vite build outDir = dist/public → path.join(__dirname, "public")
  const publicDir = path.join(__dirname, "public");
  app.use(express.static(publicDir));
  app.get("*", (_, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// ─── Démarrage ────────────────────────────────────────────────────────────────

async function start() {
  // Vérifier le chiffrement PII (fatal en prod si clé absente)
  assertPiiEncryptionReady();

  // Valider la config de stockage avant de démarrer (échoue si S3 inaccessible)
  await validateStorageConfig();

  await redis.connect();

  // Initialiser la hash chain audit depuis le dernier enregistrement
  const { initAuditHashChain } = await import("./audit");
  await initAuditHashChain();
  startSanctionsScheduler();
  startMlRetrainScheduler();
  startPkycScheduler();
  startSlaScheduler();

  const server = app.listen(ENV.PORT, () => {
    log.info(`🚀 KYC-AML v2 démarré sur http://localhost:${ENV.PORT}`);
    log.info(`   Environnement : ${ENV.NODE_ENV}`);
    log.info(`   tRPC          : http://localhost:${ENV.PORT}/trpc`);
    log.info(`   Health        : http://localhost:${ENV.PORT}/health`);
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Arrêt gracieux en cours...");
    stopSanctionsScheduler();
    stopMlRetrainScheduler();
    stopPkycScheduler();
    stopSlaScheduler();
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

// ─── Sécurité Node.js 22 — éviter crash sur rejet non géré ──────────────────
process.on("unhandledRejection", (reason) => {
  log.error({ reason }, "Unhandled promise rejection — ignoré pour éviter crash");
});
process.on("uncaughtException", (err) => {
  log.error({ err }, "Uncaught exception — ignoré pour éviter crash");
});

start().catch((err) => {
  log.fatal({ err }, "Échec démarrage serveur");
  process.exit(1);
});

export type { AppRouter } from "../routers";
