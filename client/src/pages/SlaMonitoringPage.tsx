import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { formatNumber } from "../lib/utils";
import {
  Activity, AlertTriangle, CheckCircle2,
  RefreshCw, Shield, BarChart2,
} from "lucide-react";

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

function KpiCard({
  label, value, sub, color = C.text1, icon: Icon,
}: {
  label: string; value: string | number; sub?: string;
  color?: string; icon?: React.ComponentType<{ size?: number }>;
}) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      {Icon && (
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: `${color}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={18} />
        </div>
      )}
      <div>
        <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: C.text3 }}>{sub}</div>}
      </div>
    </div>
  );
}

function SlaBar({ label, breached, total, slaHrs }: { label: string; breached: number; total: number; slaHrs: number }) {
  const rate = total > 0 ? (breached / total) * 100 : 0;
  const color = rate > 20 ? C.red : rate > 10 ? C.amber : C.green;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.text2, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: C.mono, fontSize: 11, color }}>
          {breached}/{total} hors SLA — SLA: {slaHrs}h
        </span>
      </div>
      <div style={{ background: C.border2, borderRadius: 4, height: 6 }}>
        <div style={{
          width: `${Math.min(rate, 100)}%`, height: 6,
          background: color, borderRadius: 4,
          transition: "width 0.3s",
        }} />
      </div>
    </div>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px",
      borderRadius: 4, letterSpacing: "0.05em",
      background: ok ? `${C.green}20` : `${C.red}20`,
      color: ok ? C.green : C.red,
    }}>
      {ok ? "OK" : "BREACH"}
    </span>
  );
}

export function SlaMonitoringPage() {
  const [forceRefresh, setForceRefresh] = useState(false);

  const { data: snapshot, isLoading, refetch } = trpc.sla.snapshot.useQuery(
    { forceRefresh },
    { refetchInterval: 5 * 60_000 }  // auto-refresh toutes les 5 min
  );
  const { data: thresholds } = trpc.sla.thresholds.useQuery();

  const escalate = trpc.sla.escalate.useMutation({
    onSuccess: () => { void refetch(); },
  });

  const handleRefresh = () => {
    setForceRefresh(true);
    void refetch().finally(() => setForceRefresh(false));
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: C.text2 }}>
          Calcul des métriques SLA en cours…
        </div>
      </AppLayout>
    );
  }

  const kpi     = snapshot?.kpi;
  const alerts  = snapshot?.alerts;
  const cases   = snapshot?.cases;

  return (
    <AppLayout>
      <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text1, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Activity size={20} /> SLA — Transaction Monitoring
            </h1>
            <p style={{ fontSize: 12, color: C.text2, margin: "4px 0 0" }}>
              Indicateurs de performance réglementaires — BAM / GAFI
              {snapshot?.capturedAt && (
                <span style={{ marginLeft: 8, fontFamily: C.mono, color: C.text3 }}>
                  Mis à jour : {new Date(snapshot.capturedAt).toLocaleTimeString("fr-FR")}
                </span>
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleRefresh}
              style={{
                padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: "transparent", border: `1px solid ${C.border}`,
                color: C.text2, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <RefreshCw size={13} /> Actualiser
            </button>
            <button
              onClick={() => escalate.mutate()}
              disabled={escalate.isPending}
              style={{
                padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: C.amber, border: "none", color: "#fff",
                cursor: escalate.isPending ? "not-allowed" : "pointer",
                opacity: escalate.isPending ? 0.7 : 1,
              }}
            >
              <AlertTriangle size={13} style={{ display: "inline", marginRight: 5 }} />
              Auto-escalation
            </button>
          </div>
        </div>

        {/* KPI Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <KpiCard
            label="Alertes ouvertes"
            value={formatNumber(kpi?.pendingAlerts ?? 0)}
            color={kpi?.pendingAlerts && kpi.pendingAlerts > 20 ? C.red : C.amber}
            icon={AlertTriangle}
          />
          <KpiCard
            label="Dossiers ouverts"
            value={formatNumber(kpi?.openCases ?? 0)}
            color={kpi?.openCases && kpi.openCases > 10 ? C.red : C.blue}
            icon={Shield}
          />
          <KpiCard
            label="Taux faux positifs"
            value={`${(kpi?.falsePosRate ?? 0).toFixed(1)}%`}
            sub={`Seuil : ${thresholds?.kpi.maxFalsePosRate ?? 30}%`}
            color={kpi?.falsePosRate && kpi.falsePosRate > (thresholds?.kpi.maxFalsePosRate ?? 30) ? C.red : C.green}
            icon={CheckCircle2}
          />
          <KpiCard
            label="Transactions monitées 24h"
            value={formatNumber(kpi?.txMonitoringVol ?? 0)}
            color={C.blue}
            icon={BarChart2}
          />
        </div>

        {/* SLA Alertes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, fontWeight: 600, color: C.text2, margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                SLA Alertes
              </h3>
              <StatusBadge ok={(kpi?.alertBreachRate ?? 0) < (thresholds?.kpi.maxAlertBreachRate ?? 20)} />
            </div>

            <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color: C.text1 }}>
                  {alerts?.total ?? 0}
                </div>
                <div style={{ fontSize: 10, color: C.text3 }}>Total</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color: C.amber }}>
                  {alerts?.open ?? 0}
                </div>
                <div style={{ fontSize: 10, color: C.text3 }}>Ouvertes</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color: C.red }}>
                  {alerts?.breachedSla ?? 0}
                </div>
                <div style={{ fontSize: 10, color: C.text3 }}>Hors SLA</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: C.text1 }}>
                  {(alerts?.avgResolutionHrs ?? 0).toFixed(1)}h
                </div>
                <div style={{ fontSize: 10, color: C.text3 }}>Moy. résolution</div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              {Object.entries(alerts?.byPriority ?? {}).map(([prio, data]) => (
                <SlaBar
                  key={prio}
                  label={prio}
                  breached={data.breached}
                  total={data.total}
                  slaHrs={thresholds?.alerts[prio as keyof typeof thresholds.alerts] ?? 24}
                />
              ))}
            </div>
          </div>

          {/* SLA Dossiers */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, fontWeight: 600, color: C.text2, margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                SLA Dossiers
              </h3>
              <StatusBadge ok={(kpi?.caseBreachRate ?? 0) < (thresholds?.kpi.maxCaseBreachRate ?? 10)} />
            </div>

            <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color: C.text1 }}>
                  {cases?.total ?? 0}
                </div>
                <div style={{ fontSize: 10, color: C.text3 }}>Total</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color: C.amber }}>
                  {cases?.open ?? 0}
                </div>
                <div style={{ fontSize: 10, color: C.text3 }}>Ouverts</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color: C.red }}>
                  {cases?.breachedSla ?? 0}
                </div>
                <div style={{ fontSize: 10, color: C.text3 }}>Hors SLA</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color: C.red }}>
                  {cases?.overdueCases ?? 0}
                </div>
                <div style={{ fontSize: 10, color: C.text3 }}>Échéance dépassée</div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, color: C.text2 }}>Taux de résolution</span>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text1, fontWeight: 600 }}>
                  {cases?.total ? Math.round((cases.closed / cases.total) * 100) : 0}%
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, color: C.text2 }}>Délai moyen résolution</span>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text1, fontWeight: 600 }}>
                  {(cases?.avgResolutionDays ?? 0).toFixed(1)} jours
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={{ fontSize: 11, color: C.text2 }}>Taux escalade</span>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.amber, fontWeight: 600 }}>
                  {(kpi?.escalationRate ?? 0).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SLA Compliance notice */}
        <div style={{
          background: `${C.blue}10`, border: `1px solid ${C.blue}30`,
          borderRadius: 8, padding: "12px 16px",
          fontSize: 11, color: C.text2, lineHeight: 1.6,
        }}>
          <strong style={{ color: C.blue }}>Référentiel SLA réglementaire BAM</strong> — Délais maximaux :
          alertes CRITICAL ≤ 2h, HIGH ≤ 4h, MEDIUM ≤ 24h, LOW ≤ 72h |
          Dossiers standard ≤ 30j, sévérité HIGH/CRITICAL ≤ 15j |
          Taux faux positifs recommandé GAFI/BAM : &lt; 30%.
          Dépassement → escalade automatique (toutes les 4h).
        </div>

      </div>
    </AppLayout>
  );
}
