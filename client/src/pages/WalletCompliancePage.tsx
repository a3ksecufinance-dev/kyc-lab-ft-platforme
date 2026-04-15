/**
 * WalletCompliancePage — Traitement de la conformité wallets
 *
 * Onglets :
 *   1. Dashboard  — KPIs conformité + graphe de risque
 *   2. Risques    — Wallets à risque (client HIGH/CRITICAL, alertes, tx suspectes)
 *   3. Alertes    — Alertes AML ouvertes liées aux wallets
 *   4. Suspicieux — Transactions suspectes sur wallets
 *   5. Dossiers   — Investigations ouvertes + création
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { keepPreviousData } from "@tanstack/react-query";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { formatNumber, formatRelative, formatDate } from "../lib/utils";
import {
  ShieldAlert, AlertTriangle, TrendingUp, Wallet,
  Ban, FolderOpen, Eye, ChevronRight, X, CheckCircle,
  FileWarning, Activity,
} from "lucide-react";
import { useInstitution } from "../context/InstitutionContext";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";

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
  hover:   "var(--wr-hover)",
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  LOW:      { bg: "rgba(52,211,153,0.1)",  text: "#34D399", border: "rgba(52,211,153,0.25)"  },
  MEDIUM:   { bg: "rgba(251,191,36,0.1)",  text: "#FBB924", border: "rgba(251,191,36,0.25)"  },
  HIGH:     { bg: "rgba(251,146,60,0.1)",  text: "#FB923C", border: "rgba(251,146,60,0.25)"  },
  CRITICAL: { bg: "rgba(248,113,113,0.12)", text: "#F87171", border: "rgba(248,113,113,0.3)"  },
};

function SeverityBadge({ level }: { level: string }) {
  const c = SEVERITY_COLORS[level] ?? SEVERITY_COLORS["MEDIUM"]!;
  return (
    <span style={{ fontSize: 10, fontFamily: C.mono, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {level}
    </span>
  );
}

function RiskScore({ score }: { score: number }) {
  const color = score >= 70 ? C.red : score >= 40 ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 32, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: C.mono, color }}>{score}</span>
    </div>
  );
}

function KpiCard({ label, value, sub, icon, color, warn }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string; warn?: boolean;
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${warn ? color + "40" : C.border}`, borderRadius: 12, padding: "16px 18px", position: "relative" as const, overflow: "hidden" }}>
      {warn && <div style={{ position: "absolute" as const, top: 0, left: 0, right: 0, height: 2, background: color }} />}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 10, color: C.text3, margin: 0, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>{label}</p>
        <div style={{ color, opacity: 0.7 }}>{icon}</div>
      </div>
      <p style={{ fontSize: 26, fontWeight: 700, color, margin: "0 0 4px", fontFamily: C.mono }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: C.text3, margin: 0 }}>{sub}</p>}
    </div>
  );
}

type Tab = "dashboard" | "risks" | "alerts" | "suspicious" | "investigations";

const LABEL_S: React.CSSProperties = {
  fontSize: 9, fontFamily: "var(--wr-font-mono)", letterSpacing: "0.15em",
  textTransform: "uppercase", color: "var(--wr-text-3)", marginBottom: 5, display: "block",
};
const INPUT_S: React.CSSProperties = {
  width: "100%", background: "var(--wr-hover)", border: "1px solid var(--wr-border2)",
  borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: "var(--wr-font-mono)",
  color: "var(--wr-text-1)", outline: "none", boxSizing: "border-box",
};

export function WalletCompliancePage() {
  const flags = useInstitution();
  const { user } = useAuth();
  const isSupervisor = hasRole(user, "supervisor");
  const [, navigate] = useLocation();

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [riskPage, setRiskPage]   = useState(1);
  const [alertPage, setAlertPage] = useState(1);
  const [suspPage, setSuspPage]   = useState(1);
  const [invPage, setInvPage]     = useState(1);

  // Modal investigation
  const [showInvModal, setShowInvModal] = useState(false);
  const [invForm, setInvForm] = useState({
    walletId: "", customerId: "", reason: "", severity: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  });

  const utils = trpc.useUtils();

  // Queries
  const { data: kpi } = trpc.wallets.complianceDashboard.useQuery(undefined, {
    enabled: flags.wallets, refetchInterval: 60_000,
  });
  const { data: risksData, isLoading: risksLoading } = trpc.wallets.highRiskWallets.useQuery(
    { page: riskPage, limit: 15 }, { enabled: flags.wallets && activeTab === "risks", placeholderData: keepPreviousData }
  );
  const { data: alertsData, isLoading: alertsLoading } = trpc.wallets.walletAlerts.useQuery(
    { page: alertPage, limit: 15 }, { enabled: flags.wallets && activeTab === "alerts", placeholderData: keepPreviousData }
  );
  const { data: suspData, isLoading: suspLoading } = trpc.wallets.suspiciousTx.useQuery(
    { page: suspPage, limit: 15 }, { enabled: flags.wallets && activeTab === "suspicious", placeholderData: keepPreviousData }
  );
  const { data: invData, isLoading: invLoading } = trpc.wallets.walletInvestigations.useQuery(
    { page: invPage, limit: 15 }, { enabled: flags.wallets && activeTab === "investigations", placeholderData: keepPreviousData }
  );

  const createInvMutation = trpc.wallets.createInvestigation.useMutation({
    onSuccess: (newCase) => {
      utils.wallets.walletInvestigations.invalidate();
      setShowInvModal(false);
      setInvForm({ walletId: "", customerId: "", reason: "", severity: "MEDIUM" });
      setActiveTab("investigations");
      // Naviguer vers le dossier créé
      if ((newCase as { id?: number })?.id) navigate(`/cases/${(newCase as { id?: number }).id}`);
    },
  });

  if (!flags.wallets) {
    return (
      <AppLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
          <ShieldAlert size={32} style={{ color: C.text3, opacity: 0.4 }} />
          <p style={{ color: C.text3, fontSize: 13 }}>Module wallets non activé.</p>
        </div>
      </AppLayout>
    );
  }

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode; count?: number | undefined; warn?: boolean | undefined }> = [
    { id: "dashboard" },
    { id: "risks",          label: "Risques",      count: kpi?.openAlerts,        warn: (kpi?.openAlerts ?? 0) > 0 },
    { id: "alerts",         label: "Alertes AML",  count: kpi?.openAlerts,        warn: (kpi?.openAlerts ?? 0) > 0 },
    { id: "suspicious",     label: "Tx suspectes", count: kpi?.suspiciousTxCount, warn: (kpi?.suspiciousTxCount ?? 0) > 0 },
    { id: "investigations" },
  ].map(t => ({
    id:    t.id as Tab,
    label: (t as { id: Tab; label?: string }).label ?? (t.id === "dashboard" ? "Dashboard" : t.id === "investigations" ? "Dossiers" : t.id),
    icon:  t.id === "dashboard" ? <Activity size={13} /> : t.id === "risks" ? <AlertTriangle size={13} /> : t.id === "alerts" ? <ShieldAlert size={13} /> : t.id === "suspicious" ? <FileWarning size={13} /> : <FolderOpen size={13} />,
    ...(t.count !== undefined ? { count: t.count } : {}),
    ...(t.warn  !== undefined ? { warn:  t.warn  } : {}),
  }));

  return (
    <AppLayout>
      <div style={{ padding: "24px 28px", maxWidth: 1280 }}>

        {/* ── En-tête ──────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: C.text1, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldAlert size={18} style={{ color: C.red }} />
              Conformité Wallets
            </h1>
            <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
              Surveillance, indicateurs de risque et investigations — {flags.institutionName}
            </p>
          </div>
          {isSupervisor && (
            <button
              onClick={() => setShowInvModal(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.red, cursor: "pointer" }}
            >
              <FolderOpen size={13} /> Ouvrir une investigation
            </button>
          )}
        </div>

        {/* ── Onglets ───────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 3, marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: 11, fontFamily: C.mono, padding: "7px 14px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, borderRadius: "6px 6px 0 0",
                border: `1px solid ${activeTab === tab.id ? C.border : "transparent"}`,
                borderBottom: activeTab === tab.id ? `1px solid var(--wr-card)` : "none",
                background: activeTab === tab.id ? C.surface : "transparent",
                color: activeTab === tab.id ? C.text1 : C.text3,
                marginBottom: -1,
              }}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span style={{ fontSize: 9, fontFamily: C.mono, fontWeight: 700, padding: "1px 5px", borderRadius: 10, background: tab.warn ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.1)", color: tab.warn ? C.red : C.text2, border: `1px solid ${tab.warn ? "rgba(248,113,113,0.3)" : C.border2}` }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1 — DASHBOARD                                                   */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "dashboard" && (
          <div>
            {!kpi ? (
              <p style={{ color: C.text3, fontFamily: C.mono, fontSize: 12 }}>Chargement…</p>
            ) : (
              <>
                {/* KPIs ligne 1 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
                  <KpiCard label="Wallets actifs"      value={kpi.totalWallets}       icon={<Wallet size={16} />}        color={C.blue}  />
                  <KpiCard label="Alertes ouvertes"    value={kpi.openAlerts}         icon={<ShieldAlert size={16} />}   color={C.red}   warn={kpi.openAlerts > 0} sub="liées aux wallets" />
                  <KpiCard label="Tx suspectes (30j)"  value={kpi.suspiciousTxCount}  icon={<FileWarning size={16} />}   color={C.amber} warn={kpi.suspiciousTxCount > 0} />
                  <KpiCard label="Volume mensuel"      value={`${formatNumber(kpi.monthlyVolume)} MAD`} icon={<TrendingUp size={16} />} color={C.green} />
                </div>
                {/* KPIs ligne 2 — indicateurs de conformité */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
                  <KpiCard label="Allégé — solde élevé"   value={kpi.allegedHighBalance}   icon={<AlertTriangle size={16} />} color={C.amber} warn={kpi.allegedHighBalance > 0} sub="> 80% plafond BAM" />
                  <KpiCard label="Limite journalière"     value={kpi.exceedingDailyLimit}  icon={<Ban size={16} />}           color={C.red}   warn={kpi.exceedingDailyLimit > 0} sub="wallets au-delà du seuil" />
                  <KpiCard label="Wallets suspendus"      value={kpi.suspended}            icon={<Ban size={16} />}           color={C.text3} />
                  <KpiCard label="Wallets dormants"       value={kpi.dormant}              icon={<Activity size={16} />}     color={C.text3} />
                </div>

                {/* Grille d'analyse */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {/* Risques prioritaires */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                    <h3 style={{ fontSize: 12, fontFamily: C.mono, fontWeight: 600, color: C.text2, margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Points de vigilance
                    </h3>
                    {[
                      {
                        level: kpi.openAlerts > 5 ? "CRITICAL" : kpi.openAlerts > 0 ? "HIGH" : "LOW",
                        label: "Alertes AML actives",
                        value: `${kpi.openAlerts} alerte(s)`,
                        action: () => setActiveTab("alerts"),
                      },
                      {
                        level: kpi.suspiciousTxCount > 3 ? "HIGH" : kpi.suspiciousTxCount > 0 ? "MEDIUM" : "LOW",
                        label: "Transactions suspectes",
                        value: `${kpi.suspiciousTxCount} transaction(s)`,
                        action: () => setActiveTab("suspicious"),
                      },
                      {
                        level: kpi.allegedHighBalance > 0 ? "MEDIUM" : "LOW",
                        label: "Wallets ALLEGED > 80% plafond",
                        value: `${kpi.allegedHighBalance} wallet(s)`,
                        action: () => setActiveTab("risks"),
                      },
                      {
                        level: kpi.exceedingDailyLimit > 0 ? "HIGH" : "LOW",
                        label: "Dépassement limite journalière",
                        value: `${kpi.exceedingDailyLimit} wallet(s)`,
                        action: () => setActiveTab("risks"),
                      },
                    ].map((item, i) => {
                      const c = SEVERITY_COLORS[item.level] ?? SEVERITY_COLORS["LOW"]!;
                      return (
                        <div key={i} onClick={item.action}
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < 3 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.text, flexShrink: 0, boxShadow: item.level !== "LOW" ? `0 0 6px ${c.text}` : "none" }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: C.text1 }}>{item.label}</div>
                            <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, marginTop: 2 }}>{item.value}</div>
                          </div>
                          <SeverityBadge level={item.level} />
                          <ChevronRight size={12} style={{ color: C.text3 }} />
                        </div>
                      );
                    })}
                  </div>

                  {/* Guide de traitement conformité */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                    <h3 style={{ fontSize: 12, fontFamily: C.mono, fontWeight: 600, color: C.text2, margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Processus de traitement conformité
                    </h3>
                    {[
                      { step: "01", title: "Détection", desc: "Alerte AML automatique ou transaction suspecte détectée" },
                      { step: "02", title: "Analyse", desc: "Consultation profil wallet, historique, usage vs limites BAM" },
                      { step: "03", title: "Décision", desc: "Clôturer (faux positif), suspendre wallet, escalader" },
                      { step: "04", title: "Investigation", desc: "Ouvrir un dossier, lier les alertes, mener l'EDD" },
                      { step: "05", title: "Reporting", desc: "Créer un SAR et transmettre à l'ANRF si nécessaire" },
                    ].map((s, i) => (
                      <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 12, marginBottom: i < 4 ? 0 : 0 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${C.gold}14`, border: `1px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, fontFamily: C.mono, color: C.gold, fontWeight: 700 }}>{s.step}</div>
                        <div>
                          <div style={{ fontSize: 12, color: C.text1, fontWeight: 500 }}>{s.title}</div>
                          <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{s.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2 — WALLETS À RISQUE                                            */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "risks" && (
          <div>
            <p style={{ fontSize: 11, color: C.text3, fontFamily: C.mono, margin: "0 0 16px" }}>
              Wallets dont le client est classé MEDIUM / HIGH / CRITICAL ou présentant des anomalies.
            </p>
            {risksLoading ? (
              <p style={{ color: C.text3, fontFamily: C.mono, fontSize: 12 }}>Chargement…</p>
            ) : !risksData?.data.length ? (
              <p style={{ color: C.text3, fontFamily: C.mono, fontSize: 12 }}>Aucun wallet à risque détecté.</p>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  {risksData.data.map(w => (
                    <div key={w.id} style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px",
                      display: "flex", alignItems: "center", gap: 14,
                      borderLeft: `3px solid ${(w.customerRiskScore ?? 0) >= 70 ? C.red : (w.customerRiskScore ?? 0) >= 40 ? C.amber : C.green}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontFamily: C.mono, color: C.blue }}>{w.walletId}</span>
                          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{w.provider}</span>
                          <span style={{ fontSize: 9, fontFamily: C.mono, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: C.text3, border: `1px solid ${C.border2}` }}>{w.kycTier}</span>
                          {!w.isActive && <span style={{ fontSize: 9, fontFamily: C.mono, padding: "1px 6px", borderRadius: 4, background: "rgba(248,113,113,0.1)", color: C.red, border: "1px solid rgba(248,113,113,0.25)" }}>SUSPENDU</span>}
                          {w.isDormant && <span style={{ fontSize: 9, fontFamily: C.mono, padding: "1px 6px", borderRadius: 4, background: "rgba(251,191,36,0.1)", color: C.amber, border: "1px solid rgba(251,191,36,0.25)" }}>DORMANT</span>}
                        </div>
                        <div style={{ fontSize: 12, color: C.text2 }}>{w.customerName}</div>
                        <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>Solde : <span style={{ color: C.text1 }}>{formatNumber(Number(w.balance))} {w.currency}</span></span>
                          {w.openAlertsCount > 0 && <span style={{ fontSize: 10, fontFamily: C.mono, color: C.red }}>{w.openAlertsCount} alerte(s)</span>}
                          {w.suspiciousTxCount > 0 && <span style={{ fontSize: 10, fontFamily: C.mono, color: C.amber }}>{w.suspiciousTxCount} tx suspecte(s)</span>}
                          {w.lastActivityAt && <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>Activité : {formatRelative(w.lastActivityAt)}</span>}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: "right" as const }}>
                        <RiskScore score={w.customerRiskScore ?? 0} />
                        <div style={{ fontSize: 9, color: C.text3, marginTop: 4, fontFamily: C.mono }}><SeverityBadge level={w.customerRiskLevel ?? "LOW"} /></div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => navigate(`/customers/${w.customerId}`)}
                          style={{ fontSize: 10, fontFamily: C.mono, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: "transparent", color: C.blue, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                          <Eye size={10} /> Client
                        </button>
                        {isSupervisor && (
                          <button
                            onClick={() => { setInvForm(f => ({ ...f, walletId: String(w.id), customerId: String(w.customerId), severity: (w.customerRiskScore ?? 0) >= 70 ? "HIGH" : "MEDIUM" })); setShowInvModal(true); }}
                            style={{ fontSize: 10, fontFamily: C.mono, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: C.red, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                            <FolderOpen size={10} /> Ouvrir
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={riskPage} total={risksData.total} limit={15} onPage={setRiskPage} />
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 3 — ALERTES AML                                                 */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "alerts" && (
          <div>
            {alertsLoading ? (
              <p style={{ color: C.text3, fontFamily: C.mono, fontSize: 12 }}>Chargement…</p>
            ) : !alertsData?.data.length ? (
              <div style={{ textAlign: "center" as const, padding: "48px 0" }}>
                <CheckCircle size={28} style={{ color: C.green, margin: "0 auto 10px", display: "block" }} />
                <p style={{ color: C.text3, fontFamily: C.mono, fontSize: 12 }}>Aucune alerte AML ouverte liée aux wallets.</p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 7 }}>
                  {alertsData.data.map(a => {
                    const priColor = a.priority === "CRITICAL" ? C.red : a.priority === "HIGH" ? C.amber : C.gold;
                    return (
                      <div key={a.id} style={{
                        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px 16px",
                        display: "flex", alignItems: "center", gap: 14,
                      }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: priColor, flexShrink: 0, boxShadow: `0 0 6px ${priColor}` }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 11, fontFamily: C.mono, color: C.blue }}>{a.alertId}</span>
                            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{a.alertType}</span>
                          </div>
                          <div style={{ fontSize: 12, color: C.text1 }}>{a.customerName}</div>
                          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>Wallet : <span style={{ color: C.blue }}>{a.walletRef ?? "—"}</span></span>
                            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{a.provider ?? ""} · {a.kycTier ?? ""}</span>
                          </div>
                          {a.reason && <div style={{ fontSize: 10, color: C.text3, marginTop: 3, fontStyle: "italic" }}>{a.reason.slice(0, 80)}</div>}
                        </div>
                        <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                          <SeverityBadge level={a.priority} />
                          <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, marginTop: 6 }}>{formatRelative(a.createdAt)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => navigate("/alerts")}
                            style={{ fontSize: 10, fontFamily: C.mono, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: "transparent", color: C.blue, cursor: "pointer" }}>
                            Voir
                          </button>
                          {isSupervisor && (
                            <button
                              onClick={() => { setInvForm(f => ({ ...f, customerId: String(a.customerId), severity: a.priority as "LOW" | "MEDIUM" | "HIGH" })); setShowInvModal(true); }}
                              style={{ fontSize: 10, fontFamily: C.mono, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.06)", color: C.red, cursor: "pointer" }}>
                              Dossier
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Pagination page={alertPage} total={alertsData.total} limit={15} onPage={setAlertPage} />
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 4 — TRANSACTIONS SUSPECTES                                      */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "suspicious" && (
          <div>
            {suspLoading ? (
              <p style={{ color: C.text3, fontFamily: C.mono, fontSize: 12 }}>Chargement…</p>
            ) : !suspData?.data.length ? (
              <div style={{ textAlign: "center" as const, padding: "48px 0" }}>
                <CheckCircle size={28} style={{ color: C.green, margin: "0 auto 10px", display: "block" }} />
                <p style={{ color: C.text3, fontFamily: C.mono, fontSize: 12 }}>Aucune transaction suspecte sur wallets.</p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 7 }}>
                  {suspData.data.map(tx => (
                    <div key={tx.id} style={{
                      background: C.surface, border: "1px solid rgba(248,113,113,0.2)", borderRadius: 9, padding: "12px 16px",
                      display: "flex", alignItems: "center", gap: 14,
                    }}>
                      <AlertTriangle size={14} style={{ color: C.red, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontFamily: C.mono, color: C.blue }}>{tx.transactionId}</span>
                          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{tx.transactionType} · {tx.channel}</span>
                        </div>
                        <div style={{ fontSize: 12, color: C.text1 }}>{tx.customerName}</div>
                        <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>Wallet : <span style={{ color: C.blue }}>{tx.walletRef ?? "—"}</span></span>
                          {tx.counterparty && <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{tx.counterparty}</span>}
                        </div>
                        {tx.flagReason && <div style={{ fontSize: 10, color: C.red, marginTop: 3, fontFamily: C.mono }}>⚠ {tx.flagReason.slice(0, 100)}</div>}
                      </div>
                      <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontFamily: C.mono, fontWeight: 600, color: C.red }}>{formatNumber(Number(tx.amount))} {tx.currency}</div>
                        <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, marginTop: 3 }}>{formatDate(tx.transactionDate)}</div>
                      </div>
                      <div style={{ textAlign: "center" as const, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontFamily: C.mono, color: C.red, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 5, padding: "2px 7px" }}>{tx.riskScore}</div>
                        <div style={{ fontSize: 9, color: C.text3, marginTop: 2 }}>score</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => navigate(`/customers/${tx.customerId}`)}
                          style={{ fontSize: 10, fontFamily: C.mono, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: "transparent", color: C.blue, cursor: "pointer" }}>
                          Client
                        </button>
                        {isSupervisor && tx.walletId && (
                          <button
                            onClick={() => { setInvForm(f => ({ ...f, walletId: String(tx.walletId), customerId: String(tx.customerId), severity: tx.riskScore >= 70 ? "HIGH" : "MEDIUM" })); setShowInvModal(true); }}
                            style={{ fontSize: 10, fontFamily: C.mono, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.06)", color: C.red, cursor: "pointer" }}>
                            Dossier
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={suspPage} total={suspData.total} limit={15} onPage={setSuspPage} />
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 5 — INVESTIGATIONS                                              */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "investigations" && (
          <div>
            {invLoading ? (
              <p style={{ color: C.text3, fontFamily: C.mono, fontSize: 12 }}>Chargement…</p>
            ) : !invData?.data.length ? (
              <div style={{ textAlign: "center" as const, padding: "48px 0" }}>
                <FolderOpen size={28} style={{ color: C.text3, margin: "0 auto 10px", display: "block", opacity: 0.4 }} />
                <p style={{ color: C.text3, fontFamily: C.mono, fontSize: 12 }}>Aucun dossier d'investigation ouvert.</p>
                {isSupervisor && (
                  <button onClick={() => setShowInvModal(true)}
                    style={{ marginTop: 12, fontSize: 11, fontFamily: C.mono, padding: "7px 16px", borderRadius: 7, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: C.red, cursor: "pointer" }}>
                    Ouvrir la première investigation
                  </button>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 7 }}>
                  {invData.data.map(c => (
                    <div key={c.id} style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "14px 18px",
                      display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
                    }}
                    onClick={() => navigate(`/cases/${c.id}`)}>
                      <FolderOpen size={14} style={{ color: C.gold, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: C.text1, fontWeight: 500, marginBottom: 3 }}>{c.title}</div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{c.caseId}</span>
                          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{c.customerName}</span>
                          {c.dueDate && <span style={{ fontSize: 10, fontFamily: C.mono, color: C.amber }}>Échéance : {formatDate(c.dueDate)}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                        <SeverityBadge level={c.severity} />
                        <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{formatRelative(c.createdAt)}</span>
                        <ChevronRight size={12} style={{ color: C.text3 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={invPage} total={invData.total} limit={15} onPage={setInvPage} />
              </>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* MODAL — Ouvrir une investigation wallet                             */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {showInvModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, width: 480 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text1, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <FolderOpen size={14} style={{ color: C.red }} /> Ouvrir une investigation
                </h3>
                <button onClick={() => setShowInvModal(false)} style={{ background: "none", border: "none", color: C.text3, cursor: "pointer" }}><X size={16} /></button>
              </div>

              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LABEL_S}>ID Wallet (PK) *</label>
                    <input type="number" value={invForm.walletId} onChange={e => setInvForm(f => ({ ...f, walletId: e.target.value }))} placeholder="ex: 3" style={INPUT_S} />
                  </div>
                  <div>
                    <label style={LABEL_S}>ID Client *</label>
                    <input type="number" value={invForm.customerId} onChange={e => setInvForm(f => ({ ...f, customerId: e.target.value }))} placeholder="ex: 12" style={INPUT_S} />
                  </div>
                </div>
                <div>
                  <label style={LABEL_S}>Sévérité</label>
                  <select value={invForm.severity} onChange={e => setInvForm(f => ({ ...f, severity: e.target.value as "LOW" | "MEDIUM" | "HIGH" }))} style={INPUT_S}>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div>
                  <label style={LABEL_S}>Motif de l'investigation * (min. 10 caractères)</label>
                  <textarea value={invForm.reason} onChange={e => setInvForm(f => ({ ...f, reason: e.target.value }))} rows={4}
                    placeholder="Ex: Transactions répétées proches du seuil BAM (structuring potentiel). Wallet ALLEGED avec solde anormalement élevé. Nécessite vérification EDD."
                    style={{ ...INPUT_S, resize: "vertical" as const, lineHeight: 1.5 }} />
                </div>
              </div>

              {createInvMutation.error && <p style={{ fontSize: 11, color: C.red, fontFamily: C.mono, marginTop: 10 }}>{createInvMutation.error.message}</p>}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button onClick={() => setShowInvModal(false)} style={{ flex: 1, padding: "9px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text2, background: "transparent", cursor: "pointer" }}>Annuler</button>
                <button
                  disabled={!invForm.walletId || !invForm.customerId || invForm.reason.trim().length < 10 || createInvMutation.isPending}
                  onClick={() => createInvMutation.mutate({
                    walletId:   parseInt(invForm.walletId),
                    customerId: parseInt(invForm.customerId),
                    reason:     invForm.reason,
                    severity:   invForm.severity,
                  })}
                  style={{ flex: 2, padding: "9px 0", fontSize: 12, fontFamily: C.mono, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, color: C.red, cursor: "pointer", opacity: (!invForm.walletId || !invForm.customerId || invForm.reason.trim().length < 10) ? 0.4 : 1 }}>
                  {createInvMutation.isPending ? "Création…" : "Créer le dossier"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}

// ─── Mini composant pagination ────────────────────────────────────────────────
function Pagination({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}
        style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.border2}`, background: "transparent", color: C.text2, cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.4 : 1 }}>←</button>
      <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, padding: "5px 0" }}>{page} / {totalPages} — {total} entrée(s)</span>
      <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}
        style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.border2}`, background: "transparent", color: C.text2, cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.4 : 1 }}>→</button>
    </div>
  );
}
