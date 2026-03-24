import { AppLayout } from "../components/layout/AppLayout";
import { StatCard } from "../components/ui/StatCard";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatAmount, formatRelative, formatNumber } from "../lib/utils";
import {
  Users, AlertTriangle, FolderOpen,
  ArrowLeftRight, RefreshCw,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const CHART_COLORS = {
  alerts:       "#f85149",
  suspicious:   "#d29922",
  transactions: "#58a6ff",
};

function TrendChart({ days }: { days: number }) {
  const { data, isLoading } = trpc.dashboard.trends.useQuery({ days }, {
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="h-48 bg-[#161b22] rounded animate-pulse" />;
  if (!data) return null;

  const chartData = data.series.map((s: { date: string; transactions: number; suspicious: number }) => ({
    ...s,
    dateLabel: format(new Date(s.date), "dd/MM", { locale: fr }),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="gradAlerts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHART_COLORS.alerts} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART_COLORS.alerts} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradTx" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHART_COLORS.transactions} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART_COLORS.transactions} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="dateLabel" tick={{ fill: "#484f58", fontSize: 10, fontFamily: "IBM Plex Mono" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#484f58", fontSize: 10, fontFamily: "IBM Plex Mono" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 12, fontFamily: "IBM Plex Mono" }}
          labelStyle={{ color: "#7d8590" }}
          itemStyle={{ color: "#e6edf3" }}
        />
        <Area type="monotone" dataKey="transactions" stroke={CHART_COLORS.transactions} strokeWidth={1.5} fill="url(#gradTx)" name="Transactions" />
        <Area type="monotone" dataKey="alerts" stroke={CHART_COLORS.alerts} strokeWidth={1.5} fill="url(#gradAlerts)" name="Alertes" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function RiskBar({ data }: { data: Record<string, number> }) {
  const items = Object.entries(data).map(([key, value]) => ({ key, value }));
  const total = items.reduce((s, i) => s + i.value, 0);

  const COLOR: Record<string, string> = {
    LOW: "#3fb950", MEDIUM: "#d29922", HIGH: "#f85149", CRITICAL: "#ff7b72",
  };

  if (!total) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {items.map(({ key, value }) => (
          <div
            key={key}
            style={{ width: `${(value / total) * 100}%`, background: COLOR[key] ?? "#484f58" }}
            className="rounded-sm"
          />
        ))}
      </div>
      <div className="flex gap-4 flex-wrap">
        {items.map(({ key, value }) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: COLOR[key] ?? "#484f58" }} />
            <span className="text-[11px] font-mono text-[#7d8590]">
              <Badge label={key} variant="risk" /> <span className="text-[#e6edf3]">{value}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data: overview, isLoading, refetch, isRefetching } = trpc.dashboard.overview.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const { data: recent } = trpc.dashboard.recentActivity.useQuery({ limit: 8 }, {
    refetchInterval: 30_000,
  });

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">Dashboard</h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            Vue d'ensemble — données en temps réel
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-[#7d8590] hover:text-[#e6edf3] border border-[#30363d] hover:border-[#58a6ff]/40 rounded-md transition-colors"
        >
          <RefreshCw size={12} className={isRefetching ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      {/* KPIs principaux */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Clients actifs"
          value={isLoading ? "—" : formatNumber(overview?.customers.total ?? 0)}
          sub={`${overview?.customers.byStatus?.["APPROVED"] ?? 0} approuvés`}
          icon={Users}
        />
        <StatCard
          label="Alertes ouvertes"
          value={isLoading ? "—" : formatNumber(overview?.alerts.open ?? 0)}
          sub={`${overview?.alerts.byPriority?.["CRITICAL"] ?? 0} critiques`}
          icon={AlertTriangle}
          accent={(overview?.alerts.byPriority?.["CRITICAL"] ?? 0) > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Dossiers en cours"
          value={isLoading ? "—" : formatNumber(overview?.cases.byStatus?.["OPEN"] ?? 0)}
          sub={`${overview?.cases.byStatus?.["PENDING_APPROVAL"] ?? 0} en approbation`}
          icon={FolderOpen}
          accent={(overview?.cases.byStatus?.["PENDING_APPROVAL"] ?? 0) > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Transactions aujourd'hui"
          value={isLoading ? "—" : formatNumber(overview?.transactions.todayCount ?? 0)}
          sub={formatAmount(overview?.transactions.todayVolume ?? 0)}
          icon={ArrowLeftRight}
        />
      </div>

      {/* Graphique + risque */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">
              Activité — 30 derniers jours
            </h2>
            <div className="flex gap-3">
              {Object.entries(CHART_COLORS).map(([key, color]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] font-mono text-[#7d8590] capitalize">{key}</span>
                </div>
              ))}
            </div>
          </div>
          <TrendChart days={30} />
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-4">
          <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">
            Répartition du risque
          </h2>
          {overview?.customers.byRisk && (
            <RiskBar data={overview.customers.byRisk} />
          )}

          <div className="pt-2 border-t border-[#21262d] space-y-2">
            <p className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">Rapports</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#161b22] rounded p-2.5">
                <p className="text-[10px] font-mono text-[#7d8590]">SAR</p>
                <p className="text-lg font-mono font-semibold text-[#e6edf3]">
                  {overview?.reports.byType?.["SAR"] ?? 0}
                </p>
              </div>
              <div className="bg-[#161b22] rounded p-2.5">
                <p className="text-[10px] font-mono text-[#7d8590]">STR</p>
                <p className="text-lg font-mono font-semibold text-[#e6edf3]">
                  {overview?.reports.byType?.["STR"] ?? 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activité récente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alertes récentes */}
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
            <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">
              Alertes récentes
            </h2>
            <span className="text-[10px] font-mono text-[#484f58]">24h</span>
          </div>
          <div className="divide-y divide-[#21262d]/50">
            {!recent?.recentAlerts.length ? (
              <p className="px-4 py-6 text-xs font-mono text-[#484f58] text-center">Aucune alerte récente</p>
            ) : (
              recent.recentAlerts.map((a: {
                id: number; alertId: string; scenario: string;
                priority: string; riskScore: number; createdAt: Date;
              }) => (
                <div key={a.id} className="px-4 py-2.5 hover:bg-[#161b22] transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-[#e6edf3] truncate">{a.scenario}</p>
                      <p className="text-[10px] font-mono text-[#484f58] mt-0.5">{formatRelative(a.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge label={a.priority} variant="priority" />
                      <span className="text-[10px] font-mono text-[#7d8590]">{a.riskScore}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Transactions suspectes */}
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
            <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">
              Transactions suspectes
            </h2>
            <span className="text-[10px] font-mono text-[#484f58]">24h</span>
          </div>
          <div className="divide-y divide-[#21262d]/50">
            {!recent?.recentTransactions.length ? (
              <p className="px-4 py-6 text-xs font-mono text-[#484f58] text-center">Aucune transaction suspecte</p>
            ) : (
              recent.recentTransactions.map((t: {
                id: number; transactionId: string; amount: string;
                currency: string; transactionType: string;
                riskScore: number | null; createdAt: Date;
              }) => (
                <div key={t.id} className="px-4 py-2.5 hover:bg-[#161b22] transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-[#e6edf3]">{t.transactionId}</p>
                      <p className="text-[10px] font-mono text-[#484f58] mt-0.5">{formatRelative(t.createdAt)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-mono font-medium text-amber-400">
                        {formatAmount(t.amount, t.currency)}
                      </p>
                      <Badge label={t.transactionType} className="mt-0.5" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
