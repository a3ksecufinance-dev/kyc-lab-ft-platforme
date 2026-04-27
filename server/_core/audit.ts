import { db } from "./db";
import { auditLogs } from "../../drizzle/schema";
import { createLogger } from "./logger";

const log = createLogger("audit");

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditAction =
  // Auth
  | "AUTH_LOGIN"
  | "AUTH_LOGOUT"
  | "AUTH_REFRESH"
  | "AUTH_LOGIN_FAILED"
  | "AUTH_PASSWORD_CHANGED"
  | "AUTH_MFA_ENABLED"
  | "AUTH_MFA_DISABLED"
  | "AUTH_MFA_BACKUP_REGENERATED"
  | "AUTH_MFA_VERIFY_FAILED"
  // Customers
  | "CUSTOMER_CREATED"
  | "CUSTOMER_UPDATED"
  | "CUSTOMER_KYC_STATUS_CHANGED"
  | "CUSTOMER_RISK_LEVEL_CHANGED"
  | "CUSTOMER_RISK_SCORE_CALCULATED"
  // Documents
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_VERIFIED"
  | "DOCUMENT_REJECTED"
  // UBOs
  | "UBO_ADDED"
  | "UBO_UPDATED"
  // Transactions
  | "TRANSACTION_CREATED"
  | "TRANSACTION_FLAGGED"
  | "TRANSACTION_BLOCKED"
  // AML
  | "AML_RULE_TRIGGERED"
  | "AML_ALERT_CREATED"
  // Alerts
  | "ALERT_STATUS_CHANGED"
  | "ALERT_ASSIGNED"
  | "ALERT_ESCALATED"
  | "ALERT_CLOSED"
  | "ALERT_FALSE_POSITIVE"
  // Screening
  | "SCREENING_RUN"
  | "SCREENING_MATCH_FOUND"
  | "SCREENING_DECISION_CONFIRMED"
  | "SCREENING_DECISION_DISMISSED"
  | "SCREENING_DECISION_ESCALATED"
  // Cases
  | "CASE_CREATED"
  | "CASE_STATUS_CHANGED"
  | "CASE_ASSIGNED"
  | "CASE_DECISION_MADE"
  | "CASE_ESCALATED"
  // Reports
  | "REPORT_CREATED"
  | "REPORT_STATUS_CHANGED"
  | "REPORT_SUBMITTED"
  | "REPORT_APPROVED"
  | "REPORT_REJECTED"
  | "REPORT_ANRF_UPDATED"
  // Admin
  | "USER_ROLE_CHANGED"
  | "USER_DEACTIVATED"
  | "SYSTEM_HEALTH_CHECKED"
  | "MFA_ADMIN_RESET"
  // ML
  | "ML_RETRAIN_TRIGGERED"
  // Dual Control / Approvals (F6)
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED"
  // Correspondent Banking (F1)
  | "CORRESPONDENT_CREATED"
  | "CORRESPONDENT_ASSESSED"
  | "CORRESPONDENT_APPROVED"
  | "CORRESPONDENT_SUSPENDED";

export type EntityType =
  | "user"
  | "customer"
  | "document"
  | "ubo"
  | "transaction"
  | "alert"
  | "case"
  | "screening"
  | "report"
  | "aml_rule"
  | "system"
  | "approval"
  | "correspondent_bank";

export interface AuditEntry {
  userId?: number | null;
  action: AuditAction;
  entityType: EntityType;
  entityId?: string | number | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Enregistre une entrée d'audit.
 * Ne throw JAMAIS — une erreur d'audit ne doit pas bloquer une opération métier.
 * En cas d'échec DB, log l'erreur et continue.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ? String(entry.entityId) : null,
      details: entry.details ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    });
  } catch (err) {
    // Log l'erreur mais ne bloque pas l'opération métier
    log.error({ err, entry }, "Échec écriture audit log — CRITIQUE : action non tracée");
  }
}

/**
 * Normalise les adresses IPv4-mapped IPv6 (::ffff:x.x.x.x → x.x.x.x)
 * produites quand Express tourne derrière un reverse proxy Docker/nginx.
 */
function normalizeIp(ip?: string | null): string | null {
  if (!ip) return null;
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

/**
 * Audit helper pour les mutations tRPC — extrait IP et userAgent du contexte
 */
export function createAuditFromContext(
  ctx: { user?: { id?: number } | null; req?: { ip?: string | null | undefined; headers?: Record<string, string | string[] | undefined>; } }
) {
  const rawIp = ctx.req?.ip
    ?? (ctx.req?.headers?.["x-real-ip"] as string | undefined)
    ?? (ctx.req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? null;
  return (entry: Omit<AuditEntry, "userId" | "ipAddress" | "userAgent">) =>
    audit({
      ...entry,
      userId: ctx.user?.id ?? null,
      ipAddress: normalizeIp(rawIp),
      userAgent: ((ctx.req?.headers?.["user-agent"]) as string | undefined) ?? null,
    } satisfies AuditEntry);
}
