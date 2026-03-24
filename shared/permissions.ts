/**
 * Permissions RBAC granulaires — AMLD6 / FATF conforme
 *
 * Principe du moindre privilège : chaque rôle hérite du précédent
 * + des permissions spécifiques à son niveau.
 *
 * Rôles (ordre croissant) :
 *   analyst             → consultation + saisie
 *   supervisor          → validation intermédiaire + escalade
 *   compliance_officer  → approbation finale + déclarations réglementaires
 *   admin               → gestion système (pas de surpassement compliance)
 */

export type Permission =
  // ── Clients ──────────────────────────────────────────────────────────────
  | "customers:read"
  | "customers:create"
  | "customers:update"
  | "customers:delete"
  | "customers:export"
  | "customers:change_risk_level"
  | "customers:assign_analyst"
  // ── Transactions ─────────────────────────────────────────────────────────
  | "transactions:read"
  | "transactions:create"
  | "transactions:block"
  | "transactions:export"
  // ── Alertes ───────────────────────────────────────────────────────────────
  | "alerts:read"
  | "alerts:assign"
  | "alerts:resolve"
  | "alerts:escalate"
  | "alerts:export"
  // ── Dossiers ──────────────────────────────────────────────────────────────
  | "cases:read"
  | "cases:create"
  | "cases:update"
  | "cases:close"
  | "cases:assign"
  // ── Screening ─────────────────────────────────────────────────────────────
  | "screening:run"
  | "screening:review"
  | "screening:manage_lists"
  | "screening:force_refresh"
  | "screening:custom_list"
  // ── Rapports SAR/STR ──────────────────────────────────────────────────────
  | "reports:read"
  | "reports:create"
  | "reports:submit"
  | "reports:approve"
  | "reports:reject"
  | "reports:transmit"           // envoi TRACFIN/GoAML
  | "reports:export_xml"
  | "reports:amld6_stats"        // KPIs AMLD6
  | "reports:amld6_export"       // export réglementaire
  // ── Règles AML ────────────────────────────────────────────────────────────
  | "aml_rules:read"
  | "aml_rules:create"
  | "aml_rules:update"
  | "aml_rules:delete"
  | "aml_rules:toggle"
  // ── Administration ────────────────────────────────────────────────────────
  | "users:read"
  | "users:create"
  | "users:update"
  | "users:delete"
  | "users:change_role"
  | "audit:read"
  | "system:config"
  | "system:mfa_enforce";        // forcer MFA sur les utilisateurs

// ─── Matrice des permissions par rôle ────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {

  analyst: [
    "customers:read", "customers:create", "customers:update",
    "transactions:read", "transactions:create",
    "alerts:read", "alerts:assign",
    "cases:read", "cases:create", "cases:update", "cases:assign",
    "screening:run",
    "reports:read", "reports:create", "reports:submit",
    "aml_rules:read",
  ],

  supervisor: [
    // Hérite de analyst
    "customers:read", "customers:create", "customers:update",
    "customers:change_risk_level", "customers:assign_analyst",
    "transactions:read", "transactions:create", "transactions:block",
    "alerts:read", "alerts:assign", "alerts:resolve", "alerts:escalate",
    "cases:read", "cases:create", "cases:update", "cases:close", "cases:assign",
    "screening:run", "screening:review", "screening:custom_list",
    "reports:read", "reports:create", "reports:submit", "reports:reject",
    "reports:export_xml",
    "aml_rules:read", "aml_rules:create", "aml_rules:update", "aml_rules:toggle",
    "users:read",
    "audit:read",
  ],

  compliance_officer: [
    // Hérite de supervisor
    "customers:read", "customers:create", "customers:update", "customers:export",
    "customers:change_risk_level", "customers:assign_analyst",
    "transactions:read", "transactions:create", "transactions:block", "transactions:export",
    "alerts:read", "alerts:assign", "alerts:resolve", "alerts:escalate", "alerts:export",
    "cases:read", "cases:create", "cases:update", "cases:close", "cases:assign",
    "screening:run", "screening:review", "screening:manage_lists",
    "screening:custom_list", "screening:force_refresh",
    "reports:read", "reports:create", "reports:submit",
    "reports:approve", "reports:reject", "reports:transmit", "reports:export_xml",
    "reports:amld6_stats", "reports:amld6_export",
    "aml_rules:read", "aml_rules:create", "aml_rules:update",
    "aml_rules:delete", "aml_rules:toggle",
    "users:read",
    "audit:read",
  ],

  admin: [
    // Toutes les permissions
    "customers:read", "customers:create", "customers:update",
    "customers:delete", "customers:export",
    "customers:change_risk_level", "customers:assign_analyst",
    "transactions:read", "transactions:create", "transactions:block", "transactions:export",
    "alerts:read", "alerts:assign", "alerts:resolve", "alerts:escalate", "alerts:export",
    "cases:read", "cases:create", "cases:update", "cases:close", "cases:assign",
    "screening:run", "screening:review", "screening:manage_lists",
    "screening:custom_list", "screening:force_refresh",
    "reports:read", "reports:create", "reports:submit",
    "reports:approve", "reports:reject", "reports:transmit", "reports:export_xml",
    "reports:amld6_stats", "reports:amld6_export",
    "aml_rules:read", "aml_rules:create", "aml_rules:update",
    "aml_rules:delete", "aml_rules:toggle",
    "users:read", "users:create", "users:update", "users:delete", "users:change_role",
    "audit:read",
    "system:config", "system:mfa_enforce",
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes(permission);
}

export function getPermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
