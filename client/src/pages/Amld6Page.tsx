import { useState } from "react";
import { AppLayout }  from "../components/layout/AppLayout";
import { StatCard }   from "../components/ui/StatCard";
import { trpc }       from "../lib/trpc";
import { useI18n }    from "../hooks/useI18n";
import { useAuth }    from "../hooks/useAuth";
import { hasRole }    from "../lib/auth";
import {
  Download, RefreshCw, AlertTriangle,
  FileText, Users, Activity,
} from "lucide-react";

// ─── Palette (identique au Dashboard) ────────────────────────────────────────
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
};

// ─── Types ────────────────────────────────────────────────────────────────────
type KpiData = {
  period: { from: string; to: string };
  generatedAt: string;
  transactions: { total: number; totalAmount: number; suspicious: number; blocked: number; detectionRate: number };
  alerts: {
    total: number;
    byLevel: { critical: number; high: number; medium: number; low: number };
    resolved: number; dismissed: number; falsePositiveRate: number; avgResolutionDaysFiltered: number;
  };
  declarations: { sarCount: number; strCount: number; submitted: number; avgDaysToSubmit: number };
  customers: {
    total: number;
    byRiskLevel: { critical: number; high: number; medium: number; low: number };
    pepActive: number; sanctionMatch: number; kycApproved: number; kycCoverage: number;
  };
  screening: { total: number; matchCount: number; reviewCount: number; clearCount: number; matchRate: number };
  cases: { opened: number; closed: number; escalated: number; avgDurationDays: number };
  compliance: { alertSlaBreaches: number; avgAlertAgeOpenDays: number; mfaAdoptionRate: number };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtNum  = (n: number) => n.toLocaleString("fr-FR");
const fmtEur  = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fmtPct  = (n: number) => `${n.toFixed(1)} %`;
const fmtDays = (n: number) => `${n.toFixed(1)} j`;

// ─── Card (identique au Dashboard) ───────────────────────────────────────────
function Card({ title, right, children, noPad = false }: {
  title: string; right?: React.ReactNode; children: React.ReactNode; noPad?: boolean;
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 10, fontFamily: C.mono, letterSpacing: "0.16em", textTransform: "uppercase", color: C.text2, margin: 0, fontWeight: 600 }}>
          {title}
        </p>
        {right}
      </div>
      <div style={noPad ? {} : { padding: "14px 18px" }}>{children}</div>
    </div>
  );
}

// ─── Mini-stat (à l'intérieur d'une Card) ────────────────────────────────────
function MiniStat({ label, value, color, warn = false }: {
  label: string; value: string; color?: string | undefined; warn?: boolean | undefined;
}) {
  return (
    <div style={{ background: "var(--wr-hover)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.14em", textTransform: "uppercase", color: C.text3 }}>{label}</span>
        {warn && <AlertTriangle size={10} style={{ color: C.amber }} />}
      </div>
      <p style={{ fontSize: 22, fontWeight: 600, fontFamily: C.serif, color: color ?? C.text1, margin: 0, lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );
}

// ─── Barre de risque (identique au Dashboard) ─────────────────────────────────
const RISK_COLORS: Record<string, string> = {
  CRITICAL: "#FF5252", HIGH: "#F87171", MEDIUM: "#FB923C", LOW: "#34D399",
};

function RiskBar({ byLevel, total }: {
  byLevel: { critical: number; high: number; medium: number; low: number }; total: number;
}) {
  if (!total) return <p style={{ fontSize: 12, color: C.text3, fontFamily: C.mono }}>Aucune donnée</p>;
  const items = [
    { key: "CRITICAL", value: byLevel.critical },
    { key: "HIGH",     value: byLevel.high },
    { key: "MEDIUM",   value: byLevel.medium },
    { key: "LOW",      value: byLevel.low },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
        {items.map(({ key, value }) => (
          <div key={key} style={{ width: `${(value / total) * 100}%`, background: RISK_COLORS[key], borderRadius: 2 }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {items.map(({ key, value }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: RISK_COLORS[key] }} />
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{key}</span>
            <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text1, fontWeight: 600 }}>{fmtNum(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export function Amld6Page() {
  const { t }     = useI18n();
  const { user }  = useAuth();
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
        const a    = document.createElement("a"); a.href = url; a.download = result.filename; a.click();
        URL.revokeObjectURL(url);
      },
    });
  }

  const kpi = data as KpiData | undefined;

  const warnings = kpi ? [
    kpi.compliance.alertSlaBreaches > 0  && `${kpi.compliance.alertSlaBreaches} alerte(s) dépassent le SLA de 5 jours ouvrés (AMLD6 Art. 35)`,
    kpi.customers.kycCoverage < 80       && `Couverture KYC à ${fmtPct(kpi.customers.kycCoverage)} — objectif réglementaire : 100 % (AMLD5 Art. 13)`,
    kpi.compliance.mfaAdoptionRate < 80  && `Taux MFA à ${fmtPct(kpi.compliance.mfaAdoptionRate)} — recommandation EBA : MFA obligatoire`,
  ].filter(Boolean) as string[] : [];

  return (
    <AppLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── En-tête ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>
              {t.amld6.title}
            </h1>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>{t.amld6.subtitle}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              value={fromYear}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFromYear(e.target.value)}
              style={{ background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 8, padding: "7px 12px", fontSize: 11, fontFamily: C.mono, color: C.text2, cursor: "pointer" }}
            >
              {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
            <button onClick={() => refetch()} disabled={isFetching}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 8, fontSize: 11, fontFamily: C.mono, color: C.text2, cursor: "pointer" }}>
              <RefreshCw size={12} style={{ animation: isFetching ? "spin 1s linear infinite" : "none" }} />
              {t.common.refresh}
            </button>
            {canExport && (
              <button onClick={handleExport} disabled={!kpi || exportMutation.isPending}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 8, fontSize: 11, fontFamily: C.mono, color: C.green, cursor: "pointer", opacity: (!kpi || exportMutation.isPending) ? 0.4 : 1 }}>
                <Download size={12} />
                {exportMutation.isPending ? t.common.loading : t.common.export}
              </button>
            )}
          </div>
        </div>

        {/* ── Skeleton ── */}
        {isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 96, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, opacity: 0.5 }} />
            ))}
          </div>
        )}

        {/* ── Pas de données ── */}
        {!isLoading && !kpi && (
          <div style={{ textAlign: "center", padding: "80px 0", fontSize: 12, fontFamily: C.mono, color: C.text3 }}>
            {t.amld6.noData} — {fromYear}
          </div>
        )}

        {/* ── Dashboard ── */}
        {kpi && (
          <>
            {/* Bandeau période */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{t.amld6.period}</span>
              <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text2 }}>
                {new Date(kpi.period.from).toLocaleDateString("fr-FR")} → {new Date(kpi.period.to).toLocaleDateString("fr-FR")}
              </span>
              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4 }}>
                {t.amld6.generatedOn} {new Date(kpi.generatedAt).toLocaleString("fr-FR")}
              </span>
            </div>

            {/* ── Ligne 1 : 4 StatCards hero ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              <StatCard
                label={t.amld6.analyzed}
                value={fmtNum(kpi.transactions.total)}
                sub={fmtEur(kpi.transactions.totalAmount)}
                icon={Activity}
                accent="default"
              />
              <StatCard
                label={t.amld6.totalAlerts}
                value={fmtNum(kpi.alerts.total)}
                sub={`${fmtNum(kpi.alerts.byLevel.critical)} critiques`}
                icon={AlertTriangle}
                accent={kpi.alerts.byLevel.critical > 0 ? "danger" : "default"}
              />
              <StatCard
                label="SAR + STR déclarées"
                value={fmtNum(kpi.declarations.sarCount + kpi.declarations.strCount)}
                sub={`${fmtNum(kpi.declarations.submitted)} soumises au régulateur`}
                icon={FileText}
                accent={kpi.declarations.sarCount + kpi.declarations.strCount > 0 ? "warning" : "default"}
              />
              <StatCard
                label={t.amld6.kycCoverage}
                value={fmtPct(kpi.customers.kycCoverage)}
                sub={`${fmtNum(kpi.customers.total)} clients totaux`}
                icon={Users}
                accent={kpi.customers.kycCoverage >= 90 ? "success" : kpi.customers.kycCoverage >= 70 ? "warning" : "danger"}
              />
            </div>

            {/* ── Ligne 2 : Transactions | Alertes | Déclarations ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

              {/* Transactions */}
              <Card title={t.nav.transactions} right={
                <span style={{ fontSize: 10, fontFamily: C.mono, color: kpi.transactions.detectionRate > 5 ? C.amber : C.green }}>
                  {fmtPct(kpi.transactions.detectionRate)} détectés
                </span>
              }>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <MiniStat label={t.amld6.analyzed}    value={fmtNum(kpi.transactions.total)} />
                  <MiniStat label={t.amld6.totalVolume} value={fmtEur(kpi.transactions.totalAmount)} />
                  <MiniStat label={t.amld6.suspicious}  value={fmtNum(kpi.transactions.suspicious)}
                    color={kpi.transactions.suspicious > 0 ? C.amber : undefined} warn={kpi.transactions.suspicious > 0} />
                  <MiniStat label={t.amld6.blocked}     value={fmtNum(kpi.transactions.blocked)}
                    color={kpi.transactions.blocked > 0 ? C.red : undefined} />
                </div>
              </Card>

              {/* Alertes */}
              <Card title={t.amld6.riskAssessment}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  <MiniStat label={t.amld6.totalAlerts}        value={fmtNum(kpi.alerts.total)} />
                  <MiniStat label={t.amld6.falsePositiveRate}  value={fmtPct(kpi.alerts.falsePositiveRate)}
                    color={kpi.alerts.falsePositiveRate > 30 ? C.amber : C.green} warn={kpi.alerts.falsePositiveRate > 50} />
                  <MiniStat label={t.amld6.avgResolutionTime}  value={fmtDays(kpi.alerts.avgResolutionDaysFiltered)}
                    color={kpi.alerts.avgResolutionDaysFiltered > 5 ? C.amber : C.green} />
                  <MiniStat label={t.amld6.slaViolations}      value={fmtNum(kpi.compliance.alertSlaBreaches)}
                    color={kpi.compliance.alertSlaBreaches > 0 ? C.red : C.green} warn={kpi.compliance.alertSlaBreaches > 0} />
                </div>
                <p style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.14em", textTransform: "uppercase", color: C.text3, marginBottom: 8 }}>
                  {t.amld6.byPriority}
                </p>
                <RiskBar byLevel={kpi.alerts.byLevel} total={kpi.alerts.total} />
              </Card>

              {/* Déclarations */}
              <Card title={t.amld6.reporting}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <MiniStat label={t.amld6.sarIssued}           value={fmtNum(kpi.declarations.sarCount)}   color={C.blue} />
                  <MiniStat label={t.amld6.strIssued}           value={fmtNum(kpi.declarations.strCount)}   color="var(--wr-purple, #a78bfa)" />
                  <MiniStat label={t.amld6.submittedRegulator}  value={fmtNum(kpi.declarations.submitted)}
                    color={kpi.declarations.submitted > 0 ? C.green : undefined}
                    warn={false} />
                  <MiniStat label={t.amld6.avgSubmissionTime}   value={fmtDays(kpi.declarations.avgDaysToSubmit)}
                    color={kpi.declarations.avgDaysToSubmit > 30 ? C.amber : C.green} />
                </div>
              </Card>
            </div>

            {/* ── Ligne 3 : Clients | Screening + Dossiers ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

              {/* Clients */}
              <Card title={t.amld6.beneficialOwner}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
                  <MiniStat label={t.dashboard.totalCustomers} value={fmtNum(kpi.customers.total)} />
                  <MiniStat label={t.amld6.kycCoverage}        value={fmtPct(kpi.customers.kycCoverage)}
                    color={kpi.customers.kycCoverage >= 90 ? C.green : kpi.customers.kycCoverage >= 70 ? C.amber : C.red}
                    warn={kpi.customers.kycCoverage < 80} />
                  <MiniStat label={t.amld6.pepCustomers}       value={fmtNum(kpi.customers.pepActive)}
                    color={kpi.customers.pepActive > 0 ? C.amber : undefined} />
                  <MiniStat label={t.amld6.sanctionMatches}    value={fmtNum(kpi.customers.sanctionMatch)}
                    color={kpi.customers.sanctionMatch > 0 ? C.red : C.green} warn={kpi.customers.sanctionMatch > 0} />
                </div>
                <p style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.14em", textTransform: "uppercase", color: C.text3, marginBottom: 8 }}>
                  {t.amld6.byRiskLevel}
                </p>
                <RiskBar byLevel={kpi.customers.byRiskLevel} total={kpi.customers.total} />
              </Card>

              {/* Screening + Dossiers empilés */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Card title={t.amld6.predicate} right={
                  <span style={{ fontSize: 10, fontFamily: C.mono, color: kpi.screening.matchRate > 0 ? C.amber : C.green }}>
                    {fmtPct(kpi.screening.matchRate)} match rate
                  </span>
                }>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                    <MiniStat label={t.amld6.totalScreenings} value={fmtNum(kpi.screening.total)} />
                    <MiniStat label={t.amld6.matches}         value={fmtNum(kpi.screening.matchCount)}
                      color={kpi.screening.matchCount > 0 ? C.red : C.green} warn={kpi.screening.matchCount > 0} />
                    <MiniStat label={t.amld6.inReview}        value={fmtNum(kpi.screening.reviewCount)} color={C.amber} />
                    <MiniStat label="Clears"                  value={fmtNum(kpi.screening.clearCount)}  color={C.green} />
                  </div>
                </Card>

                <Card title={t.nav.cases} right={
                  <span style={{ fontSize: 10, fontFamily: C.mono, color: kpi.cases.avgDurationDays > 30 ? C.amber : C.green }}>
                    moy. {fmtDays(kpi.cases.avgDurationDays)}
                  </span>
                }>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                    <MiniStat label={t.amld6.opened}    value={fmtNum(kpi.cases.opened)} />
                    <MiniStat label={t.amld6.closed_}   value={fmtNum(kpi.cases.closed)}    color={C.green} />
                    {kpi.cases.escalated > 0
                      ? <MiniStat label={t.amld6.escalated} value={fmtNum(kpi.cases.escalated)} color={C.amber} />
                      : <MiniStat label={t.amld6.escalated} value={fmtNum(kpi.cases.escalated)} />
                    }
                    <MiniStat label={t.amld6.avgDuration} value={fmtDays(kpi.cases.avgDurationDays)}
                      color={kpi.cases.avgDurationDays > 30 ? C.amber : C.green} />
                  </div>
                </Card>
              </div>
            </div>

            {/* ── Ligne 4 : Conformité ── */}
            <Card title={t.nav.compliance} right={
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: kpi.compliance.alertSlaBreaches === 0 && kpi.compliance.mfaAdoptionRate >= 80 ? C.green : C.amber }} />
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
                  {kpi.compliance.alertSlaBreaches === 0 && kpi.compliance.mfaAdoptionRate >= 80 ? "Conforme" : "Attention requise"}
                </span>
              </div>
            }>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <MiniStat
                  label={t.amld6.mfaAdoption}
                  value={fmtPct(kpi.compliance.mfaAdoptionRate)}
                  color={kpi.compliance.mfaAdoptionRate >= 100 ? C.green : kpi.compliance.mfaAdoptionRate >= 50 ? C.amber : C.red}
                  warn={kpi.compliance.mfaAdoptionRate < 80}
                />
                <MiniStat
                  label={t.amld6.alertSlaViolations}
                  value={fmtNum(kpi.compliance.alertSlaBreaches)}
                  color={kpi.compliance.alertSlaBreaches === 0 ? C.green : C.red}
                  warn={kpi.compliance.alertSlaBreaches > 0}
                />
                <MiniStat
                  label={t.amld6.avgOpenAlertAge}
                  value={fmtDays(kpi.compliance.avgAlertAgeOpenDays)}
                  color={kpi.compliance.avgAlertAgeOpenDays <= 5 ? C.green : C.amber}
                />
              </div>
            </Card>

            {/* ── Avertissements réglementaires ── */}
            {warnings.length > 0 && (
              <div style={{ background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.2)", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <AlertTriangle size={14} style={{ color: C.amber }} />
                  <p style={{ fontSize: 10, fontFamily: C.mono, letterSpacing: "0.16em", textTransform: "uppercase", color: C.amber, fontWeight: 600, margin: 0 }}>
                    {t.amld6.regulatoryAlerts}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {warnings.map((w, i) => (
                    <p key={i} style={{ fontSize: 12, fontFamily: C.mono, color: "rgba(251,146,60,0.8)", margin: 0 }}>• {w}</p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
