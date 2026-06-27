import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { formatNumber, formatDateTime } from "../lib/utils";
import { useI18n } from "../hooks/useI18n";
import { BarChart2, Download, Calendar } from "lucide-react";
import { useInstitution } from "../context/InstitutionContext";

const C = {
  surface: "var(--wr-card)",
  border:  "var(--wr-border)",
  border2: "var(--wr-border2)",
  text1:   "var(--wr-text-1)",
  text2:   "var(--wr-text-2)",
  text3:   "var(--wr-text-3)",
  gold:    "var(--wr-gold)",
  red:     "var(--wr-red)",
  amber:   "var(--wr-amber)",
  green:   "var(--wr-green)",
  blue:    "var(--wr-blue)",
  mono:    "var(--wr-font-mono)",
};

type ReportType = "monthly" | "quarterly" | "annual";

const CURRENT_YEAR = new Date().getFullYear();

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
      <h3 style={{ fontSize: 12, fontWeight: 600, color: C.text2, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.1em" }}>{title}</h3>
      {children}
    </div>
  );
}

function KpiRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 12, color: C.text2 }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text1, fontWeight: 600 }}>{value}</span>
        {sub && <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text3, marginLeft: 6 }}>{sub}</span>}
      </div>
    </div>
  );
}

export function BamReportsPage() {
  const { t } = useI18n();
  const flags = useInstitution();
  const [reportType, setReportType] = useState<ReportType>("monthly");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [generate, setGenerate] = useState(false);

  const monthlyQuery = trpc.bam.monthly.useQuery(
    { year, month },
    { enabled: generate && reportType === "monthly" && flags.bamReports, retry: false }
  );

  const quarterlyQuery = trpc.bam.quarterly.useQuery(
    { year, quarter },
    { enabled: generate && reportType === "quarterly" && flags.bamReports, retry: false }
  );

  const annualQuery = trpc.bam.annual.useQuery(
    { year },
    { enabled: generate && reportType === "annual" && flags.bamReports, retry: false }
  );

  const activeQuery = reportType === "monthly" ? monthlyQuery
    : reportType === "quarterly" ? quarterlyQuery
    : annualQuery;

  const report = activeQuery.data;
  const isLoading = activeQuery.isLoading && generate;

  if (!flags.bamReports) {
    return (
      <AppLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
          <BarChart2 size={32} style={{ color: C.text3, opacity: 0.4 }} />
          <p style={{ color: C.text3, fontSize: 13 }}>{t.bam.moduleNotActive}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ padding: "24px 28px", maxWidth: 900 }}>

        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: C.text1, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart2 size={18} style={{ color: C.gold }} />
            {t.bam.title}
          </h1>
          <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
            {t.bam.circular} — {flags.institutionName}
          </p>
        </div>

        {/* ── Sélecteur de rapport ─────────────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 22px", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {(["monthly", "quarterly", "annual"] as ReportType[]).map(rt => (
              <button
                key={rt}
                onClick={() => { setReportType(rt); setGenerate(false); }}
                style={{
                  fontSize: 12, padding: "6px 16px", borderRadius: 8, cursor: "pointer",
                  border: reportType === rt ? "1px solid rgba(20,184,166,0.45)" : `1px solid ${C.border2}`,
                  background: reportType === rt ? "rgba(20,184,166,0.1)" : "transparent",
                  color: reportType === rt ? C.gold : C.text3,
                  fontWeight: reportType === rt ? 600 : 400,
                }}
              >
                {rt === "monthly" ? t.bam.monthly : rt === "quarterly" ? t.bam.quarterly : t.bam.annual}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: 11, color: C.text3, display: "block", marginBottom: 5 }}>{t.bam.year}</label>
              <select
                value={year}
                onChange={e => { setYear(Number(e.target.value)); setGenerate(false); }}
                style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border2}`,
                  background: "var(--wr-bg)", color: C.text1, outline: "none", cursor: "pointer" }}
              >
                {Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {reportType === "monthly" && (
              <div>
                <label style={{ fontSize: 11, color: C.text3, display: "block", marginBottom: 5 }}>{t.bam.month}</label>
                <select
                  value={month}
                  onChange={e => { setMonth(Number(e.target.value)); setGenerate(false); }}
                  style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border2}`,
                    background: "var(--wr-bg)", color: C.text1, outline: "none", cursor: "pointer" }}
                >
                  {t.bam.months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
            )}

            {reportType === "quarterly" && (
              <div>
                <label style={{ fontSize: 11, color: C.text3, display: "block", marginBottom: 5 }}>{t.bam.quarter}</label>
                <select
                  value={quarter}
                  onChange={e => { setQuarter(Number(e.target.value)); setGenerate(false); }}
                  style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border2}`,
                    background: "var(--wr-bg)", color: C.text1, outline: "none", cursor: "pointer" }}
                >
                  <option value={1}>T1 — Jan–Mar</option>
                  <option value={2}>T2 — Avr–Jun</option>
                  <option value={3}>T3 — Jul–Sep</option>
                  <option value={4}>T4 — Oct–Déc</option>
                </select>
              </div>
            )}

            <button
              onClick={() => setGenerate(true)}
              style={{
                fontSize: 12, padding: "7px 20px", borderRadius: 8, cursor: "pointer",
                border: "1px solid rgba(20,184,166,0.4)", background: "rgba(20,184,166,0.1)",
                color: C.gold, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Calendar size={13} />
              {t.bam.generate}
            </button>
          </div>
        </div>

        {/* ── Résultats ────────────────────────────────────────────────────── */}
        {isLoading && (
          <div style={{ padding: "40px 0", textAlign: "center", color: C.text3, fontSize: 12 }}>
            {t.bam.generating}
          </div>
        )}

        {report && !isLoading && (
          <>
            {/* En-tête rapport */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <p style={{ fontFamily: C.mono, fontSize: 11, color: C.blue, margin: "0 0 3px" }}>{report.reportType}</p>
                <p style={{ fontSize: 11, color: C.text3, margin: 0 }}>
                  {t.bam.generatedAt} {formatDateTime(report.generatedAt)} · {report.institution}
                </p>
              </div>
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `${report.reportType}_${year}.json`;
                  a.click();
                }}
                style={{ fontSize: 11, padding: "6px 14px", borderRadius: 7, cursor: "pointer",
                  border: `1px solid ${C.border2}`, background: "transparent", color: C.text3,
                  display: "flex", alignItems: "center", gap: 5 }}
              >
                <Download size={12} />
                JSON
              </button>
            </div>

            {/* Section 1 : Vue d'ensemble */}
            <SectionCard title={t.bam.art11Overview}>
              <KpiRow label={t.bam.totalTransactions}  value={formatNumber(report.overview.totalTransactions)} />
              <KpiRow label={t.bam.totalVolume}        value={formatNumber(report.overview.totalVolumeMad)}    sub="MAD" />
              <KpiRow label={t.bam.activeWallets}      value={formatNumber(report.overview.activeWallets)} />
              <KpiRow label={t.bam.activeAgents}       value={formatNumber(report.overview.activeAgents)} />
              <KpiRow label={t.bam.alertsGenerated}    value={formatNumber(report.overview.alertsGenerated)} />
            </SectionCard>

            {/* Section 2 : Par canal */}
            <SectionCard title={t.bam.art12Channel}>
              {report.byChannel.length === 0
                ? <p style={{ fontSize: 12, color: C.text3 }}>{t.bam.noTransactionsPeriod}</p>
                : report.byChannel.map(c => (
                    <KpiRow key={c.channel} label={c.channel}
                      value={`${formatNumber(c.count)} tx`}
                      sub={`${formatNumber(c.volume)} MAD`} />
                  ))
              }
            </SectionCard>

            {/* Section 3 : Par type */}
            <SectionCard title={t.bam.art13Type}>
              {report.byTransactionType.length === 0
                ? <p style={{ fontSize: 12, color: C.text3 }}>{t.bam.noTransactionsPeriod}</p>
                : report.byTransactionType.map(r => (
                    <KpiRow key={r.type} label={r.type}
                      value={`${formatNumber(r.count)} tx`}
                      sub={`${formatNumber(r.volume)} MAD`} />
                  ))
              }
            </SectionCard>

            {/* Section 4 : Flux P2P */}
            <SectionCard title={t.bam.p2pFlows}>
              <KpiRow label={t.bam.p2pTransfers} value={`${formatNumber(report.p2p.count)} tx`} sub={`${formatNumber(report.p2p.volume)} MAD`} />
            </SectionCard>

            {/* Section 5 : Opérations agents */}
            {report.agentOperations.length > 0 && (
              <SectionCard title={t.bam.agentOps}>
                {report.agentOperations.map(r => (
                  <KpiRow key={r.type} label={r.type} value={`${formatNumber(r.count)} tx`} sub={`${formatNumber(r.volume)} MAD`} />
                ))}
              </SectionCard>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
