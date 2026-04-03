import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { useI18n } from "../hooks/useI18n";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import {
  BarChart2, Download, RefreshCw, AlertTriangle,
  Shield, FileText, Users, Activity, CheckCircle,
} from "lucide-react";

// ─── Types locaux ─────────────────────────────────────────────────────────────

type KpiData = {
  period: { from: string; to: string };
  generatedAt: string;
  transactions: {
    total: number; totalAmount: number;
    suspicious: number; blocked: number; detectionRate: number;
  };
  alerts: {
    total: number;
    byLevel: { critical: number; high: number; medium: number; low: number };
    resolved: number; dismissed: number;
    falsePositiveRate: number; avgResolutionDaysFiltered: number;
  };
  declarations: {
    sarCount: number; strCount: number;
    submitted: number; avgDaysToSubmit: number;
  };
  customers: {
    total: number;
    byRiskLevel: { critical: number; high: number; medium: number; low: number };
    pepActive: number; sanctionMatch: number;
    kycApproved: number; kycCoverage: number;
  };
  screening: {
    total: number; matchCount: number;
    reviewCount: number; clearCount: number; matchRate: number;
  };
  cases: {
    opened: number; closed: number;
    escalated: number; avgDurationDays: number;
  };
  compliance: {
    alertSlaBreaches: number;
    avgAlertAgeOpenDays: number;
    mfaAdoptionRate: number;
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("fr-FR");
}
function fmtEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number): string {
  return `${n.toFixed(1)} %`;
}
function fmtDays(n: number): string {
  return `${n.toFixed(1)} j`;
}

// ─── Composants ──────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = "default", warning = false,
}: {
  label: string; value: string; sub?: string;
  color?: "green" | "red" | "amber" | "blue" | "purple" | "default";
  warning?: boolean;
}) {
  const colors = {
    green:   "border-emerald-400/20 bg-emerald-400/5",
    red:     "border-red-400/20     bg-red-400/5",
    amber:   "border-amber-400/20   bg-amber-400/5",
    blue:    "border-blue-400/20    bg-blue-400/5",
    purple:  "border-purple-400/20  bg-purple-400/5",
    default: "border-[#21262d]      bg-[#0d1117]",
  };
  const valueColors = {
    green: "text-emerald-400", red: "text-red-400", amber: "text-amber-400",
    blue: "text-[#58a6ff]", purple: "text-purple-400", default: "text-[#e6edf3]",
  };

  return (
    <div className={`border rounded-lg p-4 ${colors[color]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase leading-tight">
          {label}
        </p>
        {warning && <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />}
      </div>
      <p className={`text-2xl font-semibold font-mono mt-2 ${valueColors[color]}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] font-mono text-[#484f58] mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-[#7d8590]" />
        <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function RiskBar({ critical, high, medium, low, total, noDataLabel = "—" }: {
  critical: number; high: number; medium: number; low: number; total: number; noDataLabel?: string;
}) {
  if (total === 0) return <p className="text-xs font-mono text-[#484f58]">{noDataLabel}</p>;
  const pct = (n: number) => `${Math.round(n / total * 100)}%`;
  return (
    <div className="space-y-2">
      {[
        { label: "CRITICAL", count: critical, color: "bg-red-400" },
        { label: "HIGH",     count: high,     color: "bg-amber-400" },
        { label: "MEDIUM",   count: medium,   color: "bg-yellow-400" },
        { label: "LOW",      count: low,      color: "bg-emerald-400" },
      ].map(({ label, count, color }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-[#484f58] w-16">{label}</span>
          <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
            <div className={`h-full ${color} rounded-full`} style={{ width: pct(count) }} />
          </div>
          <span className="text-[10px] font-mono text-[#7d8590] w-10 text-right">
            {fmtNum(count)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function Amld6Page() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canExport = hasRole(user, "compliance_officer");

  const currentYear = new Date().getFullYear();
  const [fromYear, setFromYear] = useState(String(currentYear));

  const fromDate = `${fromYear}-01-01T00:00:00.000Z`;
  const toDate   = `${fromYear}-12-31T23:59:59.999Z`;

  const { data, isLoading, refetch, isFetching } = trpc.reports.amld6Stats.useQuery(
    { from: fromDate, to: toDate },
    { refetchOnWindowFocus: false }
  );
  const exportMutation = trpc.reports.amld6ExportCsv.useMutation();

  function handleExport() {
    exportMutation.mutate({ from: fromDate, to: toDate }, {
      onSuccess: (result: { csv: string; filename: string }) => {
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  }

  const kpi = data as KpiData | undefined;

  return (
    <AppLayout>
      {/* En-tête */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">
            {t.amld6.title}
          </h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            {t.amld6.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sélecteur année */}
          <select
            value={fromYear}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
              setFromYear(e.target.value)}
            className="bg-[#161b22] border border-[#30363d] rounded-md px-3 py-1.5 text-xs font-mono text-[#e6edf3] focus:outline-none"
          >
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] rounded-md"
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            {t.common.refresh}
          </button>

          {canExport && (
            <button
              onClick={handleExport}
              disabled={!kpi || exportMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/20 rounded-md disabled:opacity-40"
            >
              <Download size={12} />
              {exportMutation.isPending ? t.common.loading : t.common.export}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-[#0d1117] border border-[#21262d] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !kpi ? (
        <div className="text-center py-16 text-xs font-mono text-[#484f58]">
          {t.amld6.noData} — {fromYear}
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Résumé exécutif ── */}
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
            <p className="text-[10px] font-mono text-[#484f58] mb-1">{t.amld6.period}</p>
            <p className="text-xs font-mono text-[#7d8590]">
              {new Date(kpi.period.from).toLocaleDateString("fr-FR")}
              {" → "}
              {new Date(kpi.period.to).toLocaleDateString("fr-FR")}
              <span className="ml-4 text-[#484f58]">
                {t.amld6.generatedOn} {new Date(kpi.generatedAt).toLocaleString("fr-FR")}
              </span>
            </p>
          </div>

          {/* ── Transactions ── */}
          <Section title={t.nav.transactions} icon={Activity}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard label={t.amld6.analyzed}     value={fmtNum(kpi.transactions.total)} />
              <KpiCard label={t.amld6.totalVolume}  value={fmtEur(kpi.transactions.totalAmount)} />
              <KpiCard
                label={t.amld6.suspicious}
                value={fmtNum(kpi.transactions.suspicious)}
                sub={fmtPct(kpi.transactions.detectionRate) + " du total"}
                color={kpi.transactions.suspicious > 0 ? "amber" : "default"}
              />
              <KpiCard
                label={t.amld6.blocked}
                value={fmtNum(kpi.transactions.blocked)}
                color={kpi.transactions.blocked > 0 ? "red" : "default"}
              />
              <KpiCard
                label={t.amld6.detectionRate}
                value={fmtPct(kpi.transactions.detectionRate)}
                color={kpi.transactions.detectionRate > 5 ? "amber" : "green"}
              />
            </div>
          </Section>

          {/* ── Alertes ── */}
          <Section title={t.amld6.riskAssessment} icon={AlertTriangle}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              <KpiCard label={t.amld6.totalAlerts} value={fmtNum(kpi.alerts.total)} />
              <KpiCard
                label={t.amld6.falsePositiveRate}
                value={fmtPct(kpi.alerts.falsePositiveRate)}
                color={kpi.alerts.falsePositiveRate > 30 ? "amber" : "green"}
                warning={kpi.alerts.falsePositiveRate > 50}
              />
              <KpiCard
                label={t.amld6.avgResolutionTime}
                value={fmtDays(kpi.alerts.avgResolutionDaysFiltered)}
                color={kpi.alerts.avgResolutionDaysFiltered > 5 ? "amber" : "green"}
              />
              <KpiCard
                label={t.amld6.slaViolations}
                value={fmtNum(kpi.compliance.alertSlaBreaches)}
                color={kpi.compliance.alertSlaBreaches > 0 ? "red" : "green"}
                warning={kpi.compliance.alertSlaBreaches > 0}
              />
            </div>
            <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
              <p className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-3">
                {t.amld6.byPriority}
              </p>
              <RiskBar
                critical={kpi.alerts.byLevel.critical}
                high={kpi.alerts.byLevel.high}
                medium={kpi.alerts.byLevel.medium}
                low={kpi.alerts.byLevel.low}
                total={kpi.alerts.total}
                noDataLabel={t.common.noData}
              />
            </div>
          </Section>

          {/* ── Déclarations ── */}
          <Section title={t.amld6.reporting} icon={FileText}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label={t.amld6.sarIssued} value={fmtNum(kpi.declarations.sarCount)} color="blue" />
              <KpiCard label={t.amld6.strIssued} value={fmtNum(kpi.declarations.strCount)} color="purple" />
              <KpiCard label={t.amld6.submittedRegulator} value={fmtNum(kpi.declarations.submitted)}
                sub={kpi.declarations.sarCount + kpi.declarations.strCount > 0
                  ? fmtPct(kpi.declarations.submitted / (kpi.declarations.sarCount + kpi.declarations.strCount) * 100) + " du total"
                  : ""}
                color={kpi.declarations.submitted > 0 ? "green" : "default"}
              />
              <KpiCard
                label={t.amld6.avgSubmissionTime}
                value={fmtDays(kpi.declarations.avgDaysToSubmit)}
                color={kpi.declarations.avgDaysToSubmit > 30 ? "amber" : "green"}
              />
            </div>
          </Section>

          {/* ── Clients ── */}
          <Section title={t.amld6.beneficialOwner} icon={Users}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              <KpiCard label={t.dashboard.totalCustomers} value={fmtNum(kpi.customers.total)} />
              <KpiCard
                label={t.amld6.kycCoverage}
                value={fmtPct(kpi.customers.kycCoverage)}
                color={kpi.customers.kycCoverage >= 90 ? "green" : kpi.customers.kycCoverage >= 70 ? "amber" : "red"}
                warning={kpi.customers.kycCoverage < 80}
              />
              <KpiCard
                label={t.amld6.pepCustomers}
                value={fmtNum(kpi.customers.pepActive)}
                color={kpi.customers.pepActive > 0 ? "amber" : "default"}
              />
              <KpiCard
                label={t.amld6.sanctionMatches}
                value={fmtNum(kpi.customers.sanctionMatch)}
                color={kpi.customers.sanctionMatch > 0 ? "red" : "green"}
                warning={kpi.customers.sanctionMatch > 0}
              />
            </div>
            <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
              <p className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-3">
                {t.amld6.byRiskLevel}
              </p>
              <RiskBar
                critical={kpi.customers.byRiskLevel.critical}
                high={kpi.customers.byRiskLevel.high}
                medium={kpi.customers.byRiskLevel.medium}
                low={kpi.customers.byRiskLevel.low}
                total={kpi.customers.total}
                noDataLabel={t.common.noData}
              />
            </div>
          </Section>

          {/* ── Screening ── */}
          <Section title={t.amld6.predicate} icon={Shield}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label={t.amld6.totalScreenings} value={fmtNum(kpi.screening.total)} />
              <KpiCard
                label={t.amld6.matches}
                value={fmtNum(kpi.screening.matchCount)}
                color={kpi.screening.matchCount > 0 ? "red" : "green"}
                warning={kpi.screening.matchCount > 0}
              />
              <KpiCard label={t.amld6.inReview} value={fmtNum(kpi.screening.reviewCount)} color="amber" />
              <KpiCard
                label={t.amld6.matchRate}
                value={fmtPct(kpi.screening.matchRate)}
                color={kpi.screening.matchRate > 0 ? "amber" : "green"}
              />
            </div>
          </Section>

          {/* ── Dossiers ── */}
          <Section title={t.nav.cases} icon={BarChart2}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label={t.amld6.opened}    value={fmtNum(kpi.cases.opened)} />
              <KpiCard label={t.amld6.closed_}  value={fmtNum(kpi.cases.closed)} color="green" />
              <KpiCard label={t.amld6.escalated} value={fmtNum(kpi.cases.escalated)} color="amber" />
              <KpiCard
                label={t.amld6.avgDuration}
                value={fmtDays(kpi.cases.avgDurationDays)}
                color={kpi.cases.avgDurationDays > 30 ? "amber" : "green"}
              />
            </div>
          </Section>

          {/* ── Indicateurs de conformité ── */}
          <Section title={t.nav.compliance} icon={CheckCircle}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard
                label={t.amld6.mfaAdoption}
                value={fmtPct(kpi.compliance.mfaAdoptionRate)}
                color={kpi.compliance.mfaAdoptionRate >= 100 ? "green" : kpi.compliance.mfaAdoptionRate >= 50 ? "amber" : "red"}
                warning={kpi.compliance.mfaAdoptionRate < 80}
              />
              <KpiCard
                label={t.amld6.alertSlaViolations}
                value={fmtNum(kpi.compliance.alertSlaBreaches)}
                color={kpi.compliance.alertSlaBreaches === 0 ? "green" : "red"}
                warning={kpi.compliance.alertSlaBreaches > 0}
              />
              <KpiCard
                label={t.amld6.avgOpenAlertAge}
                value={fmtDays(kpi.compliance.avgAlertAgeOpenDays)}
                color={kpi.compliance.avgAlertAgeOpenDays <= 5 ? "green" : "amber"}
              />
            </div>

            {/* Avertissements réglementaires */}
            {(kpi.compliance.alertSlaBreaches > 0 || kpi.customers.kycCoverage < 80 || kpi.compliance.mfaAdoptionRate < 80) && (
              <div className="mt-4 bg-amber-400/10 border border-amber-400/20 rounded-lg p-4 space-y-2">
                <p className="text-xs font-mono text-amber-400 font-semibold">{t.amld6.regulatoryAlerts}</p>
                {kpi.compliance.alertSlaBreaches > 0 && (
                  <p className="text-xs font-mono text-amber-400/80">
                    • {kpi.compliance.alertSlaBreaches} alerte(s) dépassent le SLA de 5 jours ouvrés (AMLD6 Art. 35)
                  </p>
                )}
                {kpi.customers.kycCoverage < 80 && (
                  <p className="text-xs font-mono text-amber-400/80">
                    • Couverture KYC à {fmtPct(kpi.customers.kycCoverage)} — objectif réglementaire : 100% (AMLD5 Art. 13)
                  </p>
                )}
                {kpi.compliance.mfaAdoptionRate < 80 && (
                  <p className="text-xs font-mono text-amber-400/80">
                    • Taux MFA à {fmtPct(kpi.compliance.mfaAdoptionRate)} — recommandation EBA : MFA obligatoire pour tous les utilisateurs
                  </p>
                )}
              </div>
            )}
          </Section>
        </div>
      )}
    </AppLayout>
  );
}
