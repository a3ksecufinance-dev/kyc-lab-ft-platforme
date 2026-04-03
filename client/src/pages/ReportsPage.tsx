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
        <div className="flex items-center gap-1.5">
          <FileText size={11} className="text-[#7d8590]" />
          <span className="font-mono text-xs text-[#58a6ff]">{r.reportId}</span>
        </div>
      ),
    },
    {
      key: "type", header: t.reports.reportType, width: "w-20",
      render: (r) => (
        <span className={`font-mono text-xs font-semibold ${
          r.reportType === "SAR" ? "text-purple-400" : "text-orange-400"
        }`}>
          {r.reportType}
        </span>
      ),
    },
    {
      key: "title", header: t.reports.titleLabel,
      render: (r) => (
        <div>
          <p className="text-xs text-[#e6edf3] truncate max-w-xs">{r.title}</p>
          <p className="text-[10px] font-mono text-[#7d8590] mt-0.5">
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
        ? <span className="font-mono text-[10px] text-[#7d8590]">{formatDate(r.submittedAt)}</span>
        : <span className="text-[#484f58]">—</span>,
    },
    {
      key: "date", header: t.common.date, width: "w-28",
      render: (r) => <span className="font-mono text-[10px] text-[#7d8590]">{formatRelative(r.createdAt)}</span>,
    },
    {
      key: "actions", header: "", width: "w-44",
      render: (r) => (
        <div className="flex gap-1.5 flex-wrap">
          {r.status === "DRAFT" && (
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setActionTarget({ report: r, action: "submit" }); }}
              className="text-[10px] font-mono text-[#58a6ff] hover:underline flex items-center gap-1"
            >
              <Send size={10} /> {t.common.submit}
            </button>
          )}
          {r.status === "REVIEW" && canApprove && (
            <>
              <button
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setActionTarget({ report: r, action: "approve" }); }}
                className="text-[10px] font-mono text-emerald-400 hover:underline"
              >
                {t.common.approve}
              </button>
              {canReject && (
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); setActionTarget({ report: r, action: "reject" }); }}
                  className="text-[10px] font-mono text-red-400 hover:underline"
                >
                  {t.common.reject}
                </button>
              )}
            </>
          )}
          {(r.status === "SUBMITTED" || r.status === "APPROVED") && canApprove && (
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setTransmitTarget(r); }}
              className="text-[10px] font-mono text-purple-400 hover:underline flex items-center gap-1"
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
                className="text-[10px] font-mono text-[#484f58] hover:text-[#7d8590] flex items-center gap-1"
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
                className="text-[10px] font-mono text-red-400/60 hover:text-red-400 flex items-center gap-1 disabled:opacity-40"
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">{t.reports.title}</h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            {data ? formatNumber(data.total) : "—"} {t.reports.subtitle}
          </p>
        </div>
        {pageTab === "reports" && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 hover:bg-[#1f6feb]/30 text-[#58a6ff] rounded-md transition-colors"
          >
            <FilePlus size={13} /> {t.reports.generateReport}
          </button>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-0 border-b border-[#21262d] mb-5">
        {([
          { id: "reports", label: "SAR / STR", icon: FileText },
          { id: "amld6",   label: "AMLD6 KPIs", icon: BarChart3 },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPageTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono border-b-2 transition-colors ${
              pageTab === id
                ? "border-[#58a6ff] text-[#58a6ff]"
                : "border-transparent text-[#7d8590] hover:text-[#e6edf3]"
            }`}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {pageTab === "amld6" && <Amld6Panel canApprove={canApprove} />}

      {pageTab === "reports" && <>
        <div className="flex gap-3 mb-4">
          <select
            value={reportType}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setReportType(e.target.value); setPage(1); }}
            className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
          >
            <option value="">{t.reports.sarAndStr}</option>
            <option value="SAR">{t.reports.sarOnly}</option>
            <option value="STR">{t.reports.strOnly}</option>
          </select>
          <select
            value={status}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setStatus(e.target.value); setPage(1); }}
            className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
          >
            <option value="">{t.common.all}</option>
            <option value="DRAFT">{t.reports.statusDraft}</option>
            <option value="REVIEW">{t.reports.statusInReview}</option>
            <option value="SUBMITTED">{t.reports.statusSubmitted}</option>
            <option value="APPROVED">{t.reports.statusApproved}</option>
            <option value="REJECTED">{t.reports.statusRejected}</option>
          </select>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-slide-in">
            <div className="px-6 pt-5 pb-0 flex-shrink-0">
              <h3 className="text-sm font-semibold text-[#e6edf3] font-mono mb-4">{t.reports.newReport}</h3>
              <div className="flex gap-0 border-b border-[#21262d]">
                {(["SAR", "STR"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setCreateTab(t)}
                    className={`px-4 py-2 text-xs font-mono border-b-2 transition-colors ${
                      createTab === t
                        ? "border-[#58a6ff] text-[#58a6ff]"
                        : "border-transparent text-[#7d8590] hover:text-[#e6edf3]"
                    }`}
                  >
                    {t === "SAR" ? "SAR — Activité suspecte" : "STR — Transaction suspecte"}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-y-auto px-6 py-4 flex-1">
              {createTab === "SAR"
                ? <SarFormFields form={sarForm} onChange={setSarForm} />
                : <StrFormFields form={strForm} onChange={setStrForm} />
              }
              {(createSarMutation.error ?? createStrMutation.error) && (
                <p className="mt-3 text-xs font-mono text-red-400">
                  {(createSarMutation.error ?? createStrMutation.error)?.message}
                </p>
              )}
            </div>
            <div className="px-6 pb-5 pt-3 flex gap-2 flex-shrink-0 border-t border-[#21262d]">
              <button
                onClick={() => { setShowCreate(false); setSarForm(DEFAULT_SAR); setStrForm(DEFAULT_STR); }}
                className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] rounded-md"
              >
                {t.common.cancel}
              </button>
              <button
                disabled={
                  (createTab === "SAR" ? !sarValid : !strValid) ||
                  createSarMutation.isPending || createStrMutation.isPending
                }
                onClick={createTab === "SAR" ? handleCreateSar : handleCreateStr}
                className="flex-1 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 hover:bg-[#1f6feb]/30 text-[#58a6ff] rounded-md disabled:opacity-40"
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
      <div className="flex items-center justify-center py-20">
        <p className="text-xs font-mono text-[#7d8590] animate-pulse">{t.reports.computingKpis}</p>
      </div>
    );
  }

  if (!kpis) return null;

  function KpiCard({ title, value, sub, accent }: {
    title: string; value: string | number; sub?: string; accent?: string;
  }) {
    return (
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
        <p className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-2">{title}</p>
        <p className={`text-2xl font-bold font-mono ${accent ?? "text-[#e6edf3]"}`}>
          {typeof value === "number" ? formatNumber(value) : value}
        </p>
        {sub && <p className="text-[10px] font-mono text-[#484f58] mt-1">{sub}</p>}
      </div>
    );
  }

  const { transactions: tx, alerts: al, declarations: decl, customers: cust, screening: sc, cases: cs, compliance: sla } = kpis;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-[#7d8590]">
          Période : 1 janv. {now.getFullYear()} → aujourd'hui
          {kpis.generatedAt
            ? ` · Généré ${new Date(kpis.generatedAt).toLocaleTimeString("fr-FR")}`
            : ""}
        </p>
        {canApprove && (
          <div className="flex gap-2">
            <button
              onClick={() => exportCsvMutation.mutate(exportInput)}
              disabled={exportCsvMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] rounded-md disabled:opacity-40"
            >
              <Download size={11} /> {exportCsvMutation.isPending ? "…" : "CSV"}
            </button>
            <button
              onClick={() => exportPdfMutation.mutate(exportInput)}
              disabled={exportPdfMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-[#1f6feb]/10 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/20 rounded-md disabled:opacity-40"
            >
              <Download size={11} /> {exportPdfMutation.isPending ? t.amld6.generating : "PDF"}
            </button>
          </div>
        )}
      </div>

      {/* KPI 1 — Transactions */}
      <div>
        <p className="text-[10px] font-mono text-[#58a6ff] tracking-widest uppercase mb-3">
          {t.amld6.txAnalyzed}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title={t.amld6.totalLabel} value={tx.total} />
          <KpiCard title={t.amld6.amountEur} value={`${(tx.totalAmount / 1_000_000).toFixed(2)} M`} />
          <KpiCard title={t.amld6.suspicious_} value={tx.suspicious} accent="text-amber-400" />
          <KpiCard title={t.amld6.detectionRate} value={`${tx.detectionRate.toFixed(2)} %`}
            sub="% tx flaggées" accent={tx.detectionRate > 5 ? "text-red-400" : "text-emerald-400"} />
        </div>
      </div>

      {/* KPI 2 — Alertes */}
      <div>
        <p className="text-[10px] font-mono text-[#58a6ff] tracking-widest uppercase mb-3">
          {t.amld6.amlAlerts}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title={t.amld6.totalAlerts} value={al.total} />
          <KpiCard title="CRITICAL" value={al.byLevel.critical} accent="text-red-400" />
          <KpiCard title="HIGH" value={al.byLevel.high} accent="text-orange-400" />
          <KpiCard title={t.amld6.falsePositives} value={`${al.falsePositiveRate.toFixed(1)} %`}
            sub="alertes rejetées" />
        </div>
      </div>

      {/* KPI 3 — SAR/STR */}
      <div>
        <p className="text-[10px] font-mono text-[#58a6ff] tracking-widest uppercase mb-3">
          {t.amld6.sarStrDecl}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title={t.amld6.sarFiled} value={decl.sarCount} accent="text-purple-400" />
          <KpiCard title={t.amld6.strFiled} value={decl.strCount} accent="text-orange-400" />
          <KpiCard title={t.amld6.submitted_} value={decl.submitted} />
          <KpiCard title={t.amld6.avgDelay} value={`${decl.avgDaysToSubmit.toFixed(1)} j`}
            sub="création → soumission" accent={decl.avgDaysToSubmit > 5 ? "text-red-400" : "text-emerald-400"} />
        </div>
      </div>

      {/* KPI 4 — KYC & Screening */}
      <div>
        <p className="text-[10px] font-mono text-[#58a6ff] tracking-widest uppercase mb-3">
          {t.amld6.kycSanctions}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title={t.amld6.kycCoverage} value={`${cust.kycCoverage.toFixed(1)} %`}
            accent={cust.kycCoverage > 90 ? "text-emerald-400" : "text-amber-400"} />
          <KpiCard title={t.amld6.pepActive} value={cust.pepActive} accent="text-amber-400" />
          <KpiCard title={t.amld6.sanctionMatch} value={sc.matchCount}
            accent={sc.matchCount > 0 ? "text-red-400" : "text-emerald-400"} />
          <KpiCard title={t.amld6.sanctionReview} value={sc.reviewCount} />
        </div>
      </div>

      {/* KPI 5 — Dossiers & SLA */}
      <div>
        <p className="text-[10px] font-mono text-[#58a6ff] tracking-widest uppercase mb-3">
          {t.amld6.amlSla}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title={t.amld6.opened} value={cs.opened} accent="text-amber-400" />
          <KpiCard title={t.amld6.closed_} value={cs.closed} accent="text-emerald-400" />
          <KpiCard title={t.amld6.escalated} value={cs.escalated} accent="text-red-400" />
          <KpiCard title={t.amld6.slaBreached} value={sla.alertSlaBreaches}
            sub="alertes > 5 j ouvrés" accent={sla.alertSlaBreaches > 0 ? "text-red-400" : "text-emerald-400"} />
        </div>
      </div>

      {(exportCsvMutation.error || exportPdfMutation.error) && (
        <p className="text-xs font-mono text-red-400">
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
      <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40";
const textCls  = `${inputCls} resize-none`;

// ─── Formulaire SAR ───────────────────────────────────────────────────────────

function SarFormFields({ form, onChange }: {
  form: SarForm; onChange: (f: SarForm) => void;
}) {
  const set = (k: keyof SarForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-mono text-[#484f58] mb-3">
        Signalement d'activité suspecte — champs marqués <span className="text-red-400">*</span> obligatoires
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="ID Client" required>
          <input type="number" value={form.customerId} onChange={set("customerId")} placeholder="123" className={inputCls} />
        </FieldRow>
        <FieldRow label="ID Dossier">
          <input type="number" value={form.caseId} onChange={set("caseId")} placeholder="456" className={inputCls} />
        </FieldRow>
      </div>
      <FieldRow label="Titre" required>
        <input value={form.title} onChange={set("title")} placeholder="Ex : Structuration suspectée — client XYZ" className={inputCls} />
      </FieldRow>
      <FieldRow label="Type de suspicion" required>
        <input value={form.suspicionType} onChange={set("suspicionType")} placeholder="Ex : Structuring, PEP Transaction, High Frequency..." className={inputCls} />
      </FieldRow>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Montant impliqué">
          <input value={form.amountInvolved} onChange={set("amountInvolved")} placeholder="50000.00" className={inputCls} />
        </FieldRow>
        <FieldRow label="Devise">
          <input value={form.currency} onChange={set("currency")} placeholder="EUR" maxLength={3} className={inputCls} />
        </FieldRow>
      </div>
      <div className="pt-2 border-t border-[#21262d]">
        <p className="text-[10px] font-mono text-[#58a6ff] mb-3 tracking-widest uppercase">Contenu du rapport</p>
      </div>
      <FieldRow label="Description du sujet (min 10 car.)" required>
        <textarea value={form.subjectDescription} onChange={set("subjectDescription")} rows={2}
          placeholder="Identité, activité, relation bancaire..." className={textCls} />
      </FieldRow>
      <FieldRow label="Activités suspectes — une par ligne" required>
        <textarea value={form.suspiciousActivities} onChange={set("suspiciousActivities")} rows={3}
          placeholder={"Virements fractionnés\nDépôts cash récurrents\nTransactions vers pays à risque"} className={textCls} />
      </FieldRow>
      <FieldRow label="Résumé des preuves (min 20 car.)" required>
        <textarea value={form.evidenceSummary} onChange={set("evidenceSummary")} rows={2}
          placeholder="Documents collectés, incohérences détectées..." className={textCls} />
      </FieldRow>
      <FieldRow label="Narration détaillée (min 50 car.)" required>
        <textarea value={form.narrativeSummary} onChange={set("narrativeSummary")} rows={4}
          placeholder="Description chronologique des faits suspects..." className={textCls} />
      </FieldRow>
      <FieldRow label="Action recommandée">
        <textarea value={form.recommendedAction} onChange={set("recommendedAction")} rows={2}
          placeholder="Bloquer, signaler au régulateur, surveillance accrue..." className={textCls} />
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
    <div className="space-y-3">
      <p className="text-[10px] font-mono text-[#484f58] mb-3">
        Signalement de transaction suspecte — champs marqués <span className="text-red-400">*</span> obligatoires
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="ID Client" required>
          <input type="number" value={form.customerId} onChange={set("customerId")} placeholder="123" className={inputCls} />
        </FieldRow>
        <FieldRow label="ID Dossier">
          <input type="number" value={form.caseId} onChange={set("caseId")} placeholder="456" className={inputCls} />
        </FieldRow>
      </div>
      <FieldRow label="Titre" required>
        <input value={form.title} onChange={set("title")} placeholder="Ex : Virement suspect vers pays tiers" className={inputCls} />
      </FieldRow>
      <FieldRow label="Type de suspicion" required>
        <input value={form.suspicionType} onChange={set("suspicionType")} placeholder="Ex : Layering, Smurfing..." className={inputCls} />
      </FieldRow>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Montant impliqué" required>
          <input value={form.amountInvolved} onChange={set("amountInvolved")} placeholder="50000.00" className={inputCls} />
        </FieldRow>
        <FieldRow label="Devise">
          <input value={form.currency} onChange={set("currency")} placeholder="EUR" maxLength={3} className={inputCls} />
        </FieldRow>
      </div>
      <div className="pt-2 border-t border-[#21262d]">
        <p className="text-[10px] font-mono text-[#58a6ff] mb-3 tracking-widest uppercase">Détails de la transaction</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="ID Transaction" required>
          <input value={form.transactionId} onChange={set("transactionId")} placeholder="TXN-XXXXXXXX" className={inputCls} />
        </FieldRow>
        <FieldRow label="Date" required>
          <input type="datetime-local" value={form.transactionDate} onChange={set("transactionDate")} className={inputCls} />
        </FieldRow>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Montant tx" required>
          <input value={form.transactionAmount} onChange={set("transactionAmount")} placeholder="12500.00" className={inputCls} />
        </FieldRow>
        <FieldRow label="Type tx" required>
          <input value={form.transactionType} onChange={set("transactionType")} placeholder="TRANSFER, DEPOSIT..." className={inputCls} />
        </FieldRow>
      </div>
      <FieldRow label="Parties impliquées — une par ligne" required>
        <textarea value={form.involvedParties} onChange={set("involvedParties")} rows={2}
          placeholder={"Nom Prenom — Banque X\nSociété Y — Pays Z"} className={textCls} />
      </FieldRow>
      <FieldRow label="Base de la suspicion (min 10 car.)" required>
        <textarea value={form.suspicionBasis} onChange={set("suspicionBasis")} rows={2}
          placeholder="Raisons précises pour lesquelles cette transaction est suspecte..." className={textCls} />
      </FieldRow>
      <FieldRow label="Résumé des preuves (min 20 car.)" required>
        <textarea value={form.evidenceSummary} onChange={set("evidenceSummary")} rows={2}
          placeholder="Documents, relevés, communications analysés..." className={textCls} />
      </FieldRow>
      <FieldRow label="Narration détaillée (min 50 car.)" required>
        <textarea value={form.narrativeSummary} onChange={set("narrativeSummary")} rows={4}
          placeholder="Description chronologique des faits et contexte..." className={textCls} />
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 w-full max-w-sm animate-slide-in">
        <div className="flex items-center gap-2 mb-3">
          {action === "approve" && <CheckCircle size={16} className="text-emerald-400" />}
          {action === "reject"  && <XCircle    size={16} className="text-red-400" />}
          {action === "submit"  && <Send       size={16} className="text-[#58a6ff]" />}
          <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">
            {action === "submit"  ? "Soumettre pour révision" :
             action === "approve" ? "Approuver le rapport"    :
                                    "Rejeter le rapport"}
          </h3>
        </div>
        <p className="text-xs font-mono text-[#7d8590] mb-4">
          {report.reportId} — {report.title}
        </p>
        {action === "reject" && (
          <div className="mb-4">
            <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
              Motif <span className="text-red-400">*</span>
            </label>
            <textarea
              value={rejectNote}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Informations manquantes, erreurs... (min 10 car.)"
              className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-red-400/40 resize-none"
            />
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">
            {t.common.cancel}
          </button>
          <button
            disabled={!canConfirm || isPending}
            onClick={onConfirm}
            className={`flex-1 py-2 text-xs font-mono rounded-md border disabled:opacity-40
              ${action === "approve"
                ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-400"
                : action === "reject"
                ? "bg-red-400/10 border-red-400/30 text-red-400"
                : "bg-[#1f6feb]/20 border-[#1f6feb]/30 text-[#58a6ff]"
              }`}
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

  const inputCls = "w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-purple-400/40";
  const isValid  = declarant.declarantFirstName.length >= 2
                && declarant.declarantLastName.length  >= 2
                && declarant.declarantEmail.includes("@");

  // Après transmission réussie — afficher le résultat
  if (result) {
    const isSimulation = result.mode === "SIMULATION";
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className={`bg-[#0d1117] border rounded-xl p-6 w-full max-w-md ${
          result.status === "ERROR" ? "border-red-400/30" : "border-emerald-400/30"
        }`}>
          <div className="flex items-center gap-2 mb-4">
            {result.status === "ERROR"
              ? <XCircle size={18} className="text-red-400" />
              : <CheckCircle size={18} className="text-emerald-400" />
            }
            <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">
              {result.status === "ERROR" ? "Échec de transmission" : "Transmission réussie"}
            </h3>
          </div>

          <div className="space-y-2 mb-5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#7d8590]">Rapport</span>
              <span className="text-[#e6edf3]">{result.reportId}</span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#7d8590]">Transmission ID</span>
              <span className="text-[#e6edf3] text-[10px]">{result.transmissionId}</span>
            </div>
            {result.fiuRefNumber && (
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[#7d8590]">Réf. régulateur</span>
                <span className="text-emerald-400 font-semibold">{result.fiuRefNumber}</span>
              </div>
            )}
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#7d8590]">Mode</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
                isSimulation
                  ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                  : "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
              }`}>{result.mode}</span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#7d8590]">Taille XML</span>
              <span className="text-[#7d8590]">{(result.xmlSize / 1024).toFixed(1)} Ko</span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#7d8590]">Checksum</span>
              <span className="text-[#484f58] text-[10px]">{result.xmlChecksum.slice(0, 16)}…</span>
            </div>
          </div>

          {isSimulation && (
            <div className="bg-amber-400/10 border border-amber-400/20 rounded-lg p-3 mb-4">
              <p className="text-xs font-mono text-amber-400">
                Mode SIMULATION — le XML GoAML a été généré et validé mais pas transmis.
                Configurez TRANSMISSION_MODE=TRACFIN_PORTAL en production.
              </p>
            </div>
          )}

          <button onClick={onClose}
            className="w-full py-2 text-xs font-mono bg-[#161b22] border border-[#30363d] text-[#e6edf3] rounded-md hover:bg-[#21262d]">
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1117] border border-purple-400/20 rounded-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-[#21262d]">
          <div className="flex items-center gap-2 mb-1">
            <Radio size={15} className="text-purple-400" />
            <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">
              Transmission GoAML / TRACFIN
            </h3>
          </div>
          <p className="text-xs font-mono text-[#7d8590]">
            {report.reportId} — {report.title}
          </p>
        </div>

        <div className="px-6 py-4 space-y-3">
          <p className="text-[10px] font-mono text-[#484f58]">
            Générera le XML GoAML 2.0 et le transmettra au régulateur.
            La personne ci-dessous sera inscrite comme déclarant officiel.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1">
                Prénom *
              </label>
              <input
                value={declarant.declarantFirstName}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                  setDeclarant((d: TransmitDeclarant) => ({ ...d, declarantFirstName: e.target.value }))}
                placeholder="Marie"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1">
                Nom *
              </label>
              <input
                value={declarant.declarantLastName}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                  setDeclarant((d: TransmitDeclarant) => ({ ...d, declarantLastName: e.target.value }))}
                placeholder="Martin"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1">
              Fonction
            </label>
            <input
              value={declarant.declarantTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                setDeclarant((d: TransmitDeclarant) => ({ ...d, declarantTitle: e.target.value }))}
              placeholder="Responsable Conformité"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1">
              Email *
            </label>
            <input
              type="email"
              value={declarant.declarantEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                setDeclarant((d: TransmitDeclarant) => ({ ...d, declarantEmail: e.target.value }))}
              placeholder="compliance@banque.fr"
              className={inputCls}
            />
          </div>

          {error && (
            <div className="bg-red-400/10 border border-red-400/20 rounded p-2">
              <p className="text-xs font-mono text-red-400">{error}</p>
            </div>
          )}

          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-3">
            <p className="text-[10px] font-mono text-[#484f58] leading-relaxed">
              Le rapport sera transmis conformément au format XML GoAML 2.0 (FATF/UNODC).
              Un accusé de réception avec numéro de référence TRACFIN sera enregistré.
            </p>
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">
            {t.common.cancel}
          </button>
          <button
            disabled={!isValid || isPending}
            onClick={() => onConfirm(declarant)}
            className="flex-1 py-2 text-xs font-mono bg-purple-400/10 border border-purple-400/30 text-purple-400 hover:bg-purple-400/20 rounded-md disabled:opacity-40"
          >
            {isPending ? t.common.loading : t.reports.transmit}
          </button>
        </div>
      </div>
    </div>
  );
}
