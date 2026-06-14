/**
 * Agents Page — Phase E
 *
 * Réseau agents cash-in / cash-out :
 *   - KPI cards (StatCard)
 *   - Filtres avancés (recherche, région, statut, risque)
 *   - DataTable avec ScoreBadge
 *   - Panel slide-out détail (infos, float, risque auto, activité)
 *   - Boutons recalcul risque (unitaire + batch)
 *   - FeedbackBanner pour actions
 */

import { useState, useCallback } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { AppLayout } from "../components/layout/AppLayout";
import { LoadingState } from "../components/ui/LoadingState";
import { DataTable, type Column } from "../components/ui/DataTable";
import { ScoreBadge } from "../components/ui/ScoreBadge";
import { StatCard } from "../components/ui/StatCard";
import { trpc } from "../lib/trpc";
import { formatRelative, formatNumber, formatDate } from "../lib/utils";
import {
  Users2, Plus, Eye, X, RefreshCw, Search, Filter,
  ShieldAlert, Activity, Wallet, Calculator,
} from "lucide-react";
import { useInstitution } from "../context/InstitutionContext";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { useI18n } from "../hooks/useI18n";

// ─── Constants ──────────────────────────────────────────────────────────────

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

const AG_INPUT: React.CSSProperties = {
  width: "100%", background: "var(--wr-hover)", border: "1px solid var(--wr-border2)",
  borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: "var(--wr-font-mono)",
  color: "var(--wr-text-1)", outline: "none", boxSizing: "border-box",
};
const AG_LABEL: React.CSSProperties = {
  fontSize: 9, fontFamily: "var(--wr-font-mono)", letterSpacing: "0.15em",
  textTransform: "uppercase", color: "var(--wr-text-3)", marginBottom: 5, display: "block",
};

type Agent = {
  id: number; agentId: string; name: string;
  phone: string | null; region: string | null; city: string | null;
  floatBalance: string; currency: string;
  dailyTxCount: number; dailyTxVolume: string;
  riskScore: number; isActive: boolean;
  lastActivityAt: Date | null; createdAt: Date;
};

// ─── Risk Factor Bar ────────────────────────────────────────────────────────

function FactorBar({ label, points, max }: { label: string; points: number; max: number }) {
  const pct = Math.min(100, (points / max) * 100);
  const color = pct >= 80 ? C.red : pct >= 50 ? C.amber : C.green;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: C.text2 }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{points}/{max}</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

// ─── Feedback Banner ────────────────────────────────────────────────────────

function FeedbackBanner({ message, type, onClose }: {
  message: string; type: "success" | "error" | "info"; onClose: () => void;
}) {
  const { t } = useI18n();
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    success: { bg: "rgba(52,211,153,0.06)", border: "rgba(52,211,153,0.25)", color: C.green },
    error:   { bg: "rgba(248,113,113,0.06)", border: "rgba(248,113,113,0.25)", color: C.red },
    info:    { bg: "rgba(96,165,250,0.06)",  border: "rgba(96,165,250,0.25)",  color: C.blue },
  };
  const s = styles[type]!;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, fontSize: 12, fontFamily: C.mono, color: s.color, marginBottom: 16 }}>
      <span>{message}</span>
      <button onClick={onClose} aria-label={t.common.close} style={{ background: "none", border: "none", color: s.color, cursor: "pointer", opacity: 0.6 }}><X size={14} /></button>
    </div>
  );
}

// ─── Detail Panel (slide-out) ───────────────────────────────────────────────

function DetailPanel({ agentId, onClose, onFeedback }: {
  agentId: number;
  onClose: () => void;
  onFeedback: (msg: string, type: "success" | "error") => void;
}) {
  const { t } = useI18n();
  const ta = t.agents;
  const [tab, setTab] = useState<"info" | "float" | "risk" | "activity">("info");
  const [floatDelta, setFloatDelta] = useState("");
  const [newRiskScore, setNewRiskScore] = useState(0);

  const utils = trpc.useUtils();
  const { data: agent, isLoading } = trpc.agents.get.useQuery({ id: agentId });
  const { data: activityData } = trpc.agents.activity.useQuery(
    { agentId, days: 30 }, { enabled: tab === "activity" }
  );

  const invalidate = () => {
    utils.agents.get.invalidate({ id: agentId });
    utils.agents.list.invalidate();
    utils.agents.stats.invalidate();
  };

  const adjustFloatMut = trpc.agents.adjustFloat.useMutation({
    onSuccess: (r) => { invalidate(); setFloatDelta(""); onFeedback(`Float ajusté — nouveau solde : ${formatNumber(Number(r.floatBalance))}`, "success"); },
    onError: (e) => onFeedback(e.message, "error"),
  });
  const updateRiskMut = trpc.agents.updateRisk.useMutation({
    onSuccess: () => { invalidate(); onFeedback("Score risque mis à jour (manuel)", "success"); },
    onError: (e) => onFeedback(e.message, "error"),
  });
  const calcRiskMut = trpc.agents.calculateRisk.useMutation({
    onSuccess: (r) => { invalidate(); onFeedback(`Risque recalculé : ${r.score}/100 (${r.level})`, "success"); },
    onError: (e) => onFeedback(e.message, "error"),
  });
  const refreshCountersMut = trpc.agents.refreshCounters.useMutation({
    onSuccess: () => { invalidate(); onFeedback("Compteurs journaliers rafraîchis", "success"); },
    onError: (e) => onFeedback(e.message, "error"),
  });
  const toggleActiveMut = trpc.agents.setActive.useMutation({
    onSuccess: () => { invalidate(); onFeedback(agent?.isActive ? "Agent désactivé" : "Agent activé", "success"); },
    onError: (e) => onFeedback(e.message, "error"),
  });

  if (isLoading || !agent) {
    return (
      <>
        <div style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgba(0,0,0,0.3)" }} onClick={onClose} />
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 40, width: "100%", maxWidth: 500, background: "#0a0b0f", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ padding: 24, color: C.text3, fontSize: 13 }}>{t.common.loading}</div>
        </div>
      </>
    );
  }

  // Parse risk factors from riskFlags JSON
  const riskFlags = agent.riskFlags as { volumeAnomaly?: number; cashInOutRatio?: number; smurfing?: number; muleAlerts?: number; dormancy?: number } | null;

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgba(0,0,0,0.3)" }} onClick={onClose} />

      {/* Panel */}
      <div role="dialog" aria-modal="true" aria-label={agent.name} style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 40, width: "100%", maxWidth: 500, background: "#0a0b0f", borderLeft: "1px solid rgba(255,255,255,0.06)", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ position: "sticky", top: 0, background: "rgba(10,11,15,0.95)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", zIndex: 10 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.blue, margin: "0 0 2px" }}>{agent.agentId}</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.text1, margin: "0 0 6px" }}>{agent.name}</p>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {agent.isActive
                ? <span style={{ fontSize: 10, fontFamily: C.mono, color: C.green, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 5, padding: "2px 7px" }}>ACTIF</span>
                : <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "2px 7px" }}>INACTIF</span>
              }
              <span style={{ fontSize: 10, color: C.text3 }}>
                {[agent.city, agent.region].filter(Boolean).join(", ")}
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label={t.common.close} style={{ background: "none", border: "none", color: C.text3, cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid rgba(255,255,255,0.06)`, padding: "0 20px" }}>
          {(["info", "float", "risk", "activity"] as const).map(tb => (
            <button
              key={tb}
              onClick={() => { setTab(tb); if (tb === "risk") setNewRiskScore(agent.riskScore); }}
              style={{
                padding: "10px 14px", fontSize: 11, fontFamily: C.mono, background: "none", border: "none",
                borderBottom: tab === tb ? `2px solid ${C.blue}` : "2px solid transparent",
                color: tab === tb ? C.blue : C.text3, cursor: "pointer", marginBottom: -1,
              }}
            >
              {tb === "info" ? ta.info : tb === "float" ? "Float" : tb === "risk" ? ta.risk : ta.activity}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>

          {/* ── Tab: Info ─────────────────────────────────────────────────── */}
          {tab === "info" && (
            <div>
              {/* Score + quick info */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                <ScoreBadge score={agent.riskScore} size="lg" showLabel />
                <div>
                  <p style={{ fontSize: 13, fontFamily: C.mono, color: C.text1, margin: "0 0 4px" }}>
                    {formatNumber(Number(agent.floatBalance))} {agent.currency}
                  </p>
                  <p style={{ fontSize: 11, color: C.text3, margin: "0 0 2px" }}>
                    {agent.dailyTxCount} tx / {formatNumber(Number(agent.dailyTxVolume))} {agent.currency} (24h)
                  </p>
                  <p style={{ fontSize: 10, color: C.text3, margin: 0 }}>
                    {agent.lastActivityAt ? `${t.agents.lastActivityLabel} ${formatRelative(agent.lastActivityAt)}` : t.agents.noRecentActivity}
                  </p>
                </div>
              </div>

              {/* Detail grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Téléphone",  value: agent.phone ?? "—" },
                  { label: "Région",     value: agent.region ?? "—" },
                  { label: "Ville",      value: agent.city ?? "—" },
                  { label: "Devise",     value: agent.currency },
                  { label: "N° licence", value: (agent as Record<string, unknown>).licenseNumber as string ?? "—" },
                  { label: "Créé le",    value: formatDate(agent.createdAt) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "var(--wr-hover)", borderRadius: 6, padding: "8px 10px" }}>
                    <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text3, margin: "0 0 3px" }}>{label}</p>
                    <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text1, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => refreshCountersMut.mutate({ agentId })}
                  disabled={refreshCountersMut.isPending}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 8px", background: `rgba(96,165,250,0.06)`, border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, color: C.blue, fontSize: 10, fontFamily: C.mono, cursor: "pointer" }}
                >
                  <RefreshCw size={14} /> {ta.refreshCounters}
                </button>
                <button
                  onClick={() => calcRiskMut.mutate({ agentId })}
                  disabled={calcRiskMut.isPending}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 8px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, color: C.amber, fontSize: 10, fontFamily: C.mono, cursor: "pointer" }}
                >
                  <Calculator size={14} /> {ta.recalculate}
                </button>
                <button
                  onClick={() => toggleActiveMut.mutate({ agentId, isActive: !agent.isActive })}
                  disabled={toggleActiveMut.isPending}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 8px", background: agent.isActive ? "rgba(248,113,113,0.06)" : "rgba(52,211,153,0.06)", border: agent.isActive ? "1px solid rgba(248,113,113,0.2)" : "1px solid rgba(52,211,153,0.2)", borderRadius: 10, color: agent.isActive ? C.red : C.green, fontSize: 10, fontFamily: C.mono, cursor: "pointer" }}
                >
                  <ShieldAlert size={14} /> {agent.isActive ? ta.deactivate : ta.activate}
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Float ────────────────────────────────────────────────── */}
          {tab === "float" && (
            <div>
              <div style={{ background: "var(--wr-hover)", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
                <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text3, margin: "0 0 4px" }}>Float actuel</p>
                <p style={{ fontSize: 24, fontWeight: 600, fontFamily: C.mono, color: C.blue, margin: 0 }}>
                  {formatNumber(Number(agent.floatBalance))} {agent.currency}
                </p>
              </div>
              <label style={AG_LABEL}>Ajustement (+ crédit / − débit)</label>
              <input
                type="number"
                value={floatDelta}
                onChange={e => setFloatDelta(e.target.value)}
                placeholder="ex: 5000 ou -2000"
                style={{ ...AG_INPUT, marginBottom: 10 }}
              />
              <button
                disabled={!floatDelta || adjustFloatMut.isPending}
                onClick={() => adjustFloatMut.mutate({ agentId, delta: Number(floatDelta) })}
                style={{ width: "100%", padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: (!floatDelta || adjustFloatMut.isPending) ? 0.4 : 1 }}
              >
                {adjustFloatMut.isPending ? t.common.loading : t.common.submit}
              </button>
            </div>
          )}

          {/* ── Tab: Risque ───────────────────────────────────────────────── */}
          {tab === "risk" && (
            <div>
              {/* Current score */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                <ScoreBadge score={agent.riskScore} size="lg" showLabel />
                <div>
                  <p style={{ fontSize: 18, fontWeight: 600, fontFamily: C.mono, color: agent.riskScore >= 70 ? C.red : agent.riskScore >= 40 ? C.amber : C.green, margin: "0 0 4px" }}>
                    {agent.riskScore} / 100
                  </p>
                  <p style={{ fontSize: 11, color: C.text3, margin: 0 }}>
                    {agent.riskScore >= 70 ? "Risque élevé" : agent.riskScore >= 40 ? "Risque moyen" : "Risque faible"}
                  </p>
                </div>
              </div>

              {/* Risk factors breakdown */}
              {riskFlags && (
                <div style={{ background: "var(--wr-hover)", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
                  <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text3, margin: "0 0 10px" }}>{ta.riskFactors}</p>
                  <FactorBar label="Anomalie volume (7j vs 30j)" points={riskFlags.volumeAnomaly ?? 0} max={25} />
                  <FactorBar label="Ratio cash-in / cash-out" points={riskFlags.cashInOutRatio ?? 0} max={20} />
                  <FactorBar label="Smurfing (tx < 5 000 MAD)" points={riskFlags.smurfing ?? 0} max={25} />
                  <FactorBar label="Alertes AGENT_MULE" points={riskFlags.muleAlerts ?? 0} max={15} />
                  <FactorBar label="Dormance / réactivation" points={riskFlags.dormancy ?? 0} max={15} />
                </div>
              )}

              {/* Auto-calculate button */}
              <button
                onClick={() => calcRiskMut.mutate({ agentId })}
                disabled={calcRiskMut.isPending}
                style={{ width: "100%", padding: "9px 0", fontSize: 12, fontFamily: C.mono, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 7, color: C.amber, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                <Calculator size={13} />
                {calcRiskMut.isPending ? t.common.loading : ta.recalculate}
              </button>

              {/* Manual override */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
                <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text3, margin: "0 0 8px" }}>{ta.manualOverride}</p>
                <label style={AG_LABEL}>Nouveau score (0–100)</label>
                <input
                  type="range" min={0} max={100}
                  value={newRiskScore}
                  onChange={e => setNewRiskScore(Number(e.target.value))}
                  style={{ width: "100%", marginBottom: 4 }}
                />
                <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text2, textAlign: "center", margin: "0 0 10px" }}>{newRiskScore}</p>
                <button
                  disabled={updateRiskMut.isPending}
                  onClick={() => updateRiskMut.mutate({ agentId, riskScore: newRiskScore })}
                  style={{ width: "100%", padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, cursor: "pointer" }}
                >
                  {updateRiskMut.isPending ? t.common.loading : ta.manualOverride}
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Activité ─────────────────────────────────────────────── */}
          {tab === "activity" && (
            <div>
              {!activityData ? (
                <LoadingState message={t.common.loading} />
              ) : (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    {[
                      { label: `Transactions (${activityData.days}j)`, value: String(activityData.txCount), color: C.blue },
                      { label: `Volume (${activityData.days}j)`,       value: `${formatNumber(activityData.volume)} ${agent.currency}`, color: C.green },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: "var(--wr-hover)", borderRadius: 8, padding: "12px 14px" }}>
                        <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text3, margin: "0 0 4px" }}>{label}</p>
                        <p style={{ fontSize: 18, fontWeight: 600, fontFamily: C.mono, color, margin: 0 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => refreshCountersMut.mutate({ agentId })}
                    disabled={refreshCountersMut.isPending}
                    style={{ width: "100%", padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <RefreshCw size={13} />
                    {refreshCountersMut.isPending ? t.common.loading : ta.refreshCounters}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function AgentsPage() {
  const { t } = useI18n();
  const ta = t.agents;
  const flags = useInstitution();
  const { user } = useAuth();
  const isSupervisor = hasRole(user, "supervisor");
  const [page, setPage] = useState(1);
  const [regionFilter, setRegionFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [riskMin, setRiskMin] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", phone: "", region: "", city: "", licenseNumber: "", currency: "MAD" });

  // Detail panel
  const [detailId, setDetailId] = useState<number | null>(null);

  // Feedback
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const utils = trpc.useUtils();

  const { data: stats } = trpc.agents.stats.useQuery(undefined, { enabled: flags.agentAccounts });

  const { data, isLoading } = trpc.agents.list.useQuery({
    page, limit: 20,
    ...(regionFilter ? { region: regionFilter } : {}),
    ...(activeOnly   ? { isActive: true } : {}),
    ...(riskMin > 0  ? { riskMin } : {}),
    ...(search       ? { search } : {}),
  }, { placeholderData: keepPreviousData, enabled: flags.agentAccounts });

  const createMutation = trpc.agents.create.useMutation({
    onSuccess: () => {
      utils.agents.list.invalidate(); utils.agents.stats.invalidate();
      setShowCreate(false);
      setCreateForm({ name: "", phone: "", region: "", city: "", licenseNumber: "", currency: "MAD" });
      setFeedback({ message: "Agent créé avec succès", type: "success" });
    },
    onError: (e) => setFeedback({ message: e.message, type: "error" }),
  });

  const recalcAllMut = trpc.agents.recalculateAllRisks.useMutation({
    onSuccess: (r) => {
      utils.agents.list.invalidate(); utils.agents.stats.invalidate();
      setFeedback({ message: `Recalcul terminé — ${r.updated} agents mis à jour, ${r.errors} erreurs`, type: r.errors > 0 ? "error" : "success" });
    },
    onError: (e) => setFeedback({ message: e.message, type: "error" }),
  });

  const toggleActiveMut = trpc.agents.setActive.useMutation({
    onSuccess: () => { utils.agents.list.invalidate(); utils.agents.stats.invalidate(); },
  });

  const handleFeedback = useCallback((msg: string, type: "success" | "error") => {
    setFeedback({ message: msg, type });
  }, []);

  const hasFilters = regionFilter || !activeOnly || riskMin > 0 || search;
  const clearFilters = () => { setRegionFilter(""); setActiveOnly(true); setRiskMin(0); setSearch(""); setSearchInput(""); setPage(1); };

  const COLUMNS: Column<Agent>[] = [
    {
      key: "agentId", header: ta.agentId, width: "w-36",
      render: (r) => (
        <button onClick={() => setDetailId(r.id)} style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.blue, margin: "0 0 2px" }}>{r.agentId}</p>
          <p style={{ fontSize: 11, color: C.text2, margin: 0 }}>{r.name}</p>
        </button>
      ),
    },
    {
      key: "region", header: ta.region, width: "w-36",
      render: (r) => (
        <span style={{ fontSize: 12, color: C.text2 }}>
          {[r.city, r.region].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "floatBalance", header: "Float", width: "w-32",
      render: (r) => (
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text1 }}>
          {formatNumber(Number(r.floatBalance))} {r.currency}
        </span>
      ),
    },
    {
      key: "dailyTxCount", header: ta.activity, width: "w-32",
      render: (r) => (
        <div>
          <p style={{ fontFamily: C.mono, fontSize: 11, color: C.text1, margin: "0 0 1px" }}>
            {r.dailyTxCount} tx
          </p>
          <p style={{ fontFamily: C.mono, fontSize: 10, color: C.text3, margin: 0 }}>
            {formatNumber(Number(r.dailyTxVolume))} {r.currency}
          </p>
        </div>
      ),
    },
    {
      key: "riskScore", header: ta.riskScore, width: "w-24",
      render: (r) => <ScoreBadge score={r.riskScore} />,
    },
    {
      key: "isActive", header: ta.status, width: "w-24",
      render: (r) => (
        r.isActive
          ? <span style={{ fontSize: 10, fontFamily: C.mono, color: C.green, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 5, padding: "2px 7px" }}>ACTIF</span>
          : <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "2px 7px" }}>INACTIF</span>
      ),
    },
    {
      key: "lastActivityAt", header: ta.lastActivity, width: "w-32",
      render: (r) => (
        <span style={{ fontSize: 11, color: C.text3 }}>
          {r.lastActivityAt ? formatRelative(r.lastActivityAt) : "—"}
        </span>
      ),
    },
    {
      key: "actions", header: "", width: "w-36",
      render: (r) => (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setDetailId(r.id)}
            style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 8px", borderRadius: 5, cursor: "pointer", border: `1px solid ${C.border2}`, background: "transparent", color: C.blue, display: "flex", alignItems: "center", gap: 3 }}
          >
            <Eye size={10} /> {ta.detail}
          </button>
          <button
            onClick={() => toggleActiveMut.mutate({ agentId: r.id, isActive: !r.isActive })}
            style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 8px", borderRadius: 5, cursor: "pointer", border: r.isActive ? "1px solid rgba(248,113,113,0.3)" : "1px solid rgba(52,211,153,0.3)", background: r.isActive ? "rgba(248,113,113,0.06)" : "rgba(52,211,153,0.06)", color: r.isActive ? C.red : C.green }}
          >
            {r.isActive ? ta.deactivate : ta.activate}
          </button>
        </div>
      ),
    },
  ];

  if (!flags.agentAccounts) {
    return (
      <AppLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
          <Users2 size={32} style={{ color: C.text3, opacity: 0.4 }} />
          <p style={{ color: C.text3, fontSize: 13 }}>Module agents non activé pour cette institution.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ padding: "24px 28px", maxWidth: 1200 }}>

        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: C.text1, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
              <Users2 size={18} style={{ color: C.gold }} />
              {ta.title}
            </h1>
            <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
              {ta.subtitle} — {flags.institutionName}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {isSupervisor && (
              <button
                onClick={() => recalcAllMut.mutate()}
                disabled={recalcAllMut.isPending}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.amber, cursor: "pointer" }}
                title="Recalculer le risque de tous les agents actifs"
              >
                <Calculator size={13} /> {recalcAllMut.isPending ? t.common.loading : ta.recalculateAll}
              </button>
            )}
            {isSupervisor && (
              <button
                onClick={() => setShowCreate(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer" }}
              >
                <Plus size={13} /> {t.common.add}
              </button>
            )}
          </div>
        </div>

        {/* ── Feedback ────────────────────────────────────────────────────── */}
        {feedback && <FeedbackBanner message={feedback.message} type={feedback.type} onClose={() => setFeedback(null)} />}

        {/* ── KPI ─────────────────────────────────────────────────────────── */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <StatCard label={ta.totalAgents} value={stats.total} icon={Users2} />
            <StatCard label={ta.activeAgents} value={stats.active} icon={Activity} accent="success" />
            <StatCard label={ta.highRisk} value={stats.highRisk} icon={ShieldAlert} accent="danger" />
            <StatCard label={ta.volume30d} value={`${formatNumber(stats.volume30d)} MAD`} icon={Wallet} accent="default" />
          </div>
        )}

        {/* ── Filtres ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.text3, opacity: 0.5 }} />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
              placeholder="ID agent, nom…"
              style={{ fontSize: 12, padding: "7px 10px 7px 28px", borderRadius: 7, border: `1px solid ${C.border2}`,
                background: C.surface, color: C.text2, outline: "none", width: "100%" }}
            />
          </div>
          <input
            value={regionFilter}
            onChange={e => { setRegionFilter(e.target.value); setPage(1); }}
            placeholder="Région"
            style={{ fontSize: 12, padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border2}`,
              background: C.surface, color: C.text2, outline: "none", width: 120 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text2, cursor: "pointer" }}>
            <input type="checkbox" checked={activeOnly} onChange={e => { setActiveOnly(e.target.checked); setPage(1); }} />
            Actifs
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text2, cursor: "pointer" }}>
            <input type="checkbox" checked={riskMin >= 70} onChange={e => { setRiskMin(e.target.checked ? 70 : 0); setPage(1); }} />
            Risque ≥70
          </label>
          {hasFilters && (
            <button
              onClick={clearFilters}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", fontSize: 11, fontFamily: C.mono, color: C.text3, background: "none", border: `1px solid ${C.border2}`, borderRadius: 7, cursor: "pointer" }}
            >
              <Filter size={11} /> {t.common.filter}
            </button>
          )}
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <DataTable<Agent>
          columns={COLUMNS}
          data={(data?.data ?? []) as Agent[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          page={page}
          total={data?.total ?? 0}
          limit={20}
          onPageChange={setPage}
        />
      </div>

      {/* ── Modal création agent ─────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div role="dialog" aria-modal="true" aria-label={t.common.add} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 480 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} style={{ color: C.blue }} /> {t.common.add}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={AG_LABEL}>Nom *</label>
                  <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom complet" style={AG_INPUT} />
                </div>
                <div>
                  <label style={AG_LABEL}>Téléphone</label>
                  <input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} placeholder="+212 6XX XXX XXX" style={AG_INPUT} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={AG_LABEL}>Région</label>
                  <input value={createForm.region} onChange={e => setCreateForm(f => ({ ...f, region: e.target.value }))} placeholder="Casablanca-Settat" style={AG_INPUT} />
                </div>
                <div>
                  <label style={AG_LABEL}>Ville</label>
                  <input value={createForm.city} onChange={e => setCreateForm(f => ({ ...f, city: e.target.value }))} placeholder="Casablanca" style={AG_INPUT} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={AG_LABEL}>N° licence</label>
                  <input value={createForm.licenseNumber} onChange={e => setCreateForm(f => ({ ...f, licenseNumber: e.target.value }))} placeholder="LIC-XXXXX" style={AG_INPUT} />
                </div>
                <div>
                  <label style={AG_LABEL}>Devise</label>
                  <select value={createForm.currency} onChange={e => setCreateForm(f => ({ ...f, currency: e.target.value }))} style={{ ...AG_INPUT, cursor: "pointer" }}>
                    <option value="MAD">MAD</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="XOF">XOF</option>
                  </select>
                </div>
              </div>
            </div>
            {createMutation.error && (
              <p style={{ marginTop: 10, fontSize: 11, fontFamily: C.mono, color: C.red }}>{createMutation.error.message}</p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}>
                {t.common.cancel}
              </button>
              <button
                disabled={!createForm.name || createMutation.isPending}
                onClick={() => createMutation.mutate({ name: createForm.name, ...(createForm.phone ? { phone: createForm.phone } : {}), ...(createForm.region ? { region: createForm.region } : {}), ...(createForm.city ? { city: createForm.city } : {}), ...(createForm.licenseNumber ? { licenseNumber: createForm.licenseNumber } : {}), currency: createForm.currency })}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: (!createForm.name || createMutation.isPending) ? 0.4 : 1 }}
              >
                {createMutation.isPending ? t.common.loading : t.common.add}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel détail agent (slide-out) ──────────────────────────────── */}
      {detailId !== null && (
        <DetailPanel
          agentId={detailId}
          onClose={() => setDetailId(null)}
          onFeedback={handleFeedback}
        />
      )}
    </AppLayout>
  );
}
