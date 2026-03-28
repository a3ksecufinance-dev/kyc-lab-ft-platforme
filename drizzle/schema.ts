import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "user",
  "analyst",
  "supervisor",
  "compliance_officer",
  "admin",
]);

export const customerTypeEnum = pgEnum("customer_type", [
  "INDIVIDUAL",
  "CORPORATE",
  "PEP",
  "FOREIGN",
]);

export const kycStatusEnum = pgEnum("kyc_status", [
  "PENDING",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
]);

export const riskLevelEnum = pgEnum("risk_level", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const sanctionStatusEnum = pgEnum("sanction_status", [
  "CLEAR",
  "MATCH",
  "REVIEW",
  "PENDING",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "PASSPORT",
  "ID_CARD",
  "DRIVING_LICENSE",
  "PROOF_OF_ADDRESS",
  "SELFIE",
  "BANK_STATEMENT",
  "OTHER",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "TRANSFER",
  "DEPOSIT",
  "WITHDRAWAL",
  "PAYMENT",
  "EXCHANGE",
]);

export const channelEnum = pgEnum("channel", [
  "ONLINE",
  "MOBILE",
  "BRANCH",
  "ATM",
  "API",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "PENDING",
  "COMPLETED",
  "FLAGGED",
  "BLOCKED",
  "REVERSED",
]);

export const alertTypeEnum = pgEnum("alert_type", [
  "THRESHOLD",
  "PATTERN",
  "VELOCITY",
  "SANCTIONS",
  "PEP",
  "FRAUD",
  "NETWORK",
]);

export const alertPriorityEnum = pgEnum("alert_priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "OPEN",
  "IN_REVIEW",
  "ESCALATED",
  "CLOSED",
  "FALSE_POSITIVE",
]);

export const caseStatusEnum = pgEnum("case_status", [
  "OPEN",
  "UNDER_INVESTIGATION",
  "PENDING_APPROVAL",
  "ESCALATED",
  "CLOSED",
  "SAR_SUBMITTED",
]);

export const caseSeverityEnum = pgEnum("case_severity", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const caseDecisionEnum = pgEnum("case_decision", [
  "PENDING",
  "CLOSED_NO_ACTION",
  "ESCALATED",
  "SAR_FILED",
  "STR_FILED",
]);

export const screeningTypeEnum = pgEnum("screening_type", [
  "SANCTIONS",
  "PEP",
  "ADVERSE_MEDIA",
]);

export const screeningStatusEnum = pgEnum("screening_status", [
  "CLEAR",
  "MATCH",
  "REVIEW",
  "PENDING",
]);

export const screeningDecisionEnum = pgEnum("screening_decision", [
  "CONFIRMED",
  "DISMISSED",
  "ESCALATED",
  "PENDING",
]);

export const reportTypeEnum = pgEnum("report_type", [
  "SAR",
  "STR",
  "AML_STATISTICS",
  "RISK_ASSESSMENT",
  "COMPLIANCE",
  "CUSTOM",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "DRAFT",
  "REVIEW",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  role: userRoleEnum("role").default("analyst").notNull(),
  department: varchar("department", { length: 100 }),
  isActive: boolean("is_active").default(true).notNull(),
  lastSignedIn: timestamp("last_signed_in"),
  // ─ MFA TOTP ────────────────────────────────────────────────────────────────
  mfaEnabled:     boolean("mfa_enabled").default(false).notNull(),
  mfaSecret:      varchar("mfa_secret", { length: 200 }),       // secret TOTP chiffré
  mfaBackupCodes: jsonb("mfa_backup_codes"),                    // codes de secours hachés
  mfaEnabledAt:   timestamp("mfa_enabled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
  roleIdx: index("users_role_idx").on(t.role),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Customers ────────────────────────────────────────────────────────────────

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id", { length: 50 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  dateOfBirth: varchar("date_of_birth", { length: 20 }),
  nationality: varchar("nationality", { length: 10 }),
  residenceCountry: varchar("residence_country", { length: 10 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  profession: varchar("profession", { length: 200 }),
  employer: varchar("employer", { length: 200 }),
  sourceOfFunds: varchar("source_of_funds", { length: 200 }),
  monthlyIncome: numeric("monthly_income", { precision: 15, scale: 2 }),
  customerType: customerTypeEnum("customer_type").default("INDIVIDUAL").notNull(),
  kycStatus: kycStatusEnum("kyc_status").default("PENDING").notNull(),
  riskLevel: riskLevelEnum("risk_level").default("LOW").notNull(),
  riskScore: integer("risk_score").default(0).notNull(),
  pepStatus: boolean("pep_status").default(false).notNull(),
  sanctionStatus: sanctionStatusEnum("sanction_status").default("PENDING").notNull(),
  lastReviewDate: timestamp("last_review_date"),
  nextReviewDate: timestamp("next_review_date"),
  assignedAnalyst: integer("assigned_analyst").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  customerIdIdx: uniqueIndex("customers_customer_id_idx").on(t.customerId),
  riskLevelIdx: index("customers_risk_level_idx").on(t.riskLevel),
  kycStatusIdx: index("customers_kyc_status_idx").on(t.kycStatus),
  countryIdx: index("customers_country_idx").on(t.residenceCountry),
  createdAtIdx: index("customers_created_at_idx").on(t.createdAt),
}));

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// ─── Documents ────────────────────────────────────────────────────────────────

export const ekycStatusEnum = pgEnum("ekyc_status", [
  "PENDING",   // pas encore analysé
  "PROCESSING",// OCR en cours
  "PASS",      // tous les contrôles OK
  "REVIEW",    // contrôles partiels — révision manuelle requise
  "FAIL",      // contrôles échoués
]);

export const documents = pgTable("documents", {
  id:           serial("id").primaryKey(),
  customerId:   integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  documentType: documentTypeEnum("document_type").notNull(),

  // ─ Fichier ─────────────────────────────────────────────────────────────────
  fileName:     varchar("file_name",  { length: 255 }),
  filePath:     text("file_path"),                        // chemin local ou S3 key
  fileUrl:      text("file_url"),                         // URL publique signée
  fileSize:     integer("file_size"),
  mimeType:     varchar("mime_type",  { length: 100 }),
  storageBackend: varchar("storage_backend", { length: 20 }).default("local"), // "local" | "s3"

  // ─ Métadonnées document ────────────────────────────────────────────────────
  status:         documentStatusEnum("status").default("PENDING").notNull(),
  expiryDate:     varchar("expiry_date",     { length: 20 }),
  documentNumber: varchar("document_number", { length: 100 }),
  issuingCountry: varchar("issuing_country", { length: 10 }),

  // ─ OCR ─────────────────────────────────────────────────────────────────────
  ocrData:        jsonb("ocr_data"),         // champs extraits structurés
  ocrRawText:     text("ocr_raw_text"),      // texte brut complet
  ocrConfidence:  integer("ocr_confidence"), // 0-100 (confiance Tesseract)
  ocrProcessedAt: timestamp("ocr_processed_at"),
  mrzData:        jsonb("mrz_data"),         // données Machine Readable Zone parsées

  // ─ eKYC ────────────────────────────────────────────────────────────────────
  ekycStatus:  ekycStatusEnum("ekyc_status").default("PENDING").notNull(),
  ekycScore:   integer("ekyc_score"),        // 0-100 score de confiance global
  ekycChecks:  jsonb("ekyc_checks"),         // résultat détaillé de chaque contrôle
  ekycProvider: varchar("ekyc_provider", { length: 50 }).default("local"), // "local" | "onfido" | "sumsub"
  ekycProcessedAt: timestamp("ekyc_processed_at"),

  // ─ Révision manuelle ───────────────────────────────────────────────────────
  verifiedBy: integer("verified_by").references(() => users.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at"),
  notes:      text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  customerIdx:  index("documents_customer_idx").on(t.customerId),
  statusIdx:    index("documents_status_idx").on(t.status),
  ekycIdx:      index("documents_ekyc_idx").on(t.ekycStatus),
}));

export type Document    = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// ─── UBOs ─────────────────────────────────────────────────────────────────────

export const ubos = pgTable("ubos", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  nationality: varchar("nationality", { length: 10 }),
  dateOfBirth: varchar("date_of_birth", { length: 20 }),
  ownershipPercentage: numeric("ownership_percentage", { precision: 5, scale: 2 }),
  role: varchar("role", { length: 100 }),
  pepStatus: boolean("pep_status").default(false).notNull(),
  sanctionStatus: sanctionStatusEnum("sanction_status").default("PENDING").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  customerIdx: index("ubos_customer_idx").on(t.customerId),
}));

// ─── Transactions ─────────────────────────────────────────────────────────────

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 50 }).notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("EUR").notNull(),
  transactionType: transactionTypeEnum("transaction_type").notNull(),
  channel: channelEnum("channel").default("ONLINE").notNull(),
  counterparty: varchar("counterparty", { length: 200 }),
  counterpartyCountry: varchar("counterparty_country", { length: 10 }),
  counterpartyBank: varchar("counterparty_bank", { length: 200 }),
  purpose: text("purpose"),
  riskScore: integer("risk_score").default(0).notNull(),
  riskRules: jsonb("risk_rules"),        // règles AML déclenchées (audit)
  status: transactionStatusEnum("status").default("PENDING").notNull(),
  isSuspicious: boolean("is_suspicious").default(false).notNull(),
  flagReason: text("flag_reason"),
  transactionDate: timestamp("transaction_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  txIdIdx: uniqueIndex("transactions_tx_id_idx").on(t.transactionId),
  customerIdx: index("transactions_customer_idx").on(t.customerId),
  statusIdx: index("transactions_status_idx").on(t.status),
  dateIdx: index("transactions_date_idx").on(t.transactionDate),
  suspiciousIdx: index("transactions_suspicious_idx").on(t.isSuspicious),
}));

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ─── Alerts ───────────────────────────────────────────────────────────────────

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  alertId: varchar("alert_id", { length: 50 }).notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  scenario: varchar("scenario", { length: 200 }).notNull(),
  alertType: alertTypeEnum("alert_type").notNull(),
  priority: alertPriorityEnum("priority").default("MEDIUM").notNull(),
  status: alertStatusEnum("status").default("OPEN").notNull(),
  riskScore: integer("risk_score").default(0).notNull(),
  reason: text("reason"),
  enrichmentData: jsonb("enrichment_data"),
  assignedTo: integer("assigned_to").references(() => users.id, { onDelete: "set null" }),
  resolvedBy: integer("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  alertIdIdx: uniqueIndex("alerts_alert_id_idx").on(t.alertId),
  customerIdx: index("alerts_customer_idx").on(t.customerId),
  statusIdx: index("alerts_status_idx").on(t.status),
  priorityIdx: index("alerts_priority_idx").on(t.priority),
  createdAtIdx: index("alerts_created_at_idx").on(t.createdAt),
}));

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

// ─── Cases ────────────────────────────────────────────────────────────────────

export const cases = pgTable("cases", {
  id: serial("id").primaryKey(),
  caseId: varchar("case_id", { length: 50 }).notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  status: caseStatusEnum("status").default("OPEN").notNull(),
  severity: caseSeverityEnum("severity").default("MEDIUM").notNull(),
  assignedTo: integer("assigned_to").references(() => users.id, { onDelete: "set null" }),
  supervisorId: integer("supervisor_id").references(() => users.id, { onDelete: "set null" }),
  linkedAlerts: jsonb("linked_alerts"),   // array d'IDs d'alertes
  findings: text("findings"),
  decision: caseDecisionEnum("decision").default("PENDING").notNull(),
  decisionNotes: text("decision_notes"),
  decisionBy: integer("decision_by").references(() => users.id, { onDelete: "set null" }),
  decisionAt: timestamp("decision_at"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  caseIdIdx: uniqueIndex("cases_case_id_idx").on(t.caseId),
  customerIdx: index("cases_customer_idx").on(t.customerId),
  statusIdx: index("cases_status_idx").on(t.status),
  createdAtIdx: index("cases_created_at_idx").on(t.createdAt),
}));

export type Case = typeof cases.$inferSelect;
export type InsertCase = typeof cases.$inferInsert;

// ─── Case Timeline ────────────────────────────────────────────────────────────

export const caseTimeline = pgTable("case_timeline", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 200 }).notNull(),
  description: text("description"),
  performedBy: integer("performed_by").references(() => users.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  caseIdx: index("case_timeline_case_idx").on(t.caseId),
}));

// ─── Screening Results ────────────────────────────────────────────────────────

export const screeningResults = pgTable("screening_results", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  screeningType: screeningTypeEnum("screening_type").notNull(),
  status: screeningStatusEnum("status").default("PENDING").notNull(),
  matchScore: integer("match_score").default(0).notNull(),
  matchedEntity: varchar("matched_entity", { length: 300 }),
  listSource: varchar("list_source", { length: 200 }),    // OFAC / EU / ONU / World-Check
  confidenceScore: integer("confidence_score").default(0).notNull(),
  details: jsonb("details"),              // données brutes du match
  reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  decision: screeningDecisionEnum("decision").default("PENDING").notNull(),
  decisionReason: text("decision_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  customerIdx: index("screening_customer_idx").on(t.customerId),
  statusIdx: index("screening_status_idx").on(t.status),
  typeIdx: index("screening_type_idx").on(t.screeningType),
}));

export type ScreeningResult = typeof screeningResults.$inferSelect;
export type InsertScreeningResult = typeof screeningResults.$inferInsert;

// ─── Reports ─────────────────────────────────────────────────────────────────

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reportId: varchar("report_id", { length: 50 }).notNull().unique(),
  reportType: reportTypeEnum("report_type").notNull(),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "restrict" }),
  caseId: integer("case_id").references(() => cases.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 300 }).notNull(),
  status: reportStatusEnum("status").default("DRAFT").notNull(),
  suspicionType: varchar("suspicion_type", { length: 200 }),
  amountInvolved: numeric("amount_involved", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 10 }),
  content: jsonb("content"),
  submittedBy: integer("submitted_by").references(() => users.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at"),
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  regulatoryRef: varchar("regulatory_ref", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  reportIdIdx: uniqueIndex("reports_report_id_idx").on(t.reportId),
  statusIdx: index("reports_status_idx").on(t.status),
  typeIdx: index("reports_type_idx").on(t.reportType),
}));

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 200 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("audit_logs_user_idx").on(t.userId),
  entityIdx: index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  actionIdx: index("audit_logs_action_idx").on(t.action),
  createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
}));

// ─── AML Rules dynamiques ─────────────────────────────────────────────────────

export const amlRuleCategoryEnum = pgEnum("aml_rule_category", [
  "THRESHOLD",    // Seuils montants
  "FREQUENCY",    // Fréquence transactions
  "PATTERN",      // Patterns comportementaux (structuring, etc.)
  "GEOGRAPHY",    // Géographie & pays à risque
  "COUNTERPARTY", // Contrepartie suspecte
  "VELOCITY",     // Vélocité & volume
  "CUSTOMER",     // Profil client (PEP, risque)
]);

export const amlRuleStatusEnum = pgEnum("aml_rule_status", [
  "ACTIVE",
  "INACTIVE",
  "TESTING",   // A/B testing — s'exécute mais n'alerte pas
]);

export const amlRules = pgTable("aml_rules", {
  id:           serial("id").primaryKey(),
  ruleId:       varchar("rule_id", { length: 50 }).notNull().unique(),
  name:         varchar("name", { length: 200 }).notNull(),
  description:  text("description"),
  category:     amlRuleCategoryEnum("category").notNull(),
  status:       amlRuleStatusEnum("status").default("ACTIVE").notNull(),

  // Logique de la règle (JSON sérialisé)
  // Permet de définir des conditions sans redéploiement
  conditions:   jsonb("conditions").notNull(),
  // Ex: { "field": "amount", "operator": ">=", "value": 10000 }
  // Ex: { "logic": "AND", "rules": [...] }

  // Scoring & priorité
  baseScore:    integer("base_score").default(50).notNull(),   // 0–100
  priority:     varchar("priority", { length: 10 }).default("MEDIUM").notNull(),
  alertType:    varchar("alert_type", { length: 20 }).default("THRESHOLD").notNull(),

  // Seuils configurables (surcharge les conditions pour les cas simples)
  thresholdValue:   numeric("threshold_value", { precision: 15, scale: 2 }),
  windowMinutes:    integer("window_minutes"),     // Fenêtre temporelle
  countThreshold:   integer("count_threshold"),    // Seuil de comptage

  // Métadonnées
  version:      integer("version").default(1).notNull(),
  createdBy:    integer("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy:    integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  ruleIdIdx:  uniqueIndex("aml_rules_rule_id_idx").on(t.ruleId),
  statusIdx:  index("aml_rules_status_idx").on(t.status),
  categoryIdx: index("aml_rules_category_idx").on(t.category),
}));

export type AmlRule = typeof amlRules.$inferSelect;
export type InsertAmlRule = typeof amlRules.$inferInsert;

// Historique d'exécution des règles — pour le backtesting et le monitoring
export const amlRuleExecutions = pgTable("aml_rule_executions", {
  id:            serial("id").primaryKey(),
  ruleId:        integer("rule_id").notNull().references(() => amlRules.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  customerId:    integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  triggered:     boolean("triggered").default(false).notNull(),
  score:         integer("score").default(0).notNull(),
  details:       jsonb("details"),          // contexte d'exécution
  executionMs:   integer("execution_ms"),   // performance
  createdAt:     timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  ruleIdx:   index("aml_exec_rule_idx").on(t.ruleId),
  txIdx:     index("aml_exec_tx_idx").on(t.transactionId),
  dateIdx:   index("aml_exec_date_idx").on(t.createdAt),
  trigIdx:   index("aml_exec_triggered_idx").on(t.triggered),
}));

export type AmlRuleExecution = typeof amlRuleExecutions.$inferSelect;
// ─────────────────────────────────────────────────────────────────────────────
// PATCH SPRINT 5 — Coller ce bloc dans drizzle/schema.ts
// Position exacte : APRÈS la ligne "export type AmlRuleExecution = ..."
//                   AVANT la ligne "// ─── Relations Drizzle ──────────────────"
// ─────────────────────────────────────────────────────────────────────────────

// ─── Feedback faux positifs — Sprint 5 ───────────────────────────────────────

export const amlRuleFeedback = pgTable("aml_rule_feedback", {
  id:        serial("id").primaryKey(),
  ruleId:    integer("rule_id").notNull().references(() => amlRules.id, { onDelete: "cascade" }),
  userId:    integer("user_id").references(() => users.id, { onDelete: "set null" }),
  type:      varchar("type", { length: 30 }).default("FALSE_POSITIVE").notNull(),
  note:      text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  ruleIdx: index("aml_feedback_rule_idx").on(t.ruleId),
  dateIdx: index("aml_feedback_date_idx").on(t.createdAt),
}));

export type AmlRuleFeedback = typeof amlRuleFeedback.$inferSelect;
// ─── Relations Drizzle ────────────────────────────────────────────────────────

export const customersRelations = relations(customers, ({ many, one }) => ({
  documents: many(documents),
  ubos: many(ubos),
  transactions: many(transactions),
  alerts: many(alerts),
  cases: many(cases),
  screeningResults: many(screeningResults),
  assignedAnalystUser: one(users, { fields: [customers.assignedAnalyst], references: [users.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  customer: one(customers, { fields: [transactions.customerId], references: [customers.id] }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  customer: one(customers, { fields: [alerts.customerId], references: [customers.id] }),
  transaction: one(transactions, { fields: [alerts.transactionId], references: [transactions.id] }),
  assignedUser: one(users, { fields: [alerts.assignedTo], references: [users.id] }),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  customer: one(customers, { fields: [cases.customerId], references: [customers.id] }),
  assignedUser: one(users, { fields: [cases.assignedTo], references: [users.id] }),
  timeline: many(caseTimeline),
}));
