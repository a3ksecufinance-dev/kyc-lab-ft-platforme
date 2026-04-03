/**
 * Export PDF rapport AMLD6 — pdfmake (pur Node.js, sans Chromium)
 *
 * Génère un PDF signé conforme au format de rapport de conformité AMLD6 :
 *   - Page de garde avec logo texte, période, entité
 *   - Résumé exécutif (score global, violations SLA, alertes à traiter)
 *   - Sections pour chaque catégorie de KPIs avec tableaux
 *   - Pied de page avec date de génération + confidentiel
 */

import type { Amld6KpiResult } from "./reports.amld6";
import type { Report, Customer, Transaction } from "../../../drizzle/schema";
import { createLogger } from "../../_core/logger";

const log = createLogger("reports-pdf");

// ─── Helpers formatage ────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("fr-FR");
}
function fmtEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(n);
}
function fmtPct(n: number): string {
  return `${n.toFixed(1)} %`;
}
function fmtDays(n: number): string {
  return `${n.toFixed(1)} j`;
}
function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

// ─── Couleurs AMLD6 ───────────────────────────────────────────────────────────

const COLORS = {
  primary:    "#0d1117",
  secondary:  "#161b22",
  border:     "#21262d",
  text:       "#e6edf3",
  muted:      "#7d8590",
  blue:       "#1f6feb",
  green:      "#2ea043",
  amber:      "#d29922",
  red:        "#f85149",
  white:      "#ffffff",
};

// ─── Générateur PDF ───────────────────────────────────────────────────────────

export async function generateAmld6Pdf(kpis: Amld6KpiResult): Promise<Buffer> {
  // Import dynamique pdfmake (lourd — charger seulement si nécessaire)
  const pdfMake   = (await import("pdfmake/build/pdfmake")).default;
  const vfsFonts  = (await import("pdfmake/build/vfs_fonts")).default;

  // pdfmake a besoin du VFS pour les polices
  (pdfMake as unknown as { vfs: unknown }).vfs = (vfsFonts as unknown as { pdfMake: { vfs: unknown } }).pdfMake.vfs;

  const orgName   = process.env["ORG_NAME"] ?? "Établissement Financier";
  const periodStr = `${fmtDate(kpis.period.from)} — ${fmtDate(kpis.period.to)}`;
  const genDate   = fmtDate(kpis.generatedAt);

  // ─── Sections KPI ─────────────────────────────────────────────────────────

  function kpiTable(rows: [string, string, string?][]) {
    return {
      table: {
        widths: ["*", "auto", "auto"],
        body: [
          [
            { text: "Indicateur",  style: "tableHeader" },
            { text: "Valeur",      style: "tableHeader", alignment: "right" },
            { text: "Unité",       style: "tableHeader", alignment: "center" },
          ],
          ...rows.map(([label, value, unit]) => [
            { text: label,  style: "tableCell" },
            { text: value,  style: "tableCellRight", alignment: "right" },
            { text: unit ?? "", style: "tableCellMuted", alignment: "center" },
          ]),
        ],
      },
      layout: {
        fillColor: (i: number) => i === 0 ? COLORS.secondary : i % 2 === 0 ? "#f6f8fa" : COLORS.white,
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => COLORS.border,
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
      margin: [0, 4, 0, 16],
    };
  }

  function sectionTitle(title: string) {
    return {
      columns: [
        { canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 16, color: COLORS.blue, r: 1 }], width: 8 },
        { text: title, style: "sectionTitle", margin: [4, 0, 0, 0] },
      ],
      margin: [0, 16, 0, 8],
    };
  }

  // ─── Violations SLA ────────────────────────────────────────────────────────

  const slaViolations = kpis.compliance.alertSlaBreaches;
  const kycCoverage   = kpis.customers.kycCoverage;
  const mfaRate       = kpis.compliance.mfaAdoptionRate;

  const violations: string[] = [];
  if (slaViolations > 0) violations.push(`${slaViolations} alerte(s) dépassent le SLA de 5 jours ouvrés (AMLD6 Art. 35)`);
  if (kycCoverage < 80)  violations.push(`Couverture KYC à ${fmtPct(kycCoverage)} — objectif : 100 % (AMLD5 Art. 13)`);
  if (mfaRate < 80)      violations.push(`Taux MFA à ${fmtPct(mfaRate)} — recommandation EBA : 100 %`);

  // ─── Document pdfmake ──────────────────────────────────────────────────────

  const dd = {
    pageSize:    "A4",
    pageMargins: [50, 60, 50, 60],

    styles: {
      cover:         { fontSize: 28, bold: true, color: COLORS.primary },
      coverSub:      { fontSize: 13, color: COLORS.muted, margin: [0, 4, 0, 0] },
      coverMeta:     { fontSize: 11, color: COLORS.muted, margin: [0, 2, 0, 0] },
      sectionTitle:  { fontSize: 13, bold: true, color: COLORS.primary },
      tableHeader:   { fontSize: 10, bold: true, color: COLORS.white, fillColor: COLORS.primary },
      tableCell:     { fontSize: 10, color: COLORS.primary },
      tableCellRight:{ fontSize: 10, bold: true, color: COLORS.primary },
      tableCellMuted:{ fontSize: 9, color: COLORS.muted },
      alert:         { fontSize: 10, color: COLORS.red, margin: [0, 2, 0, 2] },
      footer:        { fontSize: 8, color: COLORS.muted },
    },

    header: (currentPage: number) => currentPage === 1 ? {} : {
      columns: [
        { text: `Rapport AMLD6 — ${orgName}`, style: "footer", margin: [50, 20, 0, 0] },
        { text: `Page ${currentPage}`, style: "footer", alignment: "right", margin: [0, 20, 50, 0] },
      ],
    },

    footer: () => ({
      columns: [
        { text: `Généré le ${genDate} — CONFIDENTIEL`, style: "footer", margin: [50, 0, 0, 0] },
        { text: "Document à usage interne — Compliance", style: "footer", alignment: "right", margin: [0, 0, 50, 0] },
      ],
    }),

    content: [

      // ── Page de garde ──────────────────────────────────────────────────────
      { text: "RAPPORT DE CONFORMITÉ", style: "cover", margin: [0, 60, 0, 0] },
      { text: "6ème Directive Anti-Blanchiment (AMLD6)", style: "coverSub" },
      { text: orgName, style: "coverSub", bold: true },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: COLORS.border }], margin: [0, 20, 0, 20] },
      { text: `Période : ${periodStr}`, style: "coverMeta" },
      { text: `Généré le : ${genDate}`, style: "coverMeta" },
      { text: "CONFIDENTIEL — Document à usage interne", style: "coverMeta", color: COLORS.red },
      { text: "", pageBreak: "after" },

      // ── Résumé exécutif ────────────────────────────────────────────────────
      sectionTitle("RÉSUMÉ EXÉCUTIF"),
      {
        table: {
          widths: ["*", "*", "*"],
          body: [[
            {
              stack: [
                { text: fmtNum(kpis.transactions.total), fontSize: 22, bold: true, color: COLORS.blue },
                { text: "Transactions analysées", fontSize: 9, color: COLORS.muted },
              ],
              margin: [8, 8, 8, 8],
            },
            {
              stack: [
                { text: fmtNum(kpis.alerts.total), fontSize: 22, bold: true, color: COLORS.amber },
                { text: "Alertes générées", fontSize: 9, color: COLORS.muted },
              ],
              margin: [8, 8, 8, 8],
            },
            {
              stack: [
                { text: String(violations.length), fontSize: 22, bold: true, color: violations.length > 0 ? COLORS.red : COLORS.green },
                { text: "Points d'attention réglementaires", fontSize: 9, color: COLORS.muted },
              ],
              margin: [8, 8, 8, 8],
            },
          ]],
        },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => COLORS.border, vLineColor: () => COLORS.border },
        margin: [0, 0, 0, 12],
      },

      // Points d'attention
      violations.length > 0 ? {
        stack: [
          { text: "Points d'attention réglementaires :", bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
          ...violations.map(v => ({ text: `• ${v}`, style: "alert" })),
        ],
        fillColor: "#fff5f5",
        margin: [0, 0, 0, 12],
      } : {
        text: "✓ Aucune violation réglementaire détectée sur la période",
        fontSize: 10, color: COLORS.green, margin: [0, 0, 0, 12],
      },

      // ── Transactions ────────────────────────────────────────────────────────
      sectionTitle("1. TRANSACTIONS"),
      kpiTable([
        ["Total analysées",     fmtNum(kpis.transactions.total),       "nb"],
        ["Volume total",        fmtEur(kpis.transactions.totalAmount),  "EUR"],
        ["Transactions suspectes", fmtNum(kpis.transactions.suspicious), "nb"],
        ["Transactions bloquées",  fmtNum(kpis.transactions.blocked),   "nb"],
        ["Taux de détection",   fmtPct(kpis.transactions.detectionRate), "%"],
      ]),

      // ── Alertes ─────────────────────────────────────────────────────────────
      sectionTitle("2. ALERTES AML"),
      kpiTable([
        ["Total alertes",       fmtNum(kpis.alerts.total),                   "nb"],
        ["Critiques",           fmtNum(kpis.alerts.byLevel.critical),        "nb"],
        ["Hautes",              fmtNum(kpis.alerts.byLevel.high),            "nb"],
        ["Moyennes",            fmtNum(kpis.alerts.byLevel.medium),          "nb"],
        ["Résolues",            fmtNum(kpis.alerts.resolved),                "nb"],
        ["Taux faux positifs",  fmtPct(kpis.alerts.falsePositiveRate),       "%"],
        ["Délai moyen résolution", fmtDays(kpis.alerts.avgResolutionDaysFiltered), "j"],
        ["Violations SLA (>5j)",   fmtNum(kpis.compliance.alertSlaBreaches), "nb"],
      ]),

      // ── Déclarations ──────────────────────────────────────────────────────
      sectionTitle("3. DÉCLARATIONS SAR / STR"),
      kpiTable([
        ["SAR émis",            fmtNum(kpis.declarations.sarCount),       "nb"],
        ["STR émis",            fmtNum(kpis.declarations.strCount),       "nb"],
        ["Soumis régulateur",   fmtNum(kpis.declarations.submitted),      "nb"],
        ["Délai moyen soumission", fmtDays(kpis.declarations.avgDaysToSubmit), "j"],
      ]),

      // ── Clients ──────────────────────────────────────────────────────────
      sectionTitle("4. BASE CLIENTS & KYC"),
      kpiTable([
        ["Clients total",       fmtNum(kpis.customers.total),            "nb"],
        ["Risque CRITICAL",     fmtNum(kpis.customers.byRiskLevel.critical), "nb"],
        ["Risque HIGH",         fmtNum(kpis.customers.byRiskLevel.high), "nb"],
        ["Clients PEP",         fmtNum(kpis.customers.pepActive),        "nb"],
        ["Correspondances sanctions", fmtNum(kpis.customers.sanctionMatch), "nb"],
        ["Couverture KYC",      fmtPct(kpis.customers.kycCoverage),      "%"],
      ]),

      // ── Screening ──────────────────────────────────────────────────────────
      sectionTitle("5. SCREENING SANCTIONS"),
      kpiTable([
        ["Total screenings",    fmtNum(kpis.screening.total),            "nb"],
        ["Correspondances",     fmtNum(kpis.screening.matchCount),       "nb"],
        ["En révision",         fmtNum(kpis.screening.reviewCount),      "nb"],
        ["Taux de match",       fmtPct(kpis.screening.matchRate),        "%"],
      ]),

      // ── Dossiers ──────────────────────────────────────────────────────────
      sectionTitle("6. DOSSIERS"),
      kpiTable([
        ["Ouverts",             fmtNum(kpis.cases.opened),               "nb"],
        ["Fermés",              fmtNum(kpis.cases.closed),               "nb"],
        ["Escaladés",           fmtNum(kpis.cases.escalated),            "nb"],
        ["Durée moyenne",       fmtDays(kpis.cases.avgDurationDays),     "j"],
      ]),

      // ── Conformité ────────────────────────────────────────────────────────
      sectionTitle("7. INDICATEURS DE CONFORMITÉ"),
      kpiTable([
        ["Taux adoption MFA",   fmtPct(kpis.compliance.mfaAdoptionRate), "%"],
        ["Violations SLA alertes", fmtNum(kpis.compliance.alertSlaBreaches), "nb"],
        ["Âge moyen alertes ouvertes", fmtDays(kpis.compliance.avgAlertAgeOpenDays), "j"],
      ]),

      // ── Déclaration de conformité ──────────────────────────────────────────
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }], margin: [0, 20, 0, 20] },
      {
        text: "Déclaration de conformité",
        bold: true, fontSize: 11, margin: [0, 0, 0, 8],
      },
      {
        text: `Le présent rapport a été généré automatiquement par la plateforme KYC/AML de ${orgName} pour la période ${periodStr}. Les données sont extraites en temps réel de la base de données de l'établissement. Ce document est confidentiel et destiné exclusivement au Responsable de la Conformité et aux autorités de supervision compétentes.`,
        fontSize: 9, color: COLORS.muted, lineHeight: 1.5,
      },
    ],
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = pdfMake.createPdf(dd as unknown as Parameters<typeof pdfMake.createPdf>[0]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).getBuffer((buffer: Uint8Array) => {
        const buf = Buffer.from(buffer);
        log.info({ size: buf.length }, "PDF AMLD6 généré");
        resolve(buf);
      });
    } catch (err) {
      log.error({ err }, "Erreur génération PDF");
      reject(err);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF — Rapport SAR / STR individuel
// ─────────────────────────────────────────────────────────────────────────────

export async function generateReportPdf(report: Report, customer: Customer): Promise<Buffer> {
  const pdfMake  = (await import("pdfmake/build/pdfmake")).default;
  const vfsFonts = (await import("pdfmake/build/vfs_fonts")).default;
  (pdfMake as unknown as { vfs: unknown }).vfs = (vfsFonts as unknown as { pdfMake: { vfs: unknown } }).pdfMake.vfs;

  const orgName  = process.env["ORG_NAME"] ?? "Établissement Financier";
  const genDate  = fmtDate(new Date());
  const isSar    = report.reportType === "SAR";
  const content  = (report.content ?? {}) as Record<string, unknown>;

  const C = COLORS;

  function row(label: string, value: string) {
    return [
      { text: label, style: "tableCell",      fillColor: "#f6f8fa" },
      { text: value, style: "tableCellRight", bold: true },
    ];
  }

  function section(title: string) {
    return {
      columns: [
        { canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 14, color: C.blue, r: 1 }], width: 8 },
        { text: title, style: "sectionTitle", margin: [4, 0, 0, 0] },
      ],
      margin: [0, 14, 0, 6],
    };
  }

  const narrativeText = typeof content["narrativeSummary"] === "string"
    ? content["narrativeSummary"]
    : "—";
  const evidenceText = typeof content["evidenceSummary"] === "string"
    ? content["evidenceSummary"]
    : "—";

  const activitiesList = Array.isArray(content["suspiciousActivities"])
    ? (content["suspiciousActivities"] as string[]).map(a => ({ text: `• ${a}`, style: "bodyText", margin: [0, 2, 0, 2] }))
    : [];
  const partiesList = Array.isArray(content["involvedParties"])
    ? (content["involvedParties"] as string[]).map(p => ({ text: `• ${p}`, style: "bodyText", margin: [0, 2, 0, 2] }))
    : [];

  const dd = {
    pageSize: "A4",
    pageMargins: [50, 60, 50, 60],

    styles: {
      cover:         { fontSize: 24, bold: true, color: C.primary },
      coverSub:      { fontSize: 11, color: C.muted, margin: [0, 3, 0, 0] },
      sectionTitle:  { fontSize: 12, bold: true, color: C.primary },
      tableCell:     { fontSize: 10, color: C.primary },
      tableCellRight:{ fontSize: 10, color: C.primary },
      bodyText:      { fontSize: 10, color: C.primary, lineHeight: 1.5 },
      labelText:     { fontSize: 9, color: C.muted, bold: true, margin: [0, 0, 0, 3] },
      footer:        { fontSize: 8, color: C.muted },
    },

    header: (p: number) => p === 1 ? {} : {
      columns: [
        { text: `${report.reportType} ${report.reportId} — ${orgName}`, style: "footer", margin: [50, 20, 0, 0] },
        { text: `Page ${p}`, style: "footer", alignment: "right", margin: [0, 20, 50, 0] },
      ],
    },
    footer: () => ({
      columns: [
        { text: `Généré le ${genDate} — CONFIDENTIEL`, style: "footer", margin: [50, 0, 0, 0] },
        { text: "Document à usage interne", style: "footer", alignment: "right", margin: [0, 0, 50, 0] },
      ],
    }),

    content: [
      // ── Couverture
      { text: isSar ? "DÉCLARATION D'ACTIVITÉ SUSPECTE" : "DÉCLARATION DE TRANSACTION SUSPECTE", style: "cover", margin: [0, 50, 0, 0] },
      { text: isSar ? "Suspicious Activity Report (SAR)" : "Suspicious Transaction Report (STR)", style: "coverSub" },
      { text: orgName, style: "coverSub", bold: true },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: C.border }], margin: [0, 16, 0, 16] },
      { text: `Réf. : ${report.reportId}`, style: "coverSub" },
      { text: `Statut : ${report.status}`, style: "coverSub" },
      { text: `Créé le : ${fmtDate(report.createdAt)}`, style: "coverSub" },
      { text: "CONFIDENTIEL — Document à usage interne", style: "coverSub", color: C.red },
      { text: "", pageBreak: "after" },

      // ── Identité du rapport
      section("1. IDENTIFICATION DU RAPPORT"),
      {
        table: {
          widths: ["35%", "*"],
          body: [
            row("Référence", report.reportId),
            row("Type", report.reportType),
            row("Statut", report.status),
            row("Type de suspicion", report.suspicionType ?? "—"),
            row("Montant impliqué", report.amountInvolved ? `${report.amountInvolved} ${report.currency ?? "EUR"}` : "—"),
            row("Date de création", fmtDate(report.createdAt)),
            row("Dernière mise à jour", fmtDate(report.updatedAt)),
          ],
        },
        layout: {
          fillColor: (i: number) => i % 2 === 0 ? "#f6f8fa" : C.white,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => C.border,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
        margin: [0, 4, 0, 16],
      },

      // ── Identité du client
      section("2. SUJET DE LA DÉCLARATION"),
      {
        table: {
          widths: ["35%", "*"],
          body: [
            row("Client ID",    String(customer.id)),
            row("Nom complet",  `${customer.firstName} ${customer.lastName}`),
            row("Date de naissance", customer.dateOfBirth ? fmtDate(customer.dateOfBirth) : "—"),
            row("Nationalité",  customer.nationality ?? "—"),
            row("Niveau de risque", customer.riskLevel ?? "—"),
            row("Score de risque",  String(customer.riskScore ?? "—")),
            row("Statut PPE", customer.pepStatus ? "OUI" : "NON"),
          ],
        },
        layout: {
          fillColor: (i: number) => i % 2 === 0 ? "#f6f8fa" : C.white,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => C.border,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
        margin: [0, 4, 0, 16],
      },

      // ── Activités suspectes (SAR) ou détails transaction (STR)
      ...(isSar ? [
        section("3. ACTIVITÉS SUSPECTES"),
        { text: "Description du sujet :", style: "labelText" },
        { text: String(content["subjectDescription"] ?? "—"), style: "bodyText", margin: [0, 0, 0, 12] },
        ...(activitiesList.length > 0 ? [
          { text: "Activités suspectes identifiées :", style: "labelText" },
          ...activitiesList,
          { text: "", margin: [0, 8, 0, 0] },
        ] : []),
      ] : [
        section("3. DÉTAILS DE LA TRANSACTION SUSPECTE"),
        {
          table: {
            widths: ["35%", "*"],
            body: [
              row("ID Transaction",  String(content["transactionId"] ?? "—")),
              row("Date",            content["transactionDate"] ? fmtDate(String(content["transactionDate"])) : "—"),
              row("Montant",         String(content["transactionAmount"] ?? "—")),
              row("Type",            String(content["transactionType"] ?? "—")),
              row("Motif",           String(content["suspicionBasis"] ?? "—")),
            ],
          },
          layout: {
            fillColor: (i: number) => i % 2 === 0 ? "#f6f8fa" : C.white,
            hLineWidth: () => 0.5,
            vLineWidth: () => 0,
            hLineColor: () => C.border,
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 6,
            paddingBottom: () => 6,
          },
          margin: [0, 4, 0, 12],
        },
        ...(partiesList.length > 0 ? [
          { text: "Parties impliquées :", style: "labelText" },
          ...partiesList,
          { text: "", margin: [0, 8, 0, 0] },
        ] : []),
      ]),

      // ── Preuves & narration
      section("4. PREUVES ET SYNTHÈSE NARRATIVE"),
      { text: "Résumé des preuves :", style: "labelText" },
      { text: evidenceText, style: "bodyText", margin: [0, 0, 0, 12] },
      { text: "Synthèse narrative :", style: "labelText" },
      { text: narrativeText, style: "bodyText" },
    ],
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = pdfMake.createPdf(dd as unknown as Parameters<typeof pdfMake.createPdf>[0]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).getBuffer((buffer: Uint8Array) => resolve(Buffer.from(buffer)));
    } catch (err) {
      log.error({ err }, "Erreur génération PDF rapport");
      reject(err);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF — Fiche KYC client
// ─────────────────────────────────────────────────────────────────────────────

export async function generateKycPdf(
  customer: Customer,
  transactions: Transaction[],
): Promise<Buffer> {
  const pdfMake  = (await import("pdfmake/build/pdfmake")).default;
  const vfsFonts = (await import("pdfmake/build/vfs_fonts")).default;
  (pdfMake as unknown as { vfs: unknown }).vfs = (vfsFonts as unknown as { pdfMake: { vfs: unknown } }).pdfMake.vfs;

  const orgName = process.env["ORG_NAME"] ?? "Établissement Financier";
  const genDate = fmtDate(new Date());
  const C = COLORS;

  function row(label: string, value: string) {
    return [
      { text: label, style: "tableCell", fillColor: "#f6f8fa" },
      { text: value, style: "tableCellRight", bold: true },
    ];
  }

  function section(title: string) {
    return {
      columns: [
        { canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 14, color: C.blue, r: 1 }], width: 8 },
        { text: title, style: "sectionTitle", margin: [4, 0, 0, 0] },
      ],
      margin: [0, 14, 0, 6],
    };
  }

  const RISK_COLORS: Record<string, string> = {
    CRITICAL: C.red, HIGH: C.amber, MEDIUM: C.amber, LOW: C.green,
  };
  const riskColor = RISK_COLORS[customer.riskLevel ?? "LOW"] ?? C.muted;

  const recentTx = transactions.slice(0, 10);
  const suspiciousCount = transactions.filter(t => t.isSuspicious).length;
  const totalAmount = transactions
    .filter(t => t.status === "COMPLETED")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const dd = {
    pageSize: "A4",
    pageMargins: [50, 60, 50, 60],

    styles: {
      cover:         { fontSize: 22, bold: true, color: C.primary },
      coverSub:      { fontSize: 11, color: C.muted, margin: [0, 3, 0, 0] },
      sectionTitle:  { fontSize: 12, bold: true, color: C.primary },
      tableCell:     { fontSize: 10, color: C.primary },
      tableCellRight:{ fontSize: 10, color: C.primary },
      bodyText:      { fontSize: 10, color: C.primary, lineHeight: 1.5 },
      labelText:     { fontSize: 9, color: C.muted, bold: true, margin: [0, 0, 0, 3] },
      txHeader:      { fontSize: 9, bold: true, color: C.white, fillColor: C.primary },
      txCell:        { fontSize: 9, color: C.primary },
      footer:        { fontSize: 8, color: C.muted },
    },

    header: (p: number) => p === 1 ? {} : {
      columns: [
        { text: `Fiche KYC — ${customer.firstName} ${customer.lastName} — ${orgName}`, style: "footer", margin: [50, 20, 0, 0] },
        { text: `Page ${p}`, style: "footer", alignment: "right", margin: [0, 20, 50, 0] },
      ],
    },
    footer: () => ({
      columns: [
        { text: `Généré le ${genDate} — CONFIDENTIEL`, style: "footer", margin: [50, 0, 0, 0] },
        { text: "Document à usage interne", style: "footer", alignment: "right", margin: [0, 0, 50, 0] },
      ],
    }),

    content: [
      // ── Couverture
      { text: "FICHE KYC CLIENT", style: "cover", margin: [0, 50, 0, 0] },
      { text: "Know Your Customer — Synthèse de conformité", style: "coverSub" },
      { text: orgName, style: "coverSub", bold: true },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: C.border }], margin: [0, 16, 0, 16] },
      { text: `Client : ${customer.firstName} ${customer.lastName}`, style: "coverSub", bold: true },
      { text: `Généré le : ${genDate}`, style: "coverSub" },
      {
        text: `Niveau de risque : ${customer.riskLevel ?? "—"}`,
        style: "coverSub",
        color: riskColor,
        bold: true,
      },
      { text: "CONFIDENTIEL — Document à usage interne", style: "coverSub", color: C.red },
      { text: "", pageBreak: "after" },

      // ── Identité
      section("1. IDENTITÉ DU CLIENT"),
      {
        table: {
          widths: ["35%", "*"],
          body: [
            row("ID Client",        String(customer.id)),
            row("Prénom",           customer.firstName),
            row("Nom",              customer.lastName),
            row("Date de naissance", customer.dateOfBirth ? fmtDate(customer.dateOfBirth) : "—"),
            row("Nationalité",      customer.nationality ?? "—"),
            row("Pays de résidence", customer.residenceCountry ?? "—"),
            row("Email",            customer.email ?? "—"),
            row("Téléphone",        customer.phone ?? "—"),
            row("Type de client",   customer.customerType ?? "—"),
          ],
        },
        layout: {
          fillColor: (i: number) => i % 2 === 0 ? "#f6f8fa" : C.white,
          hLineWidth: () => 0.5, vLineWidth: () => 0,
          hLineColor: () => C.border,
          paddingLeft: () => 10, paddingRight: () => 10,
          paddingTop: () => 6, paddingBottom: () => 6,
        },
        margin: [0, 4, 0, 16],
      },

      // ── Profil de risque
      section("2. PROFIL DE RISQUE AML"),
      {
        table: {
          widths: ["35%", "*"],
          body: [
            row("Niveau de risque",  customer.riskLevel ?? "—"),
            row("Score de risque",   String(customer.riskScore ?? 0)),
            row("Statut PPE",        customer.pepStatus ? "OUI" : "NON"),
            row("Correspondance sanctions", customer.sanctionStatus === "MATCH" ? "OUI — VÉRIFICATION REQUISE" : "NON"),
            row("Actifs gelés",      customer.frozenAt ? `OUI — ${customer.frozenReason ?? ""}`.trim() : "NON"),
            row("Statut KYC",        customer.kycStatus ?? "—"),
            row("Dernière revue",    customer.lastReviewDate ? fmtDate(customer.lastReviewDate) : "—"),
            row("Prochaine revue",   customer.nextReviewDate ? fmtDate(customer.nextReviewDate) : "—"),
          ],
        },
        layout: {
          fillColor: (i: number) => i % 2 === 0 ? "#f6f8fa" : C.white,
          hLineWidth: () => 0.5, vLineWidth: () => 0,
          hLineColor: () => C.border,
          paddingLeft: () => 10, paddingRight: () => 10,
          paddingTop: () => 6, paddingBottom: () => 6,
        },
        margin: [0, 4, 0, 16],
      },

      // ── Résumé transactions
      section("3. RÉSUMÉ DES TRANSACTIONS"),
      {
        table: {
          widths: ["35%", "*"],
          body: [
            row("Total transactions",     String(transactions.length)),
            row("Transactions suspectes", String(suspiciousCount)),
            row("Volume total (complétées)", fmtEur(totalAmount)),
          ],
        },
        layout: {
          fillColor: (i: number) => i % 2 === 0 ? "#f6f8fa" : C.white,
          hLineWidth: () => 0.5, vLineWidth: () => 0,
          hLineColor: () => C.border,
          paddingLeft: () => 10, paddingRight: () => 10,
          paddingTop: () => 6, paddingBottom: () => 6,
        },
        margin: [0, 4, 0, 12],
      },

      ...(recentTx.length > 0 ? [
        { text: "10 dernières transactions :", style: "labelText", margin: [0, 4, 0, 6] },
        {
          table: {
            widths: ["*", "auto", "auto", "auto", "auto"],
            headerRows: 1,
            body: [
              [
                { text: "Réf.",        style: "txHeader" },
                { text: "Date",        style: "txHeader" },
                { text: "Montant",     style: "txHeader", alignment: "right" },
                { text: "Type",        style: "txHeader" },
                { text: "Statut",      style: "txHeader" },
              ],
              ...recentTx.map(tx => ([
                { text: tx.transactionId,  style: "txCell" },
                { text: fmtDate(tx.transactionDate), style: "txCell" },
                { text: fmtEur(Number(tx.amount)), style: "txCell", alignment: "right", color: tx.isSuspicious ? C.amber : C.primary },
                { text: tx.transactionType, style: "txCell" },
                { text: tx.status, style: "txCell", color: tx.status === "FLAGGED" || tx.status === "BLOCKED" ? C.red : C.green },
              ])),
            ],
          },
          layout: {
            fillColor: (i: number) => i === 0 ? C.primary : i % 2 === 0 ? "#f6f8fa" : C.white,
            hLineWidth: () => 0.5, vLineWidth: () => 0,
            hLineColor: () => C.border,
            paddingLeft: () => 8, paddingRight: () => 8,
            paddingTop: () => 5, paddingBottom: () => 5,
          },
          margin: [0, 0, 0, 16],
        },
      ] : []),

      // ── Déclaration
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: C.border }], margin: [0, 8, 0, 16] },
      {
        text: `Fiche générée automatiquement le ${genDate} par la plateforme KYC/AML de ${orgName}. Document confidentiel à usage interne. Toute divulgation non autorisée est interdite.`,
        fontSize: 8, color: C.muted, lineHeight: 1.5,
      },
    ],
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = pdfMake.createPdf(dd as unknown as Parameters<typeof pdfMake.createPdf>[0]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).getBuffer((buffer: Uint8Array) => resolve(Buffer.from(buffer)));
    } catch (err) {
      log.error({ err }, "Erreur génération PDF KYC");
      reject(err);
    }
  });
}
