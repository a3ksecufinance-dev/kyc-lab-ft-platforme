import { z } from "zod";
import { config } from "dotenv";

config();

// z.coerce.boolean() convertit "false" → true (Boolean("false") === true).
// Ce helper gère correctement les valeurs dotenv "true"/"false"/"1"/"0".
const boolEnv = (defaultVal: boolean) =>
  z.preprocess(
    (v) => {
      if (v === "false" || v === "0" || v === false) return false;
      if (v === "true"  || v === "1" || v === true)  return true;
      return defaultVal;
    },
    z.boolean().default(defaultVal)
  );

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Database
  DATABASE_URL: z.string().url().startsWith("postgresql://", {
    message: "DATABASE_URL doit commencer par postgresql://",
  }),

  // Redis
  REDIS_URL: z.string().url().startsWith("redis://", {
    message: "REDIS_URL doit commencer par redis://",
  }),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, {
    message: "JWT_ACCESS_SECRET doit faire au moins 32 caractères",
  }),
  JWT_REFRESH_SECRET: z.string().min(32, {
    message: "JWT_REFRESH_SECRET doit faire au moins 32 caractères",
  }),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Admin initial
  ADMIN_EMAIL: z.string().email().default("admin@kyc-aml.local"),
  ADMIN_PASSWORD: z.string().min(12, {
    message: "ADMIN_PASSWORD doit faire au moins 12 caractères",
  }).default("ChangeMe!Admin123"),
  ADMIN_NAME: z.string().default("Administrateur"),

  // Screening — listes publiques
  OFAC_SDN_URL:        z.string().url().optional().or(z.literal("").transform(() => undefined)),
  EU_SANCTIONS_URL:    z.string().url().optional().or(z.literal("").transform(() => undefined)),
  UN_SANCTIONS_URL:    z.string().url().optional().or(z.literal("").transform(() => undefined)),
  UK_SANCTIONS_URL:    z.string().url().optional().or(z.literal("").transform(() => undefined)),
  // Liste PPE (Personnes Politiquement Exposées) — OpenSanctions gratuit
  PEP_LIST_URL:        z.string().url().optional().or(z.literal("").transform(() => undefined)),
  // Liste BAM / ANRF (Autorité Nationale du Renseignement Financier — Maroc)
  BAM_SANCTIONS_URL:   z.string().url().optional().or(z.literal("").transform(() => undefined)),
  SCREENING_UPDATE_CRON:       z.string().default("0 2 * * *"),
  SCREENING_MATCH_THRESHOLD:   z.coerce.number().int().min(0).max(100).default(80),
  SCREENING_REVIEW_THRESHOLD:  z.coerce.number().int().min(0).max(100).default(50),
  SCREENING_AUTO_UPDATE:       boolEnv(true),
  // Durée max sans mise à jour avant alerte (heures)
  SCREENING_STALE_THRESHOLD_HOURS: z.coerce.number().int().min(1).max(168).default(36),

  // Screening — provider payant (optionnel)
  WORLDCHECK_API_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  WORLDCHECK_API_KEY: z.string().optional(),

  // Règles AML
  AML_THRESHOLD_SINGLE_TX: z.coerce.number().positive().default(10000),
  AML_THRESHOLD_STRUCTURING: z.coerce.number().positive().default(3000),
  AML_STRUCTURING_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  AML_FREQUENCY_THRESHOLD: z.coerce.number().int().positive().default(10),
  AML_VOLUME_VARIATION_THRESHOLD: z.coerce.number().positive().default(300),

  // ML Scoring Service
  ML_SERVICE_URL:      z.string().url().default("http://kyc_ml:8000"),
  ML_INTERNAL_API_KEY: z.string().min(8).default("dev_ml_key_changeme"),

  // ML Retraining Scheduler
  ML_RETRAIN_AUTO:         boolEnv(true),
  ML_RETRAIN_CRON:         z.string().default("0 3 * * 0"),   // dimanche 03:00 UTC
  ML_RETRAIN_DAYS_HISTORY: z.coerce.number().int().min(30).max(730).default(180),

  // MFA TOTP
  MFA_ENCRYPTION_KEY: z.string().min(32).optional(),

  PII_ENCRYPTION_KEY: z.string().min(32).optional(),

  // HashiCorp Vault (optionnel — fallback sur ENV si absent)
  VAULT_ADDR:  z.string().url().optional().or(z.literal("").transform(() => undefined)),
  VAULT_TOKEN: z.string().optional(),
  VAULT_PATH:  z.string().default("secret/data/kyc-aml"),

  // Email & password reset (Resend.com — gratuit jusqu'à 3000 emails/mois)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM:     z.string().email().optional(),
  APP_URL:        z.string().url().default("http://localhost:5173"),

  // eKYC — provider de vérification d'identité
  EKYC_PROVIDER: z.enum(["local", "onfido", "sumsub"]).default("local"),
  // Onfido (https://documentation.onfido.com)
  ONFIDO_API_TOKEN: z.string().optional(),
  ONFIDO_BASE_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  // Sum Sub (https://docs.sumsub.com)
  SUMSUB_APP_TOKEN: z.string().optional(),
  SUMSUB_SECRET_KEY: z.string().optional(),

  // Webhook CBS entrant
  WEBHOOK_SECRET: z.string().min(16).optional(),

  // Upload & stockage documents
  STORAGE_BACKEND:    z.enum(["local", "s3"]).default("local"),
  UPLOAD_DIR:         z.string().default("./uploads"),
  UPLOAD_MAX_SIZE_MB: z.coerce.number().int().positive().default(10),
  // S3 / MinIO (requis si STORAGE_BACKEND=s3)
  S3_BUCKET:             z.string().optional(),
  S3_REGION:             z.string().default("eu-west-1"),
  S3_ENDPOINT:           z.string().url().optional().or(z.literal("").transform(() => undefined)),
  S3_ACCESS_KEY_ID:      z.string().optional(),
  S3_SECRET_ACCESS_KEY:  z.string().optional(),
  S3_FORCE_PATH_STYLE:   boolEnv(false), // true requis pour MinIO
  S3_SIGNED_URL_EXPIRES: z.coerce.number().int().positive().default(3600), // secondes (1h)

  // Télédéclaration TRACFIN / GoAML
  TRANSMISSION_MODE:   z.enum(["SIMULATION", "TRACFIN_PORTAL", "GOAML_DIRECT", "GOAML_BAM"]).default("SIMULATION"),
  TRACFIN_API_URL:     z.string().url().optional().or(z.literal("").transform(() => undefined)),
  TRACFIN_API_KEY:     z.string().optional(),
  TRACFIN_ENTITY_ID:   z.string().default("SIMU-0000"),
  GOAML_API_URL:       z.string().url().optional().or(z.literal("").transform(() => undefined)),
  // GoAML BAM — Bank Al-Maghrib (OAuth2 client credentials + numérotation séquentielle ANRF)
  GOAML_BAM_URL:           z.string().url().optional().or(z.literal("").transform(() => undefined)),
  GOAML_BAM_CLIENT_ID:     z.string().optional(),
  GOAML_BAM_CLIENT_SECRET: z.string().optional(),
  GOAML_BAM_ENTITY_CODE:   z.string().default("EST"),
  // Identité de l'entité déclarante (obligatoire pour le XML)
  ORG_NAME:            z.string().default("Établissement Financier KYC"),
  ORG_ADDRESS:         z.string().default("1 Rue de la Compliance"),
  ORG_CITY:            z.string().default("Paris"),
  ORG_POSTAL_CODE:     z.string().default("75001"),
  ORG_COUNTRY:         z.string().default("FR"),
  ORG_PHONE:           z.string().default("+33100000000"),
  ORG_EMAIL:           z.string().default("compliance@organisation.fr"),

  // pKYC — Perpetual KYC nightly drift scoring
  PKYC_ENABLED:          boolEnv(true),
  PKYC_CRON:             z.string().default("0 1 * * *"),   // 01:00 UTC chaque nuit
  PKYC_DRIFT_THRESHOLD:  z.coerce.number().int().min(0).max(100).default(40),
  PKYC_BASELINE_DAYS:    z.coerce.number().int().min(7).max(365).default(30),
  PKYC_WINDOW_DAYS:      z.coerce.number().int().min(1).max(30).default(7),

  // Document expiry — vérification nuitière d'expiration des pièces KYC
  DOC_EXPIRY_ENABLED:    boolEnv(true),
  DOC_EXPIRY_CRON:       z.string().default("0 2 * * *"),   // 02:00 UTC chaque nuit
  DOC_EXPIRY_WARN_DAYS:  z.coerce.number().int().min(1).max(180).default(30), // alerter 30j avant

  // CBS Onboarding API — endpoint REST reçu depuis le Core Banking System
  CBS_ONBOARDING_API_KEY: z.string().default("cbs-staging-key-change-me"),
  CBS_AUTH_DISABLED:      boolEnv(false), // true en développement local uniquement

  // Institution type — détermine les fonctionnalités activées au démarrage
  // CLASSIC_BANK = comportement actuel inchangé (défaut)
  // MICROFINANCE  = + wallets, KYC tiers, règles AML cash/agent
  // PAYMENT_INSTITUTION = + wallets, agents, rapports BAM, connecteurs mobiles
  INSTITUTION_TYPE: z.enum(["CLASSIC_BANK", "MICROFINANCE", "PAYMENT_INSTITUTION"]).default("CLASSIC_BANK"),
  INSTITUTION_NAME: z.string().default("Établissement Financier"),

  // Licensing — clé de licence signée HMAC-SHA256
  // Si absent : mode développement (tous les modules activés via INSTITUTION_TYPE)
  // Format : LIC.{base64url(payload)}.{base64url(signature)}
  LICENSE_KEY:            z.string().optional(),
  LICENSE_SIGNING_SECRET: z.string().min(32).optional(),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

  // CORS
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000"),

  // Logs
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Variables d'environnement invalides :");
    result.error.issues.forEach((issue: { path?: PropertyKey[]; message?: string }) => {
      console.error(`  - ${String(issue.path?.join?.(".") ?? "")}: ${String(issue.message ?? "")}`);
    });
    process.exit(1);
  }

  // Vérification supplémentaire : les deux secrets JWT doivent être différents
  const env = result.data;
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    console.error("❌ JWT_ACCESS_SECRET et JWT_REFRESH_SECRET doivent être différents");
    process.exit(1);
  }

  // Avertissement en production si secrets par défaut
  if (env.NODE_ENV === "production") {
    if (env.JWT_ACCESS_SECRET.includes("CHANGE_ME")) {
      console.error("❌ JWT_ACCESS_SECRET non modifié — interdit en production");
      process.exit(1);
    }
    if (env.ADMIN_PASSWORD === "ChangeMe!Admin123") {
      console.error("❌ ADMIN_PASSWORD par défaut — interdit en production");
      process.exit(1);
    }
  }

  return env;
}

export const ENV = validateEnv();

// Types exportés pour usage dans le code
export type Env = typeof ENV;
