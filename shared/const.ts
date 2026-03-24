export const APP_NAME = "KYC-AML Platform";
export const APP_VERSION = "2.0.0";

// Labels UI pour les enums
export const RISK_LEVEL_LABELS = {
  LOW: "Faible",
  MEDIUM: "Moyen",
  HIGH: "Élevé",
  CRITICAL: "Critique",
} as const;

export const KYC_STATUS_LABELS = {
  PENDING: "En attente",
  IN_REVIEW: "En révision",
  APPROVED: "Approuvé",
  REJECTED: "Rejeté",
  EXPIRED: "Expiré",
} as const;

export const ALERT_STATUS_LABELS = {
  OPEN: "Ouvert",
  IN_REVIEW: "En cours",
  ESCALATED: "Escaladé",
  CLOSED: "Fermé",
  FALSE_POSITIVE: "Faux positif",
} as const;

export const CASE_STATUS_LABELS = {
  OPEN: "Ouvert",
  UNDER_INVESTIGATION: "En investigation",
  PENDING_APPROVAL: "En attente d'approbation",
  ESCALATED: "Escaladé",
  CLOSED: "Fermé",
  SAR_SUBMITTED: "SAR soumis",
} as const;

export const USER_ROLE_LABELS = {
  user: "Utilisateur",
  analyst: "Analyste",
  supervisor: "Superviseur",
  compliance_officer: "Responsable Conformité",
  admin: "Administrateur",
} as const;

// Couleurs pour les niveaux de risque
export const RISK_LEVEL_COLORS = {
  LOW: "green",
  MEDIUM: "yellow",
  HIGH: "orange",
  CRITICAL: "red",
} as const;
