import { useState, useMemo }   from "react";
import { AppLayout }  from "../components/layout/AppLayout";
import { StatCard }   from "../components/ui/StatCard";
import { Badge }      from "../components/ui/Badge";
import { trpc }       from "../lib/trpc";
import { useI18n }    from "../hooks/useI18n";
import { formatAmount, formatRelative, formatNumber } from "../lib/utils";
import {
  Users, AlertTriangle, FolderOpen, ArrowLeftRight,
  RefreshCw, FileText, Shield, TrendingUp, CheckCircle,
  Clock, Activity, Target, BarChart2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

// ─── Palette cohérente WatchReg ───────────────────────────────────────────────
const C = {
  surface:  "var(--wr-card)",
  border:   "var(--wr-border)",
  border2:  "var(--wr-border2)",
  text1:    "var(--wr-text-1)",
  text2:    "var(--wr-text-2)",
  text3:    "var(--wr-text-3)",
  gold:     "var(--wr-accent)",   // teal maintenant
  teal:     "var(--wr-accent)",
  red:      "var(--wr-red)",
  amber:    "var(--wr-amber)",
  green:    "var(--wr-green)",
  blue:     "var(--wr-blue)",
  mono:     "var(--wr-font-mono)",
  serif:    "var(--wr-font-sans)", // Plus Jakarta Sans
};

const RISK_COLORS: Record<string, string> = {
  LOW: "#34D399", MEDIUM: "#FB923C", HIGH: "#F87171", CRITICAL: "#FF5252",
};

// ─── Graphe tendances ─────────────────────────────────────────────────────────
function TrendChart({ days }: { days: number }) {
  const { data, isLoading } = trpc.dashboard.trends.useQuery({ days }, {
    refetchInterval: 60_000,
  });
  const { lang, t } = useI18n();

  if (isLoading) return (
    <div style={{ height: 200, background: "var(--wr-hover)", borderRadius: 8, animation: "pulse 2s infinite" }} />
  );
  if (!data) return null;

  const dateLocale = lang === "en" ? enUS : fr;
  const chartData = data.series.map((s: { date: string; transactions: number; suspicious: number }) => ({
    ...s,
    dateLabel: format(new Date(s.date), "dd/MM", { locale: dateLocale }),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="gTx" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C.blue}  stopOpacity={0.2} />
            <stop offset="95%" stopColor={C.blue}  stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gAl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C.red}   stopOpacity={0.2} />
            <stop offset="95%" stopColor={C.red}   stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--wr-border)" vertical={false} />
        <XAxis
          dataKey="dateLabel"
          tick={{ fill: C.text3, fontSize: 10, fontFamily: C.mono }}
          tickLine={false} axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: C.text3, fontSize: 10, fontFamily: C.mono }}
          tickLine={false} axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--wr-card)",
            border: `1px solid ${C.border2}`,
            borderRadius: 8,
            fontSize: 12,
            fontFamily: C.mono,
            color: C.text1,
          }}
          labelStyle={{ color: C.text2 }}
          itemStyle={{ color: C.text1 }}
        />
        <Area
          type="monotone" dataKey="transactions"
          stroke={C.blue} strokeWidth={1.5}
          fill="url(#gTx)" name={t.dashboard.chartTransactions}
        />
        <Area
          type="monotone" dataKey="alerts"
          stroke={C.red} strokeWidth={1.5}
          fill="url(#gAl)" name={t.dashboard.chartAlerts}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Barre de risque ──────────────────────────────────────────────────────────
function RiskBar({ data }: { data: Record<string, number> }) {
  const { t } = useI18n();
  const items = Object.entries(data).map(([key, value]) => ({ key, value }));
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return <p style={{ fontSize: 12, color: C.text3, fontFamily: C.mono }}>{t.common.noData}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Barre */}
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
        {items.map(({ key, value }) => (
          <div key={key} style={{
            width: `${(value / total) * 100}%`,
            background: RISK_COLORS[key] ?? C.text3,
            borderRadius: 2,
          }} />
        ))}
      </div>
      {/* Légende */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {items.map(({ key, value }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: RISK_COLORS[key] ?? C.text3 }} />
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
              {key}
            </span>
            <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text1, fontWeight: 600 }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Card conteneur ───────────────────────────────────────────────────────────
function Card({
  title, right, children, noPad = false,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 18px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <p style={{
          fontSize: 10, fontFamily: C.mono,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: C.text2, margin: 0, fontWeight: 600,
        }}>
          {title}
        </p>
        {right}
      </div>
      <div style={noPad ? {} : { padding: "14px 18px" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Panneau Direction — 8 KPIs cartographie conformité ──────────────────────
function DirectionPanel({ selectedYear, onYearChange }: {
  selectedYear: number;
  onYearChange: (y: number) => void;
}) {
  const { t } = useI18n();
  const yearStart = useMemo(() => new Date(selectedYear, 0, 1).toISOString(), [selectedYear]);
  const yearEnd   = useMemo(() => new Date(selectedYear, 11, 31, 23, 59, 59).toISOString(), [selectedYear]);

  const { data: kpis, isLoading, error } = trpc.reports.amld6Stats.useQuery(
    { from: yearStart, to: yearEnd },
    { retry: false, staleTime: 60_000 }
  );

  const { data: overview } = trpc.dashboard.overview.useQuery(undefined, { staleTime: 30_000 });

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
      <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3 }}>{t.dashboard.dirLoading}</p>
    </div>
  );

  if (error) return (
    <div style={{ background: `${C.amber}08`, border: `1px solid ${C.amber}25`, borderRadius: 10, padding: 24, textAlign: "center" }}>
      <Shield size={24} style={{ color: C.amber, marginBottom: 8 }} />
      <p style={{ fontSize: 13, fontFamily: C.mono, color: C.amber, margin: "0 0 4px" }}>{t.dashboard.dirRestricted}</p>
      <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
        {t.dashboard.dirRestrictedDesc}
      </p>
    </div>
  );

  if (!kpis) return null;

  const kycCoverage  = kpis.customers.kycCoverage;
  const alertsPer1k  = kpis.transactions.total > 0
    ? (kpis.alerts.total / kpis.transactions.total) * 1000 : 0;
  const truePosRate  = 100 - kpis.alerts.falsePositiveRate;
  const avgDays      = kpis.declarations.avgDaysToSubmit;
  const strCount     = kpis.declarations.strCount;
  const sarCount     = kpis.declarations.sarCount;
  const slaBreaches  = kpis.compliance?.alertSlaBreaches ?? 0;
  const highRisk     = (kpis.customers.byRiskLevel?.high ?? 0) + (kpis.customers.byRiskLevel?.critical ?? 0);

  const kpiCards = [
    {
      icon: CheckCircle,
      label: t.dashboard.kpiKycCoverage,
      value: `${kycCoverage.toFixed(1)} %`,
      sub: t.dashboard.kpiKycCoverageSub.replace("{approved}", String(kpis.customers.kycApproved)).replace("{total}", String(kpis.customers.total)),
      color: kycCoverage >= 90 ? C.green : kycCoverage >= 70 ? C.amber : C.red,
      target: t.dashboard.kpiKycTarget,
    },
    {
      icon: Activity,
      label: t.dashboard.kpiAlertsPer1k,
      value: alertsPer1k.toFixed(1),
      sub: t.dashboard.kpiAlertsPer1kSub.replace("{alerts}", String(kpis.alerts.total)).replace("{tx}", String(kpis.transactions.total)),
      color: alertsPer1k > 20 ? C.red : alertsPer1k > 10 ? C.amber : C.green,
      target: t.dashboard.kpiAlertsPer1kTarget,
    },
    {
      icon: Target,
      label: t.dashboard.kpiEfficiency,
      value: `${truePosRate.toFixed(1)} %`,
      sub: t.dashboard.kpiEfficiencySub.replace("{fp}", kpis.alerts.falsePositiveRate.toFixed(1)),
      color: truePosRate >= 70 ? C.green : truePosRate >= 50 ? C.amber : C.red,
      target: t.dashboard.kpiEfficiencyTarget,
    },
    {
      icon: FileText,
      label: t.dashboard.kpiStrYtd,
      value: strCount,
      sub: t.dashboard.kpiStrYtdSub.replace("{sar}", String(sarCount)).replace("{submitted}", String(kpis.declarations.submitted)),
      color: C.blue,
      target: t.dashboard.kpiStrYtdTarget,
    },
    {
      icon: Clock,
      label: t.dashboard.kpiAvgStr,
      value: `${avgDays.toFixed(1)} ${t.dashboard.daysUnit}`,
      sub: t.dashboard.kpiAvgStrSub,
      color: avgDays <= 5 ? C.green : avgDays <= 10 ? C.amber : C.red,
      target: t.dashboard.kpiAvgStrTarget,
    },
    {
      icon: AlertTriangle,
      label: t.dashboard.kpiCritical,
      value: overview?.alerts.byPriority?.["CRITICAL"] ?? 0,
      sub: t.dashboard.kpiCriticalSub.replace("{open}", String(overview?.alerts.open ?? 0)),
      color: (overview?.alerts.byPriority?.["CRITICAL"] ?? 0) > 0 ? C.red : C.green,
      target: t.dashboard.kpiCriticalTarget,
    },
    {
      icon: BarChart2,
      label: t.dashboard.kpiSla,
      value: slaBreaches,
      sub: t.dashboard.kpiSlaSub,
      color: slaBreaches > 0 ? C.red : C.green,
      target: t.dashboard.kpiSlaTarget,
    },
    {
      icon: TrendingUp,
      label: t.dashboard.kpiHighRisk,
      value: highRisk,
      sub: t.dashboard.kpiHighRiskSub.replace("{total}", String(kpis.customers.total)).replace("{pep}", String(kpis.customers.pepActive)),
      color: highRisk > 20 ? C.red : highRisk > 10 ? C.amber : C.text1,
      target: t.dashboard.kpiHighRiskTarget,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header + filtre année */}
      <div style={{ background: `${C.teal}08`, border: `1px solid ${C.teal}25`, borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.teal, margin: "0 0 2px", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {t.dashboard.dirTitle}
          </p>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {t.dashboard.dirPeriod.replace(/\{year\}/g, String(selectedYear))}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Sélecteur année */}
          <div style={{ display: "flex", gap: 4 }}>
            {[new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear()].map(y => (
              <button key={y} onClick={() => onYearChange(y)} style={{
                padding: "4px 10px", fontSize: 11, fontFamily: C.mono,
                background: selectedYear === y ? `${C.teal}20` : "none",
                border: `1px solid ${selectedYear === y ? C.teal : C.border2}`,
                borderRadius: 6, color: selectedYear === y ? C.teal : C.text3,
                cursor: "pointer",
              }}>{y}</button>
            ))}
          </div>
          <Shield size={20} style={{ color: C.teal, opacity: 0.6 }} />
        </div>
      </div>

      {/* 8 KPI cards — 4×2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {kpiCards.map(({ icon: Icon, label, value, sub, color, target }) => (
          <div key={label} style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon size={12} style={{ color }} />
              <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.14em", color: C.text3, margin: 0, fontWeight: 600 }}>
                {label}
              </p>
            </div>
            <p style={{ fontSize: 26, fontWeight: 700, fontFamily: C.mono, color, margin: 0, lineHeight: 1 }}>
              {typeof value === "number" ? formatNumber(value) : value}
            </p>
            <div>
              <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: "0 0 3px" }}>{sub}</p>
              <p style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, margin: 0, fontStyle: "italic" }}>{target}</p>
            </div>
            {/* Indicateur visuel */}
            <div style={{ height: 2, borderRadius: 1, background: `${color}30` }}>
              <div style={{ height: "100%", width: "100%", borderRadius: 1, background: color, opacity: 0.6 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Tableau sanctions + PEP */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card title={t.dashboard.screeningSanctions}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: t.dashboard.totalScreenings, value: kpis.screening.total, color: C.text1 },
              { label: t.dashboard.matchDetected,   value: kpis.screening.matchCount,  color: C.red },
              { label: t.dashboard.inReview,         value: kpis.screening.reviewCount, color: C.amber },
              { label: t.dashboard.clearLabel,       value: kpis.screening.clearCount,  color: C.green },
            ].map(({ label, value: v, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text3 }}>{label}</span>
                <span style={{ fontSize: 13, fontFamily: C.mono, fontWeight: 700, color }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t.dashboard.caseInvestigation}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: t.dashboard.casesOpened,    value: kpis.cases.opened,    color: C.amber },
              { label: t.dashboard.casesClosed,    value: kpis.cases.closed,    color: C.green },
              { label: t.dashboard.casesEscalated, value: kpis.cases.escalated, color: C.red },
              { label: t.dashboard.casesLinked,    value: sarCount + strCount,  color: C.blue },
            ].map(({ label, value: v, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text3 }}>{label}</span>
                <span style={{ fontSize: 13, fontFamily: C.mono, fontWeight: 700, color }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

    </div>
  );
}

// ─── Chip filtre réutilisable ─────────────────────────────────────────────────
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 10px", fontSize: 11, fontFamily: C.mono,
      background: active ? `${C.teal}18` : "transparent",
      border: `1px solid ${active ? C.teal : "rgba(100,140,160,0.20)"}`,
      borderRadius: 20,  /* pill — plus moderne */
      color: active ? C.teal : C.text3,
      cursor: "pointer", transition: "all 0.12s",
      fontWeight: active ? 600 : 400,
    }}>{label}</button>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export function DashboardPage() {
  const [dashTab,       setDashTab]       = useState<"ops" | "direction">("ops");
  const [trendDays,     setTrendDays]     = useState(30);
  const [activityHours, setActivityHours] = useState(24);
  const [alertPriority, setAlertPriority] = useState<"ALL" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [directionYear, setDirectionYear] = useState(new Date().getFullYear());

  const { data: overview, isLoading, refetch, isRefetching } =
    trpc.dashboard.overview.useQuery(undefined, {
      refetchInterval: 30_000,
      staleTime: 20_000,
    });

  const { data: recent } = trpc.dashboard.recentActivity.useQuery(
    { limit: 10, hours: activityHours },
    { refetchInterval: 30_000 }
  );

  const { data: riskDist } = trpc.dashboard.riskDistribution.useQuery();

  const { t } = useI18n();

  // Filtre client-side priorité alertes
  const filteredAlerts = useMemo(() => {
    if (!recent?.recentAlerts) return [];
    return alertPriority === "ALL"
      ? recent.recentAlerts
      : recent.recentAlerts.filter((a: { priority: string }) => a.priority === alertPriority);
  }, [recent?.recentAlerts, alertPriority]);

  return (
    <AppLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{
              fontSize: 22,
              fontWeight: 400,
              fontFamily: C.serif,
              color: C.text1,
              letterSpacing: "-0.4px",
              margin: "0 0 4px",
            }}>
              {t.dashboard.title}
            </h1>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
              {t.dashboard.subtitle}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px",
              background: "var(--wr-hover)",
              border: `1px solid ${C.border2}`,
              borderRadius: 8,
              fontSize: 11, fontFamily: C.mono,
              color: C.text2,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--wr-accent-border)"; (e.currentTarget as HTMLElement).style.color = "var(--wr-accent)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--wr-border2)"; (e.currentTarget as HTMLElement).style.color = "var(--wr-text-2)"; }}
          >
            <RefreshCw size={12} style={{ animation: isRefetching ? "spin 1s linear infinite" : "none" }} />
            {t.common.refresh}
          </button>
        </div>

        {/* ── Tabs Opérationnel / Direction ────────────────────────────── */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
          {([
            { id: "ops"       as const, label: t.dashboard.tabOps,       icon: Activity },
            { id: "direction" as const, label: t.dashboard.tabDirection, icon: Shield },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setDashTab(id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 14px", fontSize: 11, fontFamily: C.mono,
                color: dashTab === id ? C.teal : C.text3,
                background: "none", border: "none",
                borderBottom: `2px solid ${dashTab === id ? C.teal : "transparent"}`,
                cursor: "pointer", marginBottom: -1,
              }}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {/* ── Tab Direction ─────────────────────────────────────────────── */}
        {dashTab === "direction" && (
          <DirectionPanel selectedYear={directionYear} onYearChange={setDirectionYear} />
        )}

        {dashTab === "ops" && <>

        {/* ── Barre de filtres opérationnelle ─────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 10, flexWrap: "wrap" }}>

          {/* Période graphique */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.dashboard.filterTrends}</span>
            <div style={{ display: "flex", gap: 3 }}>
              {([7, 14, 30, 90] as const).map(d => (
                <FilterChip key={d} label={`${d}j`} active={trendDays === d} onClick={() => setTrendDays(d)} />
              ))}
            </div>
          </div>

          <div style={{ width: 1, height: 20, background: C.border }} />

          {/* Fenêtre activité récente */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.dashboard.filterActivity}</span>
            <div style={{ display: "flex", gap: 3 }}>
              {([{ h: 24, label: "24h" }, { h: 48, label: "48h" }, { h: 168, label: "7j" }]).map(({ h, label }) => (
                <FilterChip key={h} label={label} active={activityHours === h} onClick={() => setActivityHours(h)} />
              ))}
            </div>
          </div>

          <div style={{ width: 1, height: 20, background: C.border }} />

          {/* Priorité alertes */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.dashboard.filterPriority}</span>
            <div style={{ display: "flex", gap: 3 }}>
              {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map(p => (
                <FilterChip key={p} label={p === "ALL" ? t.dashboard.filterAll : p} active={alertPriority === p} onClick={() => setAlertPriority(p)} />
              ))}
            </div>
          </div>

        </div>

        {/* ── KPIs ────────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          <StatCard
            label={t.dashboard.totalCustomers}
            value={isLoading ? "—" : formatNumber(overview?.customers.total ?? 0)}
            sub={`${overview?.customers.byStatus?.["APPROVED"] ?? 0} ${t.kyc.approved.toLowerCase()}`}
            icon={Users}
            accent="default"
          />
          <StatCard
            label={t.dashboard.activeAlerts}
            value={isLoading ? "—" : formatNumber(overview?.alerts.open ?? 0)}
            sub={`${overview?.alerts.byPriority?.["CRITICAL"] ?? 0} ${t.alerts.critical.toLowerCase()}`}
            icon={AlertTriangle}
            accent={(overview?.alerts.byPriority?.["CRITICAL"] ?? 0) > 0 ? "danger" : "default"}
          />
          <StatCard
            label={t.dashboard.openCases}
            value={isLoading ? "—" : formatNumber(overview?.cases.byStatus?.["OPEN"] ?? 0)}
            sub={`${overview?.cases.byStatus?.["PENDING_APPROVAL"] ?? 0} ${t.dashboard.pendingApproval}`}
            icon={FolderOpen}
            accent={(overview?.cases.byStatus?.["PENDING_APPROVAL"] ?? 0) > 0 ? "warning" : "default"}
          />
          <StatCard
            label={t.dashboard.totalTransactions}
            value={isLoading ? "—" : formatNumber(overview?.transactions.todayCount ?? 0)}
            sub={formatAmount(overview?.transactions.todayVolume ?? 0)}
            icon={ArrowLeftRight}
            accent="default"
          />
        </div>

        {/* ── Graphe + Risque ──────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 12 }}>

          {/* Graphe tendances */}
          <Card
            title={t.dashboard.trendsTitle}
            right={
              <div style={{ display: "flex", gap: 14 }}>
                {[
                  { label: t.nav.transactions, color: C.blue },
                  { label: t.nav.alerts,        color: C.red  },
                ].map(({ label, color }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 2, background: color, borderRadius: 1 }} />
                    <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{label}</span>
                  </div>
                ))}
              </div>
            }
          >
            <TrendChart days={trendDays} />
          </Card>

          {/* Colonne droite */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Risque clients */}
            <Card title={t.dashboard.riskDistribution}>
              {overview?.customers.byRisk
                ? <RiskBar data={overview.customers.byRisk} />
                : <p style={{ fontSize: 11, color: C.text3, fontFamily: C.mono }}>{t.common.loading}</p>
              }
            </Card>

            {/* Rapports SAR/STR */}
            <Card title={t.reports.regulatoryExport}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "SAR", val: overview?.reports.byType?.["SAR"] ?? 0, icon: FileText, color: C.amber },
                  { label: "STR", val: overview?.reports.byType?.["STR"] ?? 0, icon: Shield,   color: C.red   },
                ].map(({ label, val, icon: Icon, color }) => (
                  <div key={label} style={{
                    background: "var(--wr-hover)",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "12px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <Icon size={12} style={{ color }} />
                      <span style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.14em", textTransform: "uppercase", color: C.text3 }}>{label}</span>
                    </div>
                    <p style={{ fontSize: 22, fontWeight: 600, fontFamily: C.serif, color, margin: 0, lineHeight: 1 }}>
                      {val}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

          </div>
        </div>

        {/* ── Activité récente ─────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Alertes récentes */}
          <Card title={t.dashboard.recentAlerts} right={
            <span style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {activityHours < 48 ? `${activityHours}h` : `${activityHours / 24}j`}
              {alertPriority !== "ALL" && ` · ${alertPriority}`}
            </span>
          } noPad>
            <div>
              {!filteredAlerts.length ? (
                <p style={{ padding: "20px 18px", fontSize: 12, fontFamily: C.mono, color: C.text3, textAlign: "center" }}>
                  {t.dashboard.noAlerts}
                </p>
              ) : filteredAlerts.map((a: {
                id: number; alertId: string; scenario: string;
                priority: string; riskScore: number; createdAt: Date;
              }) => (
                <div key={a.id} style={{
                  padding: "10px 18px",
                  borderBottom: `1px solid var(--wr-border)`,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  transition: "background 0.15s", cursor: "pointer",
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--wr-hover)")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  {/* Dot priorité */}
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: a.priority === "CRITICAL" ? C.red
                               : a.priority === "HIGH"     ? C.amber
                               : a.priority === "MEDIUM"   ? C.teal
                               : C.green,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: C.text1, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.scenario}
                    </p>
                    <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>
                      {formatRelative(a.createdAt)}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <Badge label={a.priority} variant="priority" />
                    <span style={{
                      fontSize: 11, fontFamily: C.mono,
                      color: a.riskScore >= 70 ? C.red : a.riskScore >= 40 ? C.amber : C.text2,
                      fontWeight: 600,
                    }}>
                      {a.riskScore}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Transactions suspectes */}
          <Card title={t.nav.transactions} right={
            <span style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>24h</span>
          } noPad>
            <div>
              {!recent?.recentTransactions.length ? (
                <p style={{ padding: "20px 18px", fontSize: 12, fontFamily: C.mono, color: C.text3, textAlign: "center" }}>
                  {t.common.noData}
                </p>
              ) : recent.recentTransactions.map((t: {
                id: number; transactionId: string; amount: string;
                currency: string; transactionType: string;
                riskScore: number | null; createdAt: Date;
              }) => (
                <div key={t.id} style={{
                  padding: "10px 18px",
                  borderBottom: `1px solid var(--wr-border)`,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  transition: "background 0.15s", cursor: "pointer",
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--wr-hover)")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text1, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.transactionId}
                    </p>
                    <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>
                      {formatRelative(t.createdAt)}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontSize: 12, fontFamily: C.mono, color: C.amber, fontWeight: 600, margin: "0 0 3px" }}>
                      {formatAmount(t.amount, t.currency)}
                    </p>
                    <Badge label={t.transactionType} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

        </div>

        {/* Top 10 clients à risque élevé */}
        {riskDist && riskDist.highRiskCustomers.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginTop: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, letterSpacing: "0.16em", textTransform: "uppercase", margin: 0, fontWeight: 600 }}>
                {t.dashboard.topRiskTitle}
              </h3>
            </div>
            <table style={{ width: "100%", fontSize: 11, fontFamily: C.mono, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {([t.dashboard.colClientId, t.dashboard.colName, t.dashboard.colRiskScore, t.dashboard.colLevel, t.dashboard.colKyc]).map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 16px", fontSize: 9, fontFamily: C.mono, color: C.text3, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {riskDist.highRiskCustomers.map((c) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: "8px 16px", color: C.blue }}>{c.customerId}</td>
                    <td style={{ padding: "8px 16px", color: C.text1 }}>{c.firstName} {c.lastName}</td>
                    <td style={{ padding: "8px 16px", color: C.red, fontWeight: 600 }}>{c.riskScore}</td>
                    <td style={{ padding: "8px 16px" }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${C.amber}14`, border: `1px solid ${C.amber}30`, color: C.amber }}>{c.riskLevel}</span>
                    </td>
                    <td style={{ padding: "8px 16px" }}>
                      <span style={{ fontSize: 10, color: C.text3 }}>{c.kycStatus}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        </>}

      </div>
    </AppLayout>
  );
}
