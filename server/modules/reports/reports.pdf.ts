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
