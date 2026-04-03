import type { Transaction } from "../../../drizzle/schema";
import { computeAmld6Kpis, kpisToCsv } from "./reports.amld6";
import { generateAmld6Pdf, generateReportPdf, generateKycPdf } from "./reports.pdf";
import { permissionProc } from "../../_core/trpc";
import { z } from "zod";
import { router, analystProc, supervisorProc, complianceProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  listReports,
  getReportOrThrow,
  createSar,
  createStr,
  submitForReview,
  approveAndSubmit,
  rejectReport,
  updateReportContent,
  getReportStats,
} from "./reports.service";
import { updateReport } from "./reports.repository";
import { generateGoAmlXml } from "./reports.goaml";
import { transmitReport, getTransmissionStatus, getTransmissionMode } from "./reports.tracfin";
import { findCustomerById } from "../customers/customers.repository";
import { findTransactionsByCustomer } from "../customers/customers.repository";
import { ENV } from "../../_core/env";

// ─── Schemas Zod ─────────────────────────────────────────────────────────────

const sarContentSchema = z.object({
  subjectDescription:    z.string().min(10),
  suspiciousActivities:  z.array(z.string()).min(1),
  evidenceSummary:       z.string().min(20),
  relatedTransactions:   z.array(z.string()).optional(),
  relatedAlerts:         z.array(z.string()).optional(),
  narrativeSummary:      z.string().min(50),
  recommendedAction:     z.string().optional(),
});

const strContentSchema = z.object({
  transactionId:         z.string(),
  transactionDate:       z.string().datetime(),
  transactionAmount:     z.string(),
  transactionType:       z.string(),
  suspicionBasis:        z.string().min(10),
  involvedParties:       z.array(z.string()).min(1),
  evidenceSummary:       z.string().min(20),
  narrativeSummary:      z.string().min(50),
  relatedTransactions:   z.array(z.string()).optional(),
});

const reportStatusEnum = z.enum(["DRAFT", "REVIEW", "SUBMITTED", "APPROVED", "REJECTED"]);
const reportTypeEnum   = z.enum(["SAR", "STR", "AML_STATISTICS", "RISK_ASSESSMENT", "COMPLIANCE", "CUSTOM"]);

// ─── Router ───────────────────────────────────────────────────────────────────

export const reportsRouter = router({

  /**
   * Liste paginée — analyst+
   */
  list: analystProc
    .input(z.object({
      page:       z.number().int().positive().default(1),
      limit:      z.number().int().min(1).max(100).default(20),
      reportType: reportTypeEnum.optional(),
      status:     reportStatusEnum.optional(),
      customerId: z.number().int().positive().optional(),
      caseId:     z.number().int().positive().optional(),
      dateFrom:   z.string().datetime().optional(),
    }))
    .query(async ({ input }) => {
      return listReports({
        page:   input.page,
        limit:  input.limit,
        ...(input.reportType !== undefined && { reportType: input.reportType }),
        ...(input.status     !== undefined && { status:     input.status }),
        ...(input.customerId !== undefined && { customerId: input.customerId }),
        ...(input.caseId     !== undefined && { caseId:     input.caseId }),
        ...(input.dateFrom   !== undefined && { dateFrom:   new Date(input.dateFrom) }),
      });
    }),

  /**
   * Détail — analyst+
   */
  getById: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => getReportOrThrow(input.id)),

  /**
   * Créer un SAR — analyst+ (brouillon initial)
   */
  createSar: analystProc
    .input(z.object({
      customerId:      z.number().int().positive(),
      caseId:          z.number().int().positive().optional(),
      title:           z.string().min(5).max(300),
      suspicionType:   z.string().min(3),
      amountInvolved:  z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      currency:        z.string().length(3).default("EUR"),
      content:         sarContentSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const report = await createSar(input, ctx.user.id);
      await log({
        action:     "REPORT_CREATED",
        entityType: "report",
        entityId:   report.reportId,
        details:    { reportType: "SAR", customerId: input.customerId },
      });
      return report;
    }),

  /**
   * Créer un STR — analyst+
   */
  createStr: analystProc
    .input(z.object({
      customerId:     z.number().int().positive(),
      caseId:         z.number().int().positive().optional(),
      title:          z.string().min(5).max(300),
      suspicionType:  z.string().min(3),
      amountInvolved: z.string().regex(/^\d+(\.\d{1,2})?$/),
      currency:       z.string().length(3).default("EUR"),
      content:        strContentSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const report = await createStr(input, ctx.user.id);
      await log({
        action:     "REPORT_CREATED",
        entityType: "report",
        entityId:   report.reportId,
        details:    { reportType: "STR", customerId: input.customerId },
      });
      return report;
    }),

  /**
   * Modifier contenu d'un DRAFT ou REJECTED — analyst+
   */
  updateContent: analystProc
    .input(z.object({
      id:             z.number().int().positive(),
      title:          z.string().min(5).max(300).optional(),
      suspicionType:  z.string().min(3).optional(),
      amountInvolved: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      content:        z.union([sarContentSchema, strContentSchema]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const { id, ...patch } = input;
      const report = await updateReportContent(id, patch);
      await log({
        action:     "REPORT_STATUS_CHANGED",
        entityType: "report",
        entityId:   report.reportId,
        details:    { fields: Object.keys(patch) },
      });
      return report;
    }),

  /**
   * Soumettre pour révision DRAFT → REVIEW — analyst+
   */
  submitForReview: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const report = await submitForReview(input.id);
      await log({
        action:     "REPORT_SUBMITTED",
        entityType: "report",
        entityId:   report.reportId,
        details:    {},
      });
      return report;
    }),

  /**
   * Rejeter en révision — supervisor+
   */
  reject: supervisorProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const report = await rejectReport(input.id);
      await log({
        action:     "REPORT_REJECTED",
        entityType: "report",
        entityId:   report.reportId,
        details:    {},
      });
      return report;
    }),

  /**
   * Approuver et envoyer au régulateur REVIEW → SUBMITTED — compliance+
   */
  approve: complianceProc
    .input(z.object({
      id:            z.number().int().positive(),
      regulatoryRef: z.string().max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const report = await approveAndSubmit(input.id, ctx.user.id, input.regulatoryRef);
      await log({
        action:     "REPORT_APPROVED",
        entityType: "report",
        entityId:   report.reportId,
        details:    { regulatoryRef: input.regulatoryRef },
      });
      return report;
    }),

  /**
   * Statistiques globales — analyst+
   */
  stats: analystProc
    .query(async () => getReportStats()),

  // ── Télédéclaration GoAML / TRACFIN ───────────────────────────────────────

  /**
   * Générer et transmettre le XML GoAML au régulateur — compliance+
   * Prérequis : rapport en statut SUBMITTED (approuvé)
   */
  transmit: complianceProc
    .input(z.object({
      id: z.number().int().positive(),
      // Personne physique qui signe la déclaration
      declarantFirstName: z.string().min(2).default("Compliance"),
      declarantLastName:  z.string().min(2).default("Officer"),
      declarantTitle:     z.string().default("Responsable Conformité"),
      declarantPhone:     z.string().default(""),
      declarantEmail:     z.string().email().default("compliance@organisation.fr"),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);

      // Charger le rapport
      const report = await getReportOrThrow(input.id);
      if (report.status !== "SUBMITTED" && report.status !== "APPROVED") {
        throw new Error(
          `Le rapport doit être en statut SUBMITTED ou APPROVED pour la transmission ` +
          `(statut actuel : ${report.status})`
        );
      }

      // Charger le client
      if (!report.customerId) throw new Error("customerId manquant sur le rapport");
      const customer = await findCustomerById(report.customerId);
      if (!customer) throw new Error(`Client #${report.customerId} introuvable`);

      // Charger les transactions liées (jusqu'à 20)
      const allTx = await findTransactionsByCustomer(report.customerId, 20);
      // Filtrer sur les suspicious ou les dernières selon le rapport
      const transactions = allTx.filter((tx: Transaction) => tx.isSuspicious).slice(0, 10);

      // Organisation déclarante depuis les vars d'environnement
      const reportingOrg = {
        id:         ENV.TRACFIN_ENTITY_ID,
        name:       ENV.ORG_NAME,
        type:       "bank",
        country:    ENV.ORG_COUNTRY,
        address:    ENV.ORG_ADDRESS,
        city:       ENV.ORG_CITY,
        postalCode: ENV.ORG_POSTAL_CODE,
        phone:      ENV.ORG_PHONE,
        email:      ENV.ORG_EMAIL,
      };

      const submittedBy = {
        firstName: input.declarantFirstName,
        lastName:  input.declarantLastName,
        title:     input.declarantTitle,
        phone:     input.declarantPhone || ENV.ORG_PHONE,
        email:     input.declarantEmail,
      };

      // Générer le XML GoAML
      const goaml = await generateGoAmlXml({
        report, customer, transactions, reportingOrg, submittedBy,
      });

      // Transmettre
      const result = await transmitReport(report.reportId, goaml.xml, goaml.checksum);

      // Mettre à jour le rapport avec la référence régulateur (sans changer le statut)
      if (result.fiuRefNumber) {
        await updateReport(input.id, { regulatoryRef: result.fiuRefNumber });
      }

      await log({
        action:     "REPORT_SUBMITTED",
        entityType: "report",
        entityId:   report.reportId,
        details: {
          transmissionId: result.transmissionId,
          fiuRefNumber:   result.fiuRefNumber,
          mode:           result.mode,
          status:         result.status,
          xmlSize:        result.xmlSize,
          checksum:       result.xmlChecksum,
        },
      });

      return {
        reportId:       report.reportId,
        transmissionId: result.transmissionId,
        fiuRefNumber:   result.fiuRefNumber,
        status:         result.status,
        mode:           result.mode,
        sentAt:         result.sentAt,
        xmlChecksum:    result.xmlChecksum,
        xmlSize:        result.xmlSize,
      };
    }),

  /**
   * Télécharger le XML GoAML sans transmettre — compliance+
   * Utile pour vérifier avant envoi ou archivage local
   */
  downloadXml: complianceProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const report = await getReportOrThrow(input.id);
      if (!report.customerId) throw new Error("customerId manquant");

      const customer = await findCustomerById(report.customerId);
      if (!customer) throw new Error("Client introuvable");

      const transactions = (await findTransactionsByCustomer(report.customerId, 20))
        .filter((tx: Transaction) => tx.isSuspicious).slice(0, 10);

      const reportingOrg = {
        id: ENV.TRACFIN_ENTITY_ID, name: ENV.ORG_NAME, type: "bank",
        country: ENV.ORG_COUNTRY, address: ENV.ORG_ADDRESS,
        city: ENV.ORG_CITY, postalCode: ENV.ORG_POSTAL_CODE,
        phone: ENV.ORG_PHONE, email: ENV.ORG_EMAIL,
      };

      const goaml = await generateGoAmlXml({
        report, customer, transactions,
        reportingOrg,
        submittedBy: {
          firstName: "Compliance", lastName: "Officer",
          title: "Responsable Conformité",
          phone: ENV.ORG_PHONE, email: ENV.ORG_EMAIL,
        },
      });

      return {
        xml:           goaml.xml,
        checksum:      goaml.checksum,
        reportCode:    goaml.reportCode,
        schemaVersion: goaml.schemaVersion,
        generatedAt:   goaml.generatedAt,
        filename:      `${report.reportId}_GoAML.xml`,
      };
    }),

  /**
   * Statut de la dernière transmission — analyst+
   */
  transmissionStatus: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const report = await getReportOrThrow(input.id);
      const stored = await getTransmissionStatus(report.reportId);
      return {
        reportId:       report.reportId,
        transmissionMode: getTransmissionMode(),
        regulatoryRef:  report.regulatoryRef ?? null,
        lastTransmission: stored ?? null,
      };
    }),

  // ── AMLD6 KPIs ────────────────────────────────────────────────────────────

  amld6Stats: permissionProc("reports:amld6_stats")
    .input(z.object({
      from: z.string().datetime().optional(),
      to:   z.string().datetime().optional(),
    }))
    .query(async ({ input }) => {
      const to   = input.to   ? new Date(input.to)   : new Date();
      const from = input.from ? new Date(input.from)
        : new Date(to.getFullYear(), 0, 1);
      return computeAmld6Kpis({ from, to });
    }),

  amld6ExportCsv: permissionProc("reports:amld6_export")
    .input(z.object({
      from: z.string().datetime().optional(),
      to:   z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const to   = input.to   ? new Date(input.to)   : new Date();
      const from = input.from ? new Date(input.from)
        : new Date(to.getFullYear(), 0, 1);
      const kpis = await computeAmld6Kpis({ from, to });
      const csv  = kpisToCsv(kpis);
      return {
        csv,
        filename: `AMLD6_KPIs_${from.toISOString().slice(0,10)}_${to.toISOString().slice(0,10)}.csv`,
        generatedAt: kpis.generatedAt,
      };
    }),

  /**
   * Export PDF d'un rapport SAR/STR individuel — compliance+
   */
  exportReportPdf: complianceProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const report = await getReportOrThrow(input.id);
      if (!report.customerId) throw new Error("customerId manquant sur le rapport");
      const customer = await findCustomerById(report.customerId);
      if (!customer) throw new Error(`Client #${report.customerId} introuvable`);

      const buffer = await generateReportPdf(report, customer);
      return {
        base64:   buffer.toString("base64"),
        filename: `${report.reportId}_${report.reportType}.pdf`,
        sizeKb:   Math.round(buffer.length / 1024),
      };
    }),

  /**
   * Export PDF fiche KYC client — compliance+
   */
  exportKycPdf: complianceProc
    .input(z.object({ customerId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const customer = await findCustomerById(input.customerId);
      if (!customer) throw new Error(`Client #${input.customerId} introuvable`);

      const transactions = await findTransactionsByCustomer(input.customerId, 50);

      const buffer = await generateKycPdf(customer, transactions);
      const name   = `${customer.lastName}_${customer.firstName}`.replace(/\s+/g, "_");
      return {
        base64:   buffer.toString("base64"),
        filename: `KYC_${name}_${new Date().toISOString().slice(0, 10)}.pdf`,
        sizeKb:   Math.round(buffer.length / 1024),
      };
    }),

  /** Export PDF rapport AMLD6 — compliance+ */
  amld6ExportPdf: permissionProc("reports:amld6_export")
    .input(z.object({
      from: z.string().datetime().optional(),
      to:   z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const to   = input.to   ? new Date(input.to)   : new Date();
      const from = input.from ? new Date(input.from)
        : new Date(to.getFullYear(), 0, 1);
      const kpis   = await computeAmld6Kpis({ from, to });
      const buffer = await generateAmld6Pdf(kpis);
      // Retourner le PDF encodé en base64 (tRPC ne supporte pas les binaires natifs)
      return {
        base64:   buffer.toString("base64"),
        filename: `AMLD6_Rapport_${from.toISOString().slice(0,10)}_${to.toISOString().slice(0,10)}.pdf`,
        sizeKb:   Math.round(buffer.length / 1024),
        generatedAt: kpis.generatedAt,
      };
    }),
});
