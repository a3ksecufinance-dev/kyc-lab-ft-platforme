// ─── Types partagés frontend/backend ─────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type KycStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED";
export type AlertPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertStatus = "OPEN" | "IN_REVIEW" | "ESCALATED" | "CLOSED" | "FALSE_POSITIVE";
export type CaseStatus = "OPEN" | "UNDER_INVESTIGATION" | "PENDING_APPROVAL" | "ESCALATED" | "CLOSED" | "SAR_SUBMITTED";
export type ScreeningType = "SANCTIONS" | "PEP" | "ADVERSE_MEDIA";
export type ReportType = "SAR" | "STR" | "AML_STATISTICS" | "RISK_ASSESSMENT" | "COMPLIANCE" | "CUSTOM";
export type UserRole = "user" | "analyst" | "supervisor" | "compliance_officer" | "admin";
