import { AppLayout }  from "../components/layout/AppLayout";
import { StatCard }   from "../components/ui/StatCard";
import { Badge }      from "../components/ui/Badge";
import { trpc }       from "../lib/trpc";
import { useI18n }    from "../hooks/useI18n";
import { formatAmount, formatRelative, formatNumber } from "../lib/utils";
import {
  Users, AlertTriangle, FolderOpen, ArrowLeftRight,
  RefreshCw, FileText, Shield,
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
  gold:     "var(--wr-gold)",
  red:      "var(--wr-red)",
  amber:    "var(--wr-amber)",
  green:    "var(--wr-green)",
  blue:     "var(--wr-blue)",
  mono:     "var(--wr-font-mono)",
  serif:    "var(--wr-font-serif)",
};

const RISK_COLORS: Record<string, string> = {
  LOW: "#34D399", MEDIUM: "#FB923C", HIGH: "#F87171", CRITICAL: "#FF5252",
};

// ─── Graphe tendances ─────────────────────────────────────────────────────────
function TrendChart({ days }: { days: number }) {
  const { data, isLoading } = trpc.dashboard.trends.useQuery({ days }, {
    refetchInterval: 60_000,
  });
  const { lang } = useI18n();

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
          fill="url(#gTx)" name="Transactions"
        />
        <Area
          type="monotone" dataKey="alerts"
          stroke={C.red} strokeWidth={1.5}
          fill="url(#gAl)" name="Alertes"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Barre de risque ──────────────────────────────────────────────────────────
function RiskBar({ data }: { data: Record<string, number> }) {
  const items = Object.entries(data).map(([key, value]) => ({ key, value }));
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return <p style={{ fontSize: 12, color: C.text3, fontFamily: C.mono }}>Aucune donnée</p>;

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

// ─── Page principale ──────────────────────────────────────────────────────────
export function DashboardPage() {
  const { data: overview, isLoading, refetch, isRefetching } =
    trpc.dashboard.overview.useQuery(undefined, {
      refetchInterval: 30_000,
      staleTime: 20_000,
    });

  const { data: recent } = trpc.dashboard.recentActivity.useQuery(
    { limit: 6 },
    { refetchInterval: 30_000 }
  );

  const { t } = useI18n();

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
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--wr-accent-border)"; (e.currentTarget as HTMLElement).style.color = "var(--wr-gold)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--wr-border2)"; (e.currentTarget as HTMLElement).style.color = "var(--wr-text-2)"; }}
          >
            <RefreshCw size={12} style={{ animation: isRefetching ? "spin 1s linear infinite" : "none" }} />
            {t.common.refresh}
          </button>
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
            sub={`${overview?.cases.byStatus?.["PENDING_APPROVAL"] ?? 0} en approbation`}
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
            <TrendChart days={30} />
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
            <span style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>24h</span>
          } noPad>
            <div>
              {!recent?.recentAlerts.length ? (
                <p style={{ padding: "20px 18px", fontSize: 12, fontFamily: C.mono, color: C.text3, textAlign: "center" }}>
                  {t.dashboard.noAlerts}
                </p>
              ) : recent.recentAlerts.map((a: {
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
                               : a.priority === "MEDIUM"   ? C.gold
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

      </div>
    </AppLayout>
  );
}
