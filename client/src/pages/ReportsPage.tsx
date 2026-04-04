import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatDate, formatRelative, formatNumber } from "../lib/utils";
import { FileText, FilePlus, Send, CheckCircle, XCircle, Radio, Download, BarChart3 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { useI18n } from "../hooks/useI18n";

const C = {
  surface: "var(--wr-card)",
  border:  "var(--wr-border)",
  border2: "var(--wr-border2)",
  text1:   "var(--wr-text-1)",
  text2:   "var(--wr-text-2)",
  text3:   "var(--wr-text-3)",
  text4:   "var(--wr-text-4)",
  gold:    "var(--wr-gold)",
  red:     "var(--wr-red)",
  amber:   "var(--wr-amber)",
  green:   "var(--wr-green)",
  blue:    "var(--wr-blue)",
  mono:    "var(--wr-font-mono)",
  serif:   "var(--wr-font-serif)",
  hover:   "var(--wr-hover)",
};

// ─── Types locaux alignés sur le schéma Drizzle ───────────────────────────────

type Report = {
  id: number; reportId: string; reportType: string; title: string;
  status: string; caseId: number | null; customerId: number | null;
  submittedAt: Date | null;
  createdAt: Date; updatedAt: Date;
};

// ─── State formulaires ────────────────────────────────────────────────────────

type SarForm = {
  customerId: string; caseId: string; title: string; suspicionType: string;
  amountInvolved: string; currency: string;
  subjectDescription: string; suspiciousActivities: string;
  evidenceSummary: string; narrativeSummary: string; recommendedAction: string;
};

type StrForm = {
  customerId: string; caseId: string; title: string; suspicionType: string;
  amountInvolved: string; currency: string;
  transactionId: string; transactionDate: string; transactionAmount: string;
  transactionType: string; suspicionBasis: string; involvedParties: string;
  evidenceSummary: string; narrativeSummary: string;
};

const DEFAULT_SAR: SarForm = {
  customerId: "", caseId: "", title: "", suspicionType: "",
  amountInvolved: "", currency: "EUR",
  subjectDescription: "", suspiciousActivities: "",
  evidenceSummary: "", narrativeSummary: "", recommendedAction: "",
};

const DEFAULT_STR: StrForm = {
  customerId: "", caseId: "", title: "", suspicionType: "",
  amountInvolved: "", currency: "EUR",
  transactionId: "", transactionDate: "", transactionAmount: "",
  transactionType: "", suspicionBasis: "", involvedParties: "",
  evidenceSummary: "", narrativeSummary: "",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: C.hover,
  border: `1px solid ${C.border2}`,
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 12,
  fontFamily: C.mono,
  color: C.text1,
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "none",
};

// ─── Page principale ──────────────────────────────────────────────────────────

export function ReportsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [pageTab, setPageTab]       = useState<"reports" | "amld6">("reports");
  const [page, setPage]             = useState(1);
  const [reportType, setReportType] = useState<string>("");
  const [status, setStatus]         = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [createTab, setCreateTab]   = useState<"SAR" | "STR">("SAR");
  const [sarForm, setSarForm]       = useState<SarForm>(DEFAULT_SAR);
  const [strForm, setStrForm]       = useState<StrForm>(DEFAULT_STR);
  const [actionTarget, setActionTarget] = useState<{
    report: Report; action: "submit" | "approve" | "reject";
  } | null>(null);
  const [transmitTarget, setTransmitTarget] = useState<Report | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.reports.list.useQuery({
    page, limit: 20,
    ...(reportType ? { reportType: reportType as "SAR" | "STR" } : {}),
    ...(status     ? { status: status as "DRAFT" | "REVIEW" | "SUBMITTED" | "APPROVED" | "REJECTED" } : {}),
  }, { placeholderData: keepPreviousData });

  const createSarMutation = trpc.reports.createSar.useMutation({
    onSuccess: () => { utils.reports.list.invalidate(); setShowCreate(false); setSarForm(DEFAULT_SAR); },
  });
  const createStrMutation = trpc.reports.createStr.useMutation({
    onSuccess: () => { utils.reports.list.invalidate(); setShowCreate(false); setStrForm(DEFAULT_STR); },
  });
  const submitMutation  = trpc.reports.submitForReview.useMutation({
    onSuccess: () => { utils.reports.list.invalidate(); setActionTarget(null); },
  });
  const approveMutation = trpc.reports.approve.useMutation({
    onSuccess: () => { utils.reports.list.invalidate(); setActionTarget(null); },
  });
  const rejectMutation  = trpc.reports.reject.useMutation({
    onSuccess: () => { utils.reports.list.invalidate(); setActionTarget(null); },
  });
  const transmitMutation = trpc.reports.transmit.useMutation({
    onSuccess: () => { utils.reports.list.invalidate(); setTransmitTarget(null); },
  });
  const downloadXmlMutation    = trpc.reports.downloadXml.useMutation();
  const exportReportPdfMutation = trpc.reports.exportReportPdf.useMutation();

  const canApprove = hasRole(user, "compliance_officer");
  const canReject  = hasRole(user, "supervisor");

  function handleCreateSar() {
    createSarMutation.mutate({
      customerId:    parseInt(sarForm.customerId),
      title:         sarForm.title,
      suspicionType: sarForm.suspicionType,
      ...(sarForm.caseId         ? { caseId: parseInt(sarForm.caseId) }        : {}),
      ...(sarForm.amountInvolved ? { amountInvolved: sarForm.amountInvolved }  : {}),
      currency: sarForm.currency || "EUR",
      content: {
        subjectDescription:   sarForm.subjectDescription,
        suspiciousActivities: sarForm.suspiciousActivities
          .split("\n").map((s: string) => s.trim()).filter(Boolean),
        evidenceSummary:  sarForm.evidenceSummary,
        narrativeSummary: sarForm.narrativeSummary,
        ...(sarForm.recommendedAction ? { recommendedAction: sarForm.recommendedAction } : {}),
      },
    });
  }

  function handleCreateStr() {
    createStrMutation.mutate({
      customerId:     parseInt(strForm.customerId),
      title:          strForm.title,
      suspicionType:  strForm.suspicionType,
      amountInvolved: strForm.amountInvolved,
      currency:       strForm.currency || "EUR",
      ...(strForm.caseId ? { caseId: parseInt(strForm.caseId) } : {}),
      content: {
        transactionId:     strForm.transactionId,
        transactionDate:   new Date(strForm.transactionDate).toISOString(),
        transactionAmount: strForm.transactionAmount,
        transactionType:   strForm.transactionType,
        suspicionBasis:    strForm.suspicionBasis,
        involvedParties:   strForm.involvedParties
          .split("\n").map((s: string) => s.trim()).filter(Boolean),
        evidenceSummary:  strForm.evidenceSummary,
        narrativeSummary: strForm.narrativeSummary,
      },
    });
  }

  const COLUMNS: Column<Report>[] = [
    {
      key: "id", header: t.reports.reportId, width: "w-36",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <FileText size={11} style={{ color: C.text3 }} />
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.blue }}>{r.reportId}</span>
        </div>
      ),
    },
    {
      key: "type", header: t.reports.reportType, width: "w-20",
      render: (r) => (
        <span style={{
          fontFamily: C.mono,
          fontSize: 12,
          fontWeight: 600,
          color: r.reportType === "SAR" ? "var(--wr-purple, #c084fc)" : "var(--wr-orange, #fb923c)",
        }}>
          {r.reportType}
        </span>
      ),
    },
    {
      key: "title", header: t.reports.titleLabel,
      render: (r) => (
        <div>
          <p style={{ fontSize: 12, color: C.text1, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{r.title}</p>
          <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {r.customerId ? `Client #${r.customerId}` : ""}
            {r.caseId     ? ` · Dossier #${r.caseId}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "status", header: t.common.status, width: "w-32",
      render: (r) => <Badge label={r.status} variant="status" />,
    },
    {
      key: "submitted", header: t.reports.generatedAt, width: "w-28",
      render: (r) => r.submittedAt
        ? <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text3 }}>{formatDate(r.submittedAt)}</span>
        : <span style={{ color: C.text4 }}>—</span>,
    },
    {
      key: "date", header: t.common.date, width: "w-28",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text3 }}>{formatRelative(r.createdAt)}</span>,
    },
    {
      key: "actions", header: "", width: "w-44",
      render: (r) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {r.status === "DRAFT" && (
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setActionTarget({ report: r, action: "submit" }); }}
              style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}
            >
              <Send size={10} /> {t.common.submit}
            </button>
          )}
          {r.status === "REVIEW" && canApprove && (
            <>
              <button
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setActionTarget({ report: r, action: "approve" }); }}
                style={{ fontSize: 10, fontFamily: C.mono, color: C.green, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                {t.common.approve}
              </button>
              {canReject && (
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); setActionTarget({ report: r, action: "reject" }); }}
                  style={{ fontSize: 10, fontFamily: C.mono, color: C.red, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {t.common.reject}
                </button>
              )}
            </>
          )}
          {(r.status === "SUBMITTED" || r.status === "APPROVED") && canApprove && (
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setTransmitTarget(r); }}
              style={{ fontSize: 10, fontFamily: C.mono, color: "var(--wr-purple, #c084fc)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}
              title={t.reports.transmit}
            >
              <Radio size={10} /> GoAML
            </button>
          )}
          {canApprove && (
            <>
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  downloadXmlMutation.mutate({ id: r.id }, {
                    onSuccess: (data: { xml: string; filename: string; checksum: string; reportCode: string; schemaVersion: string; generatedAt: Date }) => {
                      const blob = new Blob([data.xml], { type: "application/xml" });
                      const url  = URL.createObjectURL(blob);
                      const a    = document.createElement("a");
                      a.href     = url;
                      a.download = data.filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    },
                  });
                }}
                style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}
                title={t.reports.downloadGoAML}
              >
                <Download size={10} /> XML
              </button>
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  exportReportPdfMutation.mutate({ id: r.id }, {
                    onSuccess: (data: { base64: string; filename: string; sizeKb: number }) => {
                      const arr  = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
                      const blob = new Blob([arr], { type: "application/pdf" });
                      const url  = URL.createObjectURL(blob);
                      const a    = document.createElement("a");
                      a.href     = url;
                      a.download = data.filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    },
                  });
                }}
                disabled={exportReportPdfMutation.isPending}
                style={{ fontSize: 10, fontFamily: C.mono, color: C.red, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0, opacity: exportReportPdfMutation.isPending ? 0.4 : 1 }}
                title="Télécharger PDF"
              >
                <Download size={10} /> PDF
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const sarValid =
    sarForm.customerId.length > 0 &&
    sarForm.title.length >= 5 &&
    sarForm.suspicionType.length >= 3 &&
    sarForm.subjectDescription.length >= 10 &&
    sarForm.suspiciousActivities.trim().length > 0 &&
    sarForm.evidenceSummary.length >= 20 &&
    sarForm.narrativeSummary.length >= 50;

  const strValid =
    strForm.customerId.length > 0 &&
    strForm.title.length >= 5 &&
    strForm.suspicionType.length >= 3 &&
    strForm.amountInvolved.length > 0 &&
    strForm.transactionId.length > 0 &&
    strForm.transactionDate.length > 0 &&
    strForm.transactionAmount.length > 0 &&
    strForm.transactionType.length > 0 &&
    strForm.suspicionBasis.length >= 10 &&
    strForm.involvedParties.trim().length > 0 &&
    strForm.evidenceSummary.length >= 20 &&
    strForm.narrativeSummary.length >= 50;

  return (
    <AppLayout>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>{t.reports.title}</h1>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {data ? formatNumber(data.total) : "—"} {t.reports.subtitle}
          </p>
        </div>
        {pageTab === "reports" && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer" }}
          >
            <FilePlus size={13} /> {t.reports.generateReport}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
        {([
          { id: "reports" as const, label: "SAR / STR", icon: FileText },
          { id: "amld6"   as const, label: "AMLD6 KPIs", icon: BarChart3 },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPageTab(id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 14px", fontSize: 11, fontFamily: C.mono,
              color: pageTab === id ? C.gold : C.text3,
              background: "none", border: "none", borderBottom: `2px solid ${pageTab === id ? C.gold : "transparent"}`,
              cursor: "pointer", marginBottom: -1,
            }}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {pageTab === "amld6" && <Amld6Panel canApprove={canApprove} />}

      {pageTab === "reports" && <>
        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <select
            value={reportType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setReportType(e.target.value); setPage(1); }}
            style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
          >
            <option value="">{t.reports.sarAndStr}</option>
            <option value="SAR">{t.reports.sarOnly}</option>
            <option value="STR">{t.reports.strOnly}</option>
          </select>
          <select
            value={status}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setStatus(e.target.value); setPage(1); }}
            style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
          >
            <option value="">{t.common.all}</option>
            <option value="DRAFT">{t.reports.statusDraft}</option>
            <option value="REVIEW">{t.reports.statusInReview}</option>
            <option value="SUBMITTED">{t.reports.statusSubmitted}</option>
            <option value="APPROVED">{t.reports.statusApproved}</option>
            <option value="REJECTED">{t.reports.statusRejected}</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <DataTable
            columns={COLUMNS}
            data={(data?.data ?? []) as unknown as Report[]}
            keyFn={(r) => r.id}
            isLoading={isLoading}
            total={data?.total}
            page={page}
            limit={20}
            onPageChange={setPage}
            emptyMessage={t.reports.noReports}
          />
        </div>
      </>}

      {/* Modal création */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border2}`, borderRadius: 12, width: "100%", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 16px" }}>{t.reports.newReport}</h3>
              <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
                {(["SAR", "STR"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCreateTab(tab)}
                    style={{
                      padding: "9px 14px", fontSize: 11, fontFamily: C.mono,
                      borderBottom: `2px solid ${createTab === tab ? C.gold : "transparent"}`,
                      color: createTab === tab ? C.gold : C.text3,
                      background: "none", border: "none",
                      cursor: "pointer", marginBottom: -1,
                    }}
                  >
                    {tab === "SAR" ? "SAR — Activité suspecte" : "STR — Transaction suspecte"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowY: "auto", padding: "16px 24px", flex: 1 }}>
              {createTab === "SAR"
                ? <SarFormFields form={sarForm} onChange={setSarForm} />
                : <StrFormFields form={strForm} onChange={setStrForm} />
              }
              {(createSarMutation.error ?? createStrMutation.error) && (
                <p style={{ marginTop: 12, fontSize: 12, fontFamily: C.mono, color: C.red }}>
                  {(createSarMutation.error ?? createStrMutation.error)?.message}
                </p>
              )}
            </div>
            <div style={{ padding: "12px 24px 20px", display: "flex", gap: 8, flexShrink: 0, borderTop: `1px solid ${C.border}` }}>
              <button
                onClick={() => { setShowCreate(false); setSarForm(DEFAULT_SAR); setStrForm(DEFAULT_STR); }}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, cursor: "pointer" }}
              >
                {t.common.cancel}
              </button>
              <button
                disabled={
                  (createTab === "SAR" ? !sarValid : !strValid) ||
                  createSarMutation.isPending || createStrMutation.isPending
                }
                onClick={createTab === "SAR" ? handleCreateSar : handleCreateStr}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: ((createTab === "SAR" ? !sarValid : !strValid) || createSarMutation.isPending || createStrMutation.isPending) ? 0.4 : 1 }}
              >
                {createSarMutation.isPending || createStrMutation.isPending
                  ? t.common.loading
                  : createTab === "SAR" ? t.reports.createSar : t.reports.createStr}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal action */}
      {actionTarget && (
        <ActionModal
          target={actionTarget}
          onClose={() => setActionTarget(null)}
          onConfirm={() => {
            const id = actionTarget.report.id;
            if (actionTarget.action === "submit")  submitMutation.mutate({ id });
            if (actionTarget.action === "approve") approveMutation.mutate({ id });
            if (actionTarget.action === "reject")  rejectMutation.mutate({ id });
          }}
          isPending={submitMutation.isPending || approveMutation.isPending || rejectMutation.isPending}
        />
      )}

      {transmitTarget && (
        <TransmitModal
          report={transmitTarget}
          onClose={() => setTransmitTarget(null)}
          onConfirm={(declarant) => transmitMutation.mutate({ id: transmitTarget.id, ...declarant })}
          isPending={transmitMutation.isPending}
          result={transmitMutation.data ?? null}
          error={transmitMutation.error?.message ?? null}
        />
      )}
    </AppLayout>
  );
}

// ─── Panneau AMLD6 KPIs ───────────────────────────────────────────────────────

function Amld6Panel({ canApprove }: { canApprove: boolean }) {
  const { t } = useI18n();
  const now      = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

  const { data: kpis, isLoading } = trpc.reports.amld6Stats.useQuery({
    from: yearStart,
    to:   now.toISOString(),
  });

  const exportCsvMutation = trpc.reports.amld6ExportCsv.useMutation({
    onSuccess: (d: { csv: string; filename: string }) => {
      const blob = new Blob([d.csv], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = d.filename; a.click();
      URL.revokeObjectURL(url);
    },
  });

  const exportPdfMutation = trpc.reports.amld6ExportPdf.useMutation({
    onSuccess: (d: { base64: string; filename: string }) => {
      const bytes  = atob(d.base64);
      const arr    = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob   = new Blob([arr], { type: "application/pdf" });
      const url    = URL.createObjectURL(blob);
      const a      = document.createElement("a");
      a.href = url; a.download = d.filename; a.click();
      URL.revokeObjectURL(url);
    },
  });

  const exportInput = { from: yearStart, to: now.toISOString() };

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p className="animate-pulse" style={{ fontSize: 12, fontFamily: C.mono, color: C.text3 }}>{t.reports.computingKpis}</p>
      </div>
    );
  }

  if (!kpis) return null;

  function KpiCard({ title, value, sub, accent }: {
    title: string; value: string | number; sub?: string; accent?: string;
  }) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8, margin: "0 0 8px" }}>{title}</p>
        <p style={{ fontSize: 24, fontWeight: 700, fontFamily: C.mono, color: accent ?? C.text1, margin: "0 0 4px" }}>
          {typeof value === "number" ? formatNumber(value) : value}
        </p>
        {sub && <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, margin: 0 }}>{sub}</p>}
      </div>
    );
  }

  const { transactions: tx, alerts: al, declarations: decl, customers: cust, screening: sc, cases: cs, compliance: sla } = kpis;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Period + export */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: 0 }}>
          Période : 1 janv. {now.getFullYear()} → aujourd'hui
          {kpis.generatedAt
            ? ` · Généré ${new Date(kpis.generatedAt).toLocaleTimeString("fr-FR")}`
            : ""}
        </p>
        {canApprove && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => exportCsvMutation.mutate(exportInput)}
              disabled={exportCsvMutation.isPending}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.text2, cursor: "pointer", opacity: exportCsvMutation.isPending ? 0.4 : 1 }}
            >
              <Download size={11} /> {exportCsvMutation.isPending ? "…" : "CSV"}
            </button>
            <button
              onClick={() => exportPdfMutation.mutate(exportInput)}
              disabled={exportPdfMutation.isPending}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer", opacity: exportPdfMutation.isPending ? 0.4 : 1 }}
            >
              <Download size={11} /> {exportPdfMutation.isPending ? t.amld6.generating : "PDF"}
            </button>
          </div>
        )}
      </div>

      {/* KPI 1 — Transactions */}
      <div>
        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
          {t.amld6.txAnalyzed}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <KpiCard title={t.amld6.totalLabel} value={tx.total} />
          <KpiCard title={t.amld6.amountEur} value={`${(tx.totalAmount / 1_000_000).toFixed(2)} M`} />
          <KpiCard title={t.amld6.suspicious_} value={tx.suspicious} accent={C.amber} />
          <KpiCard title={t.amld6.detectionRate} value={`${tx.detectionRate.toFixed(2)} %`}
            sub="% tx flaggées" accent={tx.detectionRate > 5 ? C.red : C.green} />
        </div>
      </div>

      {/* KPI 2 — Alertes */}
      <div>
        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
          {t.amld6.amlAlerts}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <KpiCard title={t.amld6.totalAlerts} value={al.total} />
          <KpiCard title="CRITICAL" value={al.byLevel.critical} accent={C.red} />
          <KpiCard title="HIGH" value={al.byLevel.high} accent={C.amber} />
          <KpiCard title={t.amld6.falsePositives} value={`${al.falsePositiveRate.toFixed(1)} %`}
            sub="alertes rejetées" />
        </div>
      </div>

      {/* KPI 3 — SAR/STR */}
      <div>
        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
          {t.amld6.sarStrDecl}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <KpiCard title={t.amld6.sarFiled} value={decl.sarCount} accent="var(--wr-purple, #c084fc)" />
          <KpiCard title={t.amld6.strFiled} value={decl.strCount} accent={C.amber} />
          <KpiCard title={t.amld6.submitted_} value={decl.submitted} />
          <KpiCard title={t.amld6.avgDelay} value={`${decl.avgDaysToSubmit.toFixed(1)} j`}
            sub="création → soumission" accent={decl.avgDaysToSubmit > 5 ? C.red : C.green} />
        </div>
      </div>

      {/* KPI 4 — KYC & Screening */}
      <div>
        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
          {t.amld6.kycSanctions}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <KpiCard title={t.amld6.kycCoverage} value={`${cust.kycCoverage.toFixed(1)} %`}
            accent={cust.kycCoverage > 90 ? C.green : C.amber} />
          <KpiCard title={t.amld6.pepActive} value={cust.pepActive} accent={C.amber} />
          <KpiCard title={t.amld6.sanctionMatch} value={sc.matchCount}
            accent={sc.matchCount > 0 ? C.red : C.green} />
          <KpiCard title={t.amld6.sanctionReview} value={sc.reviewCount} />
        </div>
      </div>

      {/* KPI 5 — Dossiers & SLA */}
      <div>
        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
          {t.amld6.amlSla}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <KpiCard title={t.amld6.opened} value={cs.opened} accent={C.amber} />
          <KpiCard title={t.amld6.closed_} value={cs.closed} accent={C.green} />
          <KpiCard title={t.amld6.escalated} value={cs.escalated} accent={C.red} />
          <KpiCard title={t.amld6.slaBreached} value={sla.alertSlaBreaches}
            sub="alertes > 5 j ouvrés" accent={sla.alertSlaBreaches > 0 ? C.red : C.green} />
        </div>
      </div>

      {(exportCsvMutation.error || exportPdfMutation.error) && (
        <p style={{ fontSize: 12, fontFamily: C.mono, color: C.red, margin: 0 }}>
          {(exportCsvMutation.error ?? exportPdfMutation.error)?.message}
        </p>
      )}
    </div>
  );
}

// ─── Helpers formulaire ───────────────────────────────────────────────────────

function FieldRow({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3, marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Formulaire SAR ───────────────────────────────────────────────────────────

function SarFormFields({ form, onChange }: {
  form: SarForm; onChange: (f: SarForm) => void;
}) {
  const set = (k: keyof SarForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...form, [k]: e.target.value });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, margin: "0 0 4px" }}>
        Signalement d'activité suspecte — champs marqués <span style={{ color: C.red }}>*</span> obligatoires
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow label="ID Client" required>
          <input type="number" value={form.customerId} onChange={set("customerId")} placeholder="123" style={inputStyle} />
        </FieldRow>
        <FieldRow label="ID Dossier">
          <input type="number" value={form.caseId} onChange={set("caseId")} placeholder="456" style={inputStyle} />
        </FieldRow>
      </div>
      <FieldRow label="Titre" required>
        <input value={form.title} onChange={set("title")} placeholder="Ex : Structuration suspectée — client XYZ" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Type de suspicion" required>
        <input value={form.suspicionType} onChange={set("suspicionType")} placeholder="Ex : Structuring, PEP Transaction, High Frequency..." style={inputStyle} />
      </FieldRow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow label="Montant impliqué">
          <input value={form.amountInvolved} onChange={set("amountInvolved")} placeholder="50000.00" style={inputStyle} />
        </FieldRow>
        <FieldRow label="Devise">
          <input value={form.currency} onChange={set("currency")} placeholder="EUR" maxLength={3} style={inputStyle} />
        </FieldRow>
      </div>
      <div style={{ paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, marginBottom: 12, letterSpacing: "0.16em", textTransform: "uppercase" }}>Contenu du rapport</p>
      </div>
      <FieldRow label="Description du sujet (min 10 car.)" required>
        <textarea value={form.subjectDescription} onChange={set("subjectDescription")} rows={2}
          placeholder="Identité, activité, relation bancaire..." style={textareaStyle} />
      </FieldRow>
      <FieldRow label="Activités suspectes — une par ligne" required>
        <textarea value={form.suspiciousActivities} onChange={set("suspiciousActivities")} rows={3}
          placeholder={"Virements fractionnés\nDépôts cash récurrents\nTransactions vers pays à risque"} style={textareaStyle} />
      </FieldRow>
      <FieldRow label="Résumé des preuves (min 20 car.)" required>
        <textarea value={form.evidenceSummary} onChange={set("evidenceSummary")} rows={2}
          placeholder="Documents collectés, incohérences détectées..." style={textareaStyle} />
      </FieldRow>
      <FieldRow label="Narration détaillée (min 50 car.)" required>
        <textarea value={form.narrativeSummary} onChange={set("narrativeSummary")} rows={4}
          placeholder="Description chronologique des faits suspects..." style={textareaStyle} />
      </FieldRow>
      <FieldRow label="Action recommandée">
        <textarea value={form.recommendedAction} onChange={set("recommendedAction")} rows={2}
          placeholder="Bloquer, signaler au régulateur, surveillance accrue..." style={textareaStyle} />
      </FieldRow>
    </div>
  );
}

// ─── Formulaire STR ───────────────────────────────────────────────────────────

function StrFormFields({ form, onChange }: {
  form: StrForm; onChange: (f: StrForm) => void;
}) {
  const set = (k: keyof StrForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...form, [k]: e.target.value });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, margin: "0 0 4px" }}>
        Signalement de transaction suspecte — champs marqués <span style={{ color: C.red }}>*</span> obligatoires
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow label="ID Client" required>
          <input type="number" value={form.customerId} onChange={set("customerId")} placeholder="123" style={inputStyle} />
        </FieldRow>
        <FieldRow label="ID Dossier">
          <input type="number" value={form.caseId} onChange={set("caseId")} placeholder="456" style={inputStyle} />
        </FieldRow>
      </div>
      <FieldRow label="Titre" required>
        <input value={form.title} onChange={set("title")} placeholder="Ex : Virement suspect vers pays tiers" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Type de suspicion" required>
        <input value={form.suspicionType} onChange={set("suspicionType")} placeholder="Ex : Layering, Smurfing..." style={inputStyle} />
      </FieldRow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow label="Montant impliqué" required>
          <input value={form.amountInvolved} onChange={set("amountInvolved")} placeholder="50000.00" style={inputStyle} />
        </FieldRow>
        <FieldRow label="Devise">
          <input value={form.currency} onChange={set("currency")} placeholder="EUR" maxLength={3} style={inputStyle} />
        </FieldRow>
      </div>
      <div style={{ paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, marginBottom: 12, letterSpacing: "0.16em", textTransform: "uppercase" }}>Détails de la transaction</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow label="ID Transaction" required>
          <input value={form.transactionId} onChange={set("transactionId")} placeholder="TXN-XXXXXXXX" style={inputStyle} />
        </FieldRow>
        <FieldRow label="Date" required>
          <input type="datetime-local" value={form.transactionDate} onChange={set("transactionDate")} style={inputStyle} />
        </FieldRow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow label="Montant tx" required>
          <input value={form.transactionAmount} onChange={set("transactionAmount")} placeholder="12500.00" style={inputStyle} />
        </FieldRow>
        <FieldRow label="Type tx" required>
          <input value={form.transactionType} onChange={set("transactionType")} placeholder="TRANSFER, DEPOSIT..." style={inputStyle} />
        </FieldRow>
      </div>
      <FieldRow label="Parties impliquées — une par ligne" required>
        <textarea value={form.involvedParties} onChange={set("involvedParties")} rows={2}
          placeholder={"Nom Prenom — Banque X\nSociété Y — Pays Z"} style={textareaStyle} />
      </FieldRow>
      <FieldRow label="Base de la suspicion (min 10 car.)" required>
        <textarea value={form.suspicionBasis} onChange={set("suspicionBasis")} rows={2}
          placeholder="Raisons précises pour lesquelles cette transaction est suspecte..." style={textareaStyle} />
      </FieldRow>
      <FieldRow label="Résumé des preuves (min 20 car.)" required>
        <textarea value={form.evidenceSummary} onChange={set("evidenceSummary")} rows={2}
          placeholder="Documents, relevés, communications analysés..." style={textareaStyle} />
      </FieldRow>
      <FieldRow label="Narration détaillée (min 50 car.)" required>
        <textarea value={form.narrativeSummary} onChange={set("narrativeSummary")} rows={4}
          placeholder="Description chronologique des faits et contexte..." style={textareaStyle} />
      </FieldRow>
    </div>
  );
}

// ─── Modal action ─────────────────────────────────────────────────────────────

function ActionModal({ target, onClose, onConfirm, isPending }: {
  target: { report: Report; action: "submit" | "approve" | "reject" };
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const { t } = useI18n();
  const [rejectNote, setRejectNote] = useState("");
  const { action, report } = target;
  const canConfirm = action !== "reject" || rejectNote.length >= 10;

  const confirmBtnStyle: React.CSSProperties =
    action === "approve"
      ? { flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.green}14`, border: `1px solid ${C.green}40`, borderRadius: 7, color: C.green, cursor: "pointer" }
      : action === "reject"
      ? { flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.red}14`, border: `1px solid ${C.red}40`, borderRadius: 7, color: C.red, cursor: "pointer" }
      : { flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {action === "approve" && <CheckCircle size={16} style={{ color: C.green }} />}
          {action === "reject"  && <XCircle    size={16} style={{ color: C.red }} />}
          {action === "submit"  && <Send       size={16} style={{ color: C.blue }} />}
          <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: 0 }}>
            {action === "submit"  ? "Soumettre pour révision" :
             action === "approve" ? "Approuver le rapport"    :
                                    "Rejeter le rapport"}
          </h3>
        </div>
        <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, marginBottom: 16 }}>
          {report.reportId} — {report.title}
        </p>
        {action === "reject" && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3, marginBottom: 6 }}>
              Motif <span style={{ color: C.red }}>*</span>
            </label>
            <textarea
              value={rejectNote}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Informations manquantes, erreurs... (min 10 car.)"
              style={{ ...textareaStyle }}
            />
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, cursor: "pointer" }}>
            {t.common.cancel}
          </button>
          <button
            disabled={!canConfirm || isPending}
            onClick={onConfirm}
            style={{ ...confirmBtnStyle, opacity: (!canConfirm || isPending) ? 0.4 : 1 }}
          >
            {isPending ? "En cours..." : t.common.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modale de transmission GoAML/TRACFIN ────────────────────────────────────

type TransmitDeclarant = {
  declarantFirstName: string;
  declarantLastName:  string;
  declarantTitle:     string;
  declarantEmail:     string;
};

type TransmitResult = {
  reportId:       string;
  transmissionId: string;
  fiuRefNumber:   string | null;
  status:         string;
  mode:           string;
  xmlChecksum:    string;
  xmlSize:        number;
};

function TransmitModal({ report, onClose, onConfirm, isPending, result, error }: {
  report:     Report;
  onClose:    () => void;
  onConfirm:  (d: TransmitDeclarant) => void;
  isPending:  boolean;
  result:     TransmitResult | null;
  error:      string | null;
}) {
  const { t } = useI18n();
  const [declarant, setDeclarant] = useState<TransmitDeclarant>({
    declarantFirstName: "",
    declarantLastName:  "",
    declarantTitle:     "Responsable Conformité",
    declarantEmail:     "",
  });

  const isValid  = declarant.declarantFirstName.length >= 2
                && declarant.declarantLastName.length  >= 2
                && declarant.declarantEmail.includes("@");

  const transmitInputStyle: React.CSSProperties = { ...inputStyle };

  // Après transmission réussie — afficher le résultat
  if (result) {
    const isSimulation = result.mode === "SIMULATION";
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
        <div style={{
          background: C.surface,
          border: `1px solid ${result.status === "ERROR" ? C.red + "50" : C.green + "50"}`,
          borderRadius: 12, padding: 24, width: "100%", maxWidth: 440,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            {result.status === "ERROR"
              ? <XCircle size={18} style={{ color: C.red }} />
              : <CheckCircle size={18} style={{ color: C.green }} />
            }
            <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: 0 }}>
              {result.status === "ERROR" ? "Échec de transmission" : "Transmission réussie"}
            </h3>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: C.mono }}>
              <span style={{ color: C.text3 }}>Rapport</span>
              <span style={{ color: C.text1 }}>{result.reportId}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: C.mono }}>
              <span style={{ color: C.text3 }}>Transmission ID</span>
              <span style={{ color: C.text1, fontSize: 10 }}>{result.transmissionId}</span>
            </div>
            {result.fiuRefNumber && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: C.mono }}>
                <span style={{ color: C.text3 }}>Réf. régulateur</span>
                <span style={{ color: C.green, fontWeight: 600 }}>{result.fiuRefNumber}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: C.mono }}>
              <span style={{ color: C.text3 }}>Mode</span>
              <span style={{
                padding: "2px 6px", borderRadius: 4, fontSize: 10, border: "1px solid",
                color: isSimulation ? C.amber : C.green,
                background: isSimulation ? `${C.amber}14` : `${C.green}14`,
                borderColor: isSimulation ? `${C.amber}30` : `${C.green}30`,
              }}>{result.mode}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: C.mono }}>
              <span style={{ color: C.text3 }}>Taille XML</span>
              <span style={{ color: C.text3 }}>{(result.xmlSize / 1024).toFixed(1)} Ko</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: C.mono }}>
              <span style={{ color: C.text3 }}>Checksum</span>
              <span style={{ color: C.text4, fontSize: 10 }}>{result.xmlChecksum.slice(0, 16)}…</span>
            </div>
          </div>

          {isSimulation && (
            <div style={{ background: `${C.amber}14`, border: `1px solid ${C.amber}30`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontFamily: C.mono, color: C.amber, margin: 0 }}>
                Mode SIMULATION — le XML GoAML a été généré et validé mais pas transmis.
                Configurez TRANSMISSION_MODE=TRACFIN_PORTAL en production.
              </p>
            </div>
          )}

          <button onClick={onClose}
            style={{ width: "100%", padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, cursor: "pointer" }}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: "100%", maxWidth: 440 }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Radio size={15} style={{ color: "var(--wr-purple, #c084fc)" }} />
            <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: 0 }}>
              Transmission GoAML / TRACFIN
            </h3>
          </div>
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {report.reportId} — {report.title}
          </p>
        </div>

        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, margin: 0 }}>
            Générera le XML GoAML 2.0 et le transmettra au régulateur.
            La personne ci-dessous sera inscrite comme déclarant officiel.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3, marginBottom: 6 }}>
                Prénom *
              </label>
              <input
                value={declarant.declarantFirstName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDeclarant((d: TransmitDeclarant) => ({ ...d, declarantFirstName: e.target.value }))}
                placeholder="Marie"
                style={transmitInputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3, marginBottom: 6 }}>
                Nom *
              </label>
              <input
                value={declarant.declarantLastName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDeclarant((d: TransmitDeclarant) => ({ ...d, declarantLastName: e.target.value }))}
                placeholder="Martin"
                style={transmitInputStyle}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3, marginBottom: 6 }}>
              Fonction
            </label>
            <input
              value={declarant.declarantTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDeclarant((d: TransmitDeclarant) => ({ ...d, declarantTitle: e.target.value }))}
              placeholder="Responsable Conformité"
              style={transmitInputStyle}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3, marginBottom: 6 }}>
              Email *
            </label>
            <input
              type="email"
              value={declarant.declarantEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDeclarant((d: TransmitDeclarant) => ({ ...d, declarantEmail: e.target.value }))}
              placeholder="compliance@banque.fr"
              style={transmitInputStyle}
            />
          </div>

          {error && (
            <div style={{ background: `${C.red}14`, border: `1px solid ${C.red}30`, borderRadius: 6, padding: 8 }}>
              <p style={{ fontSize: 12, fontFamily: C.mono, color: C.red, margin: 0 }}>{error}</p>
            </div>
          )}

          <div style={{ background: C.hover, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, lineHeight: 1.6, margin: 0 }}>
              Le rapport sera transmis conformément au format XML GoAML 2.0 (FATF/UNODC).
              Un accusé de réception avec numéro de référence TRACFIN sera enregistré.
            </p>
          </div>
        </div>

        <div style={{ padding: "0 24px 20px", display: "flex", gap: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, cursor: "pointer" }}>
            {t.common.cancel}
          </button>
          <button
            disabled={!isValid || isPending}
            onClick={() => onConfirm(declarant)}
            style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: "var(--wr-purple, #c084fc)14", border: "1px solid var(--wr-purple, #c084fc)30", borderRadius: 7, color: "var(--wr-purple, #c084fc)", cursor: "pointer", opacity: (!isValid || isPending) ? 0.4 : 1 }}
          >
            {isPending ? t.common.loading : t.reports.transmit}
          </button>
        </div>
      </div>
    </div>
  );
}
