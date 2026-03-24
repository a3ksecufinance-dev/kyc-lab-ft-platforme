import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../drizzle/schema";
import { ENV } from "./env";
import { createLogger } from "./logger";

const log = createLogger("database");

// Pool de connexions PostgreSQL
const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
  max: ENV.NODE_ENV === "production" ? 20 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // En production, SSL obligatoire
  ...(ENV.NODE_ENV === "production" && {
    ssl: { rejectUnauthorized: true },
  }),
});

pool.on("error", (err) => {
  log.error({ err }, "Erreur inattendue sur le pool PostgreSQL");
});

pool.on("connect", () => {
  log.debug("Nouvelle connexion PostgreSQL établie");
});

// Instance Drizzle avec le schema complet
export const db = drizzle(pool, {
  schema,
  logger: ENV.NODE_ENV === "development"
    ? {
        logQuery: (query, params) => {
          log.trace({ query, params }, "SQL Query");
        },
      }
    : false,
});

export type Db = typeof db;

// Health check pour le endpoint /health
export async function checkDbHealth(): Promise<{ status: "healthy" | "unhealthy"; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { status: "healthy", latency: Date.now() - start };
  } catch (err) {
    return {
      status: "unhealthy",
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : "Connexion impossible",
    };
  }
}

// Fermeture gracieuse
export async function closeDb(): Promise<void> {
  await pool.end();
  log.info("Pool PostgreSQL fermé");
}
