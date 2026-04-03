import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatRelative, formatNumber } from "../lib/utils";
import { useI18n } from "../hooks/useI18n";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import {
  Activity, RefreshCw, TrendingUp, Users, AlertTriangle, Play,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type QueueRow = {
  snapshotId:   number;
  customerId:   number;
  driftScore:   number;
  driftFactors: {
    volumeDrift:       number;
    frequencyDrift:    number;
    geoDrift:          number;
    amountSpike:       number;
    newCounterparties: number;
    newCountries:      string[];
  } | null;
  snapshotDate:   Date;
  reviewTriggered: boolean;
  firstName:      string;
  lastName:       string;
  riskLevel:      string;
  kycStatus:      string;
  nextReviewDate: Date | null;
};

// ─── Composant score barre ────────────────────────────────────────────────────

function DriftBar({ score }: { score: number }) {
  const color = score >= 80 ? "var(--wr-red)"
    : score >= 60 ? "#f97316"
    : score >= 40 ? "var(--wr-amber)"
    : "var(--wr-green)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 64, height: 6, borderRadius: 3,
        background: "var(--wr-hover2)", overflow: "hidden",
      }}>
        <div style={{
          width: `${score}%`, height: "100%",
          background: color, borderRadius: 3,
          transition: "width 0.3s",
        }} />
      </div>
      <span style={{ fontFamily: "var(--wr-font-mono)", fontSize: 11, color }}>{score}</span>
    </div>
  );
}

// ─── Composant facteurs ───────────────────────────────────────────────────────

function FactorChips({ factors }: { factors: QueueRow["driftFactors"] }) {
  if (!factors) return <span style={{ color: "var(--wr-text-3)" }}>—</span>;
  const chips: string[] = [];
  if (factors.volumeDrift >= 40)       chips.push(`Vol +${Math.round(factors.volumeDrift)}%`);
  if (factors.frequencyDrift >= 40)    chips.push(`Freq +${Math.round(factors.frequencyDrift)}%`);
  if (factors.geoDrift >= 30)          chips.push(`Geo (${factors.newCountries.join(",")})`);
  if (factors.amountSpike >= 50)       chips.push("Pic montant");
  if (factors.newCounterparties >= 50) chips.push("Nv. contrep.");
  if (chips.length === 0) return <span style={{ color: "var(--wr-text-3)", fontSize: 11 }}>aucun signal fort</span>;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {chips.map(c => (
        <span key={c} style={{
          fontSize: 9, fontFamily: "var(--wr-font-mono)", padding: "1px 6px",
          borderRadius: 3, background: "rgba(248,197,92,0.1)",
          border: "1px solid rgba(248,197,92,0.2)", color: "var(--wr-amber)",
        }}>{c}</span>
      ))}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function PkycPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = hasRole(user, "admin");

  const [page, setPage] = useState(1);
  const [forceRunResult, setForceRunResult] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } =
    trpc.pkyc.dashboard.useQuery();

  const { data: queue, isLoading: queueLoading } = trpc.pkyc.queue.useQuery(
    { page, limit: 20 },
    { placeholderData: keepPreviousData },
  );

  const forceRunMutation = trpc.pkyc.forceRun.useMutation({
    onSuccess: (result) => {
      setForceRunResult(
        result
          ? `Run terminé — ${result.processed} clients, ${result.triggered} revues déclenchées (${result.durationMs}ms)`
          : "Run déjà en cours",
      );
      void refetchStats();
    },
  });

  const COLUMNS: Column<QueueRow>[] = [
    {
      key: "customer", header: "Client",
      render: (r) => (
        <Link href={`/customers/${r.customerId}`}>
          <span style={{
            fontFamily: "var(--wr-font-mono)", fontSize: 12,
            color: "var(--wr-link)", cursor: "pointer",
          }}>
            {r.firstName} {r.lastName}
          </span>
        </Link>
      ),
    },
    {
      key: "drift", header: t.pkyc.driftScore, width: "w-36",
      render: (r) => <DriftBar score={r.driftScore} />,
    },
    {
      key: "factors", header: t.pkyc.driftFactors,
      render: (r) => <FactorChips factors={r.driftFactors} />,
    },
    {
      key: "risk", header: "Risque", width: "w-24",
      render: (r) => <Badge label={r.riskLevel} />,
    },
    {
      key: "kyc", header: "KYC", width: "w-28",
      render: (r) => <Badge label={r.kycStatus} variant="status" />,
    },
    {
      key: "date", header: t.common.date, width: "w-28",
      render: (r) => (
        <span style={{ fontFamily: "var(--wr-font-mono)", fontSize: 10, color: "var(--wr-text-3)" }}>
          {formatRelative(r.snapshotDate)}
        </span>
      ),
    },
  ];

  return (
    <AppLayout>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--wr-text-1)", fontFamily: "var(--wr-font-mono)", marginBottom: 4 }}>
            {t.pkyc.title}
          </h1>
          <p style={{ fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)" }}>
            {t.pkyc.subtitle}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin && (
            <button
              onClick={() => forceRunMutation.mutate()}
              disabled={forceRunMutation.isPending}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 6,
                background: "rgba(88,166,255,0.08)",
                border: "1px solid rgba(88,166,255,0.2)",
                color: "var(--wr-link)", fontSize: 11,
                fontFamily: "var(--wr-font-mono)", cursor: "pointer",
                opacity: forceRunMutation.isPending ? 0.5 : 1,
              }}
            >
              <Play size={11} />
              {forceRunMutation.isPending ? "En cours…" : t.pkyc.forceRun}
            </button>
          )}
        </div>
      </div>

      {/* Résultat forceRun */}
      {forceRunResult && (
        <div style={{
          marginBottom: 16, padding: "8px 14px",
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: 6, fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-green)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{forceRunResult}</span>
          <button onClick={() => setForceRunResult(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 11 }}>✕</button>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          {
            icon: <Users size={14} />,
            label: t.pkyc.kpiMonitored,
            value: statsLoading ? "—" : formatNumber(stats?.monitored ?? 0),
            color: "var(--wr-gold)",
          },
          {
            icon: <Activity size={14} />,
            label: t.pkyc.kpiAvgDrift,
            value: statsLoading ? "—" : `${stats?.avgDrift ?? 0}/100`,
            color: "var(--wr-link)",
          },
          {
            icon: <AlertTriangle size={14} />,
            label: t.pkyc.kpiHighDrift,
            value: statsLoading ? "—" : formatNumber(stats?.highDrift ?? 0),
            color: "var(--wr-amber)",
          },
          {
            icon: <TrendingUp size={14} />,
            label: t.pkyc.kpiTriggered30d,
            value: statsLoading ? "—" : formatNumber(stats?.triggered30d ?? 0),
            color: "var(--wr-red)",
          },
          {
            icon: <TrendingUp size={14} />,
            label: t.pkyc.kpiTriggered7d,
            value: statsLoading ? "—" : formatNumber(stats?.triggered7d ?? 0),
            color: "#f97316",
          },
        ].map((card) => (
          <div key={card.label} style={{
            background: "var(--wr-card)", border: "1px solid var(--wr-border)",
            borderRadius: 8, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ color: card.color }}>{card.icon}</span>
              <span style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {card.label}
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--wr-font-mono)", color: card.color }}>
              {card.value}
            </div>
            {card.label === t.pkyc.kpiHighDrift && stats && (
              <div style={{ fontSize: 9, color: "var(--wr-text-3)", fontFamily: "var(--wr-font-mono)", marginTop: 4 }}>
                seuil ≥ {stats.threshold}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* File de revue */}
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 12, fontWeight: 600, color: "var(--wr-text-2)", fontFamily: "var(--wr-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {t.pkyc.reviewQueue} {queue ? `(${formatNumber(queue.total)})` : ""}
        </h2>
        <button
          onClick={() => void refetchStats()}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--wr-text-3)", cursor: "pointer", fontSize: 11, fontFamily: "var(--wr-font-mono)" }}
        >
          <RefreshCw size={10} /> {t.common.refresh}
        </button>
      </div>

      <div style={{ background: "var(--wr-surface)", border: "1px solid var(--wr-border)", borderRadius: 8, overflow: "hidden" }}>
        <DataTable
          columns={COLUMNS}
          data={(queue?.data ?? []) as QueueRow[]}
          keyFn={(r) => r.snapshotId}
          isLoading={queueLoading}
          total={queue?.total}
          page={page}
          limit={20}
          onPageChange={setPage}
          emptyMessage={t.pkyc.noReviews}
        />
      </div>

      {/* Légende */}
      <div style={{ marginTop: 16, padding: "10px 14px", background: "var(--wr-card)", border: "1px solid var(--wr-border)", borderRadius: 6 }}>
        <p style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)", margin: 0 }}>
          {t.pkyc.legend}
        </p>
      </div>
    </AppLayout>
  );
}
