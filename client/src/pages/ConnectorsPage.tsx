/**
 * Connectors Dashboard — Phase G
 *
 * Supervision des connecteurs CBS :
 *   - Statut CBS (health check, latence)
 *   - Circuit breaker (état, compteurs, reset)
 *   - Queue CBS (pending, completed, failed)
 *   - Jobs en échec (dead letter) avec retry
 */

import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { StatCard } from "../components/ui/StatCard";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { hasRole } from "../lib/auth";
import { formatDateTime } from "../lib/utils";
import {
  Plug, Activity, ShieldCheck, ShieldOff, RefreshCw,
  AlertTriangle, CheckCircle, XCircle, Clock, Trash2, RotateCcw,
} from "lucide-react";
import { LoadingState } from "../components/ui/LoadingState";
import { EmptyState } from "../components/ui/EmptyState";

// ─── Design tokens ──────────────────────────────────────────────────────────

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
  hover:   "var(--wr-hover)",
};

const CB_STATE_ICONS: Record<string, typeof ShieldCheck> = {
  CLOSED:    ShieldCheck,
  OPEN:      ShieldOff,
  HALF_OPEN: Activity,
};


// ─── Main Page ──────────────────────────────────────────────────────────────

export function ConnectorsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const tc = t.connectors;
  const isAdmin = hasRole(user, "admin");
  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const utils = trpc.useUtils();
  const { data: dashboard, isLoading } = trpc.connectors.dashboard.useQuery(undefined, { refetchInterval: 10_000 });

  const retryJobMut = trpc.connectors.retryJob.useMutation({
    onSuccess: () => { utils.connectors.dashboard.invalidate(); setFeedback({ msg: tc.jobRetried, type: "success" }); },
    onError: (e) => setFeedback({ msg: e.message, type: "error" }),
  });
  const retryAllMut = trpc.connectors.retryAllFailed.useMutation({
    onSuccess: (r) => { utils.connectors.dashboard.invalidate(); setFeedback({ msg: tc.jobsRetried.replace("{count}", String(r.retriedCount)), type: "success" }); },
    onError: (e) => setFeedback({ msg: e.message, type: "error" }),
  });
  const clearMut = trpc.connectors.clearFailed.useMutation({
    onSuccess: (r) => { utils.connectors.dashboard.invalidate(); setFeedback({ msg: tc.jobsCleared.replace("{count}", String(r.clearedCount)), type: "success" }); },
    onError: (e) => setFeedback({ msg: e.message, type: "error" }),
  });
  const resetCbMut = trpc.connectors.resetCircuitBreaker.useMutation({
    onSuccess: () => { utils.connectors.dashboard.invalidate(); setFeedback({ msg: tc.cbReset, type: "success" }); },
    onError: (e) => setFeedback({ msg: e.message, type: "error" }),
  });

  if (isLoading || !dashboard) {
    return (
      <AppLayout>
        <div style={{ padding: "24px 28px" }}>
          <LoadingState message={t.common.loading} />
        </div>
      </AppLayout>
    );
  }

  const { cbs, circuitBreaker: cb, queue, failedJobs } = dashboard;

  const cbIcon = CB_STATE_ICONS[cb.state] ?? ShieldCheck;
  const cbLabel = cb.state === "CLOSED" ? tc.cbClosed : cb.state === "OPEN" ? tc.cbOpen : tc.cbHalfOpen;

  const cbsStatusLabel = cbs.status === "ok" ? tc.operational : cbs.status === "degraded" ? tc.degraded : cbs.status === "unavailable" ? tc.unavailable : tc.notConfigured;

  const jobTypeLabel = (type: string) => {
    const map: Record<string, string> = { PUSH_KYC_UPDATE: tc.pushKycUpdate, BLOCK_ACCOUNTS: tc.blockAccounts, UNBLOCK_ACCOUNTS: tc.unblockAccounts, PUSH_ALERT: tc.pushAlert };
    return map[type] ?? type;
  };

  return (
    <AppLayout>
      <div style={{ padding: "24px 28px", maxWidth: 1200 }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: C.text1, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
              <Plug size={18} style={{ color: C.gold }} />
              {tc.title}
            </h1>
            <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
              {tc.subtitle}
            </p>
          </div>
          <button
            onClick={() => utils.connectors.dashboard.invalidate()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer", background: C.hover, border: `1px solid ${C.border2}`, color: C.text2 }}
          >
            <RefreshCw size={12} /> {t.common.refresh}
          </button>
        </div>

        {/* Feedback */}
        {feedback && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderRadius: 10, background: feedback.type === "success" ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)", border: `1px solid ${feedback.type === "success" ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`, fontSize: 12, fontFamily: C.mono, color: feedback.type === "success" ? C.green : C.red, marginBottom: 16 }}>
            <span>{feedback.msg}</span>
            <button onClick={() => setFeedback(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.6 }}>✕</button>
          </div>
        )}

        {/* ── KPI Row ────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard
            label={tc.cbsStatus}
            value={cbsStatusLabel}
            icon={cbs.available ? CheckCircle : XCircle}
            accent={cbs.status === "ok" ? "success" : cbs.status === "degraded" ? "warning" : "danger"}
            {...(cbs.latencyMs !== null && { sub: `${cbs.latencyMs}ms` })}
          />
          <StatCard
            label={tc.circuitBreaker}
            value={cbLabel}
            icon={cbIcon}
            accent={cb.state === "CLOSED" ? "success" : cb.state === "OPEN" ? "danger" : "warning"}
            sub={tc.failuresTotal.replace("{count}", String(cb.totalFailures))}
          />
          <StatCard
            label={tc.queuePending}
            value={queue.pending}
            icon={Clock}
            accent={queue.pending > 10 ? "warning" : "default"}
          />
          <StatCard
            label={tc.queueCompleted}
            value={queue.completed}
            icon={CheckCircle}
            accent="success"
          />
        </div>

        {/* ── CBS Health Detail ───────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

          {/* CBS Status Card */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
              <Plug size={13} style={{ color: C.blue }} /> {tc.cbsHealth}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: tc.mode,    value: cbs.mode.toUpperCase() },
                { label: tc.status,  value: cbsStatusLabel },
                { label: tc.latency, value: cbs.latencyMs !== null ? `${cbs.latencyMs}ms` : "—" },
                { label: tc.error,   value: cbs.error ?? tc.noError },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: C.hover, borderRadius: 6, padding: "6px 8px" }}>
                  <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text4, margin: "0 0 2px" }}>{label}</p>
                  <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text1, margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Circuit Breaker Card */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ fontSize: 12, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <Activity size={13} style={{ color: C.amber }} /> {tc.circuitBreaker}
              </h3>
              {isAdmin && cb.state !== "CLOSED" && (
                <button
                  onClick={() => resetCbMut.mutate()}
                  disabled={resetCbMut.isPending}
                  style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}
                >
                  {tc.resetToClosed}
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: tc.state,             value: cbLabel },
                { label: tc.consecutiveErrors, value: String(cb.failures) },
                { label: tc.totalFailures,     value: String(cb.totalFailures) },
                { label: tc.totalSuccesses,    value: String(cb.totalSuccesses) },
                { label: tc.lastFailure,       value: cb.lastFailureAt ? formatDateTime(cb.lastFailureAt) : "—" },
                { label: tc.lastTransition,    value: formatDateTime(cb.lastTransitionAt) },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: C.hover, borderRadius: 6, padding: "6px 8px" }}>
                  <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text4, margin: "0 0 2px" }}>{label}</p>
                  <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text1, margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Failed Jobs ────────────────────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={13} style={{ color: C.red }} />
              {tc.failedJobs}
              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, fontWeight: 400 }}>({queue.failed})</span>
            </h3>
            {isAdmin && queue.failed > 0 && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => retryAllMut.mutate()}
                  disabled={retryAllMut.isPending}
                  style={{ fontSize: 10, fontFamily: C.mono, color: C.amber, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 5, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <RotateCcw size={10} /> {tc.retryAll}
                </button>
                <button
                  onClick={() => clearMut.mutate()}
                  disabled={clearMut.isPending}
                  style={{ fontSize: 10, fontFamily: C.mono, color: C.red, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 5, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <Trash2 size={10} /> {tc.purge}
                </button>
              </div>
            )}
          </div>

          {failedJobs.length === 0 ? (
            <EmptyState icon={CheckCircle} message={tc.noFailedJobs} compact />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {failedJobs.map(job => (
                <div key={job.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.hover, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontFamily: C.mono, color: C.blue }}>{job.id}</span>
                      <span style={{ fontSize: 10, fontFamily: C.mono, color: C.amber }}>{jobTypeLabel(job.type)}</span>
                      <span style={{ fontSize: 9, fontFamily: C.mono, color: C.text4 }}>
                        {job.attempts}/{job.maxRetries} {tc.attempts}
                      </span>
                    </div>
                    {job.lastError && (
                      <p style={{ fontSize: 10, fontFamily: C.mono, color: C.red, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {job.lastError}
                      </p>
                    )}
                    <p style={{ fontSize: 9, fontFamily: C.mono, color: C.text4, margin: "2px 0 0" }}>
                      {tc.created} : {formatDateTime(job.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => retryJobMut.mutate({ jobId: job.id })}
                    disabled={retryJobMut.isPending}
                    style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 5, padding: "4px 10px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <RotateCcw size={10} /> {tc.retry}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
