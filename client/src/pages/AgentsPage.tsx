import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { ScoreBadge } from "../components/ui/ScoreBadge";
import { trpc } from "../lib/trpc";
import { formatRelative, formatNumber } from "../lib/utils";
import { Users2, Plus, Eye } from "lucide-react";
import { useInstitution } from "../context/InstitutionContext";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { formatDate } from "../lib/utils";

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

type Agent = {
  id: number; agentId: string; name: string;
  phone: string | null; region: string | null; city: string | null;
  floatBalance: string; currency: string;
  dailyTxCount: number; dailyTxVolume: string;
  riskScore: number; isActive: boolean;
  lastActivityAt: Date | null; createdAt: Date;
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

export function AgentsPage() {
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

  // Detail modal
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<"info" | "float" | "risk" | "activity">("info");
  const [floatDelta, setFloatDelta] = useState("");
  const [newRiskScore, setNewRiskScore] = useState(0);

  const utils = trpc.useUtils();

  const { data: stats } = trpc.agents.stats.useQuery(undefined, { enabled: flags.agentAccounts });

  const { data, isLoading } = trpc.agents.list.useQuery({
    page, limit: 20,
    ...(regionFilter ? { region: regionFilter } : {}),
    ...(activeOnly   ? { isActive: true } : {}),
    ...(riskMin > 0  ? { riskMin } : {}),
    ...(search       ? { search } : {}),
  }, { placeholderData: keepPreviousData, enabled: flags.agentAccounts });

  // Detail queries
  const { data: agentDetail } = trpc.agents.get.useQuery(
    { id: detailId ?? 0 }, { enabled: !!detailId }
  );
  const { data: activityData } = trpc.agents.activity.useQuery(
    { agentId: detailId ?? 0, days: 30 }, { enabled: !!detailId && detailTab === "activity" }
  );

  const invalidateDetail = () => {
    utils.agents.get.invalidate({ id: detailId ?? 0 });
    utils.agents.list.invalidate();
    utils.agents.stats.invalidate();
  };

  const createMutation = trpc.agents.create.useMutation({
    onSuccess: () => { utils.agents.list.invalidate(); utils.agents.stats.invalidate(); setShowCreate(false); setCreateForm({ name: "", phone: "", region: "", city: "", licenseNumber: "", currency: "MAD" }); },
  });
  const adjustFloatMutation = trpc.agents.adjustFloat.useMutation({ onSuccess: () => { invalidateDetail(); setFloatDelta(""); } });
  const updateRiskMutation  = trpc.agents.updateRisk.useMutation({ onSuccess: () => { invalidateDetail(); } });

  const toggleActiveMutation = trpc.agents.setActive.useMutation({
    onSuccess: () => utils.agents.list.invalidate(),
  });

  const COLUMNS: Column<Agent>[] = [
    {
      key: "agentId", header: "Agent ID", width: "w-36",
      render: (r) => (
        <div>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.blue, margin: "0 0 2px" }}>{r.agentId}</p>
          <p style={{ fontSize: 11, color: C.text2, margin: 0 }}>{r.name}</p>
        </div>
      ),
    },
    {
      key: "region", header: "Région / Ville", width: "w-36",
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
      key: "dailyTxCount", header: "Activité (24h)", width: "w-32",
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
      key: "riskScore", header: "Risque", width: "w-24",
      render: (r) => <ScoreBadge score={r.riskScore} />,
    },
    {
      key: "isActive", header: "Statut", width: "w-24",
      render: (r) => (
        r.isActive
          ? <span style={{ fontSize: 10, fontFamily: C.mono, color: C.green, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 5, padding: "2px 7px" }}>ACTIF</span>
          : <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "2px 7px" }}>INACTIF</span>
      ),
    },
    {
      key: "lastActivityAt", header: "Dernière activité", width: "w-32",
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
            onClick={() => { setDetailId(r.id); setDetailTab("info"); setNewRiskScore(r.riskScore); }}
            style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 8px", borderRadius: 5, cursor: "pointer", border: `1px solid ${C.border2}`, background: "transparent", color: C.blue, display: "flex", alignItems: "center", gap: 3 }}
          >
            <Eye size={10} /> Détail
          </button>
          <button
            onClick={() => toggleActiveMutation.mutate({ agentId: r.id, isActive: !r.isActive })}
            style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 8px", borderRadius: 5, cursor: "pointer", border: r.isActive ? "1px solid rgba(248,113,113,0.3)" : "1px solid rgba(52,211,153,0.3)", background: r.isActive ? "rgba(248,113,113,0.06)" : "rgba(52,211,153,0.06)", color: r.isActive ? C.red : C.green }}
          >
            {r.isActive ? "Désact." : "Activer"}
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
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: C.text1, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
              <Users2 size={18} style={{ color: C.gold }} />
              Réseau agents
            </h1>
            <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
              Supervision du réseau d'agents cash-in / cash-out — {flags.institutionName}
            </p>
          </div>
          {isSupervisor && (
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer" }}
            >
              <Plus size={13} /> Nouvel agent
            </button>
          )}
        </div>

        {/* ── KPI ─────────────────────────────────────────────────────────── */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Total agents",   value: stats.total,       color: C.text1 },
              { label: "Actifs",         value: stats.active,      color: C.green },
              { label: "Risque élevé",   value: stats.highRisk,    color: C.red   },
              { label: "Volume 30j",     value: `${formatNumber(stats.volume30d)} MAD`, color: C.blue, raw: true },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: 10, color: C.text3, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.1em" }}>{kpi.label}</p>
                <p style={{ fontSize: (kpi as {raw?: boolean}).raw ? 15 : 22, fontWeight: 600, color: kpi.color, margin: 0, fontFamily: C.mono }}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Filtres ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
              placeholder="ID agent, nom…"
              style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border2}`,
                background: C.surface, color: C.text2, outline: "none", width: 180 }}
            />
          </div>
          <input
            value={regionFilter}
            onChange={e => { setRegionFilter(e.target.value); setPage(1); }}
            placeholder="Région"
            style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border2}`,
              background: C.surface, color: C.text2, outline: "none", width: 120 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text2, cursor: "pointer" }}>
            <input type="checkbox" checked={activeOnly} onChange={e => { setActiveOnly(e.target.checked); setPage(1); }} />
            Actifs seulement
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text2, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={riskMin >= 70}
              onChange={e => { setRiskMin(e.target.checked ? 70 : 0); setPage(1); }}
            />
            Risque élevé (≥70)
          </label>
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
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 480 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 16px" }}>Nouvel agent</h3>
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
                Annuler
              </button>
              <button
                disabled={!createForm.name || createMutation.isPending}
                onClick={() => createMutation.mutate({ name: createForm.name, ...(createForm.phone ? { phone: createForm.phone } : {}), ...(createForm.region ? { region: createForm.region } : {}), ...(createForm.city ? { city: createForm.city } : {}), ...(createForm.licenseNumber ? { licenseNumber: createForm.licenseNumber } : {}), currency: createForm.currency })}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: (!createForm.name || createMutation.isPending) ? 0.4 : 1 }}
              >
                {createMutation.isPending ? "Création…" : "Créer l'agent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal détail agent ───────────────────────────────────────────── */}
      {detailId && agentDetail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 520 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.blue, margin: "0 0 2px" }}>{agentDetail.agentId}</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: C.text1, margin: 0 }}>{agentDetail.name}</p>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {agentDetail.isActive
                  ? <span style={{ fontSize: 10, fontFamily: C.mono, color: C.green, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 5, padding: "2px 7px" }}>ACTIF</span>
                  : <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "2px 7px" }}>INACTIF</span>
                }
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
              {(["info", "float", "risk", "activity"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  style={{ padding: "6px 14px", fontSize: 11, fontFamily: C.mono, background: "none", border: "none", borderBottom: detailTab === tab ? `2px solid ${C.blue}` : "2px solid transparent", color: detailTab === tab ? C.blue : C.text3, cursor: "pointer", marginBottom: -1 }}
                >
                  {tab === "info" ? "Infos" : tab === "float" ? "Float" : tab === "risk" ? "Risque" : "Activité"}
                </button>
              ))}
            </div>

            {/* Tab: Info */}
            {detailTab === "info" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Téléphone",      value: agentDetail.phone ?? "—" },
                  { label: "Région",         value: agentDetail.region ?? "—" },
                  { label: "Ville",          value: agentDetail.city ?? "—" },
                  { label: "Devise",         value: agentDetail.currency },
                  { label: "Float actuel",   value: `${formatNumber(Number(agentDetail.floatBalance))} ${agentDetail.currency}` },
                  { label: "Score risque",   value: String(agentDetail.riskScore) },
                  { label: "Tx 24h",         value: `${agentDetail.dailyTxCount} tx` },
                  { label: "Vol. 24h",       value: `${formatNumber(Number(agentDetail.dailyTxVolume))} ${agentDetail.currency}` },
                  { label: "Créé le",        value: formatDate(agentDetail.createdAt) },
                  { label: "Dernière activité", value: agentDetail.lastActivityAt ? formatDate(agentDetail.lastActivityAt) : "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "var(--wr-hover)", borderRadius: 6, padding: "8px 10px" }}>
                    <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text3, margin: "0 0 3px" }}>{label}</p>
                    <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text1, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Float */}
            {detailTab === "float" && (
              <div>
                <div style={{ background: "var(--wr-hover)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                  <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text3, margin: "0 0 4px" }}>Float actuel</p>
                  <p style={{ fontSize: 22, fontWeight: 600, fontFamily: C.mono, color: C.blue, margin: 0 }}>
                    {formatNumber(Number(agentDetail.floatBalance))} {agentDetail.currency}
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
                  disabled={!floatDelta || adjustFloatMutation.isPending}
                  onClick={() => adjustFloatMutation.mutate({ agentId: detailId, delta: Number(floatDelta) })}
                  style={{ width: "100%", padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: (!floatDelta || adjustFloatMutation.isPending) ? 0.4 : 1 }}
                >
                  {adjustFloatMutation.isPending ? "Ajustement…" : "Appliquer l'ajustement"}
                </button>
                {adjustFloatMutation.error && (
                  <p style={{ marginTop: 8, fontSize: 11, fontFamily: C.mono, color: C.red }}>{adjustFloatMutation.error.message}</p>
                )}
              </div>
            )}

            {/* Tab: Risque */}
            {detailTab === "risk" && (
              <div>
                <div style={{ background: "var(--wr-hover)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                  <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text3, margin: "0 0 4px" }}>Score actuel</p>
                  <p style={{ fontSize: 22, fontWeight: 600, fontFamily: C.mono, color: agentDetail.riskScore >= 70 ? C.red : agentDetail.riskScore >= 40 ? C.amber : C.green, margin: 0 }}>
                    {agentDetail.riskScore} / 100
                  </p>
                </div>
                <label style={AG_LABEL}>Nouveau score (0–100)</label>
                <input
                  type="range" min={0} max={100}
                  value={newRiskScore}
                  onChange={e => setNewRiskScore(Number(e.target.value))}
                  style={{ width: "100%", marginBottom: 6 }}
                />
                <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text2, textAlign: "center", margin: "0 0 12px" }}>{newRiskScore}</p>
                <button
                  disabled={updateRiskMutation.isPending}
                  onClick={() => updateRiskMutation.mutate({ agentId: detailId, riskScore: newRiskScore })}
                  style={{ width: "100%", padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.amber}14`, border: `1px solid ${C.amber}40`, borderRadius: 7, color: C.amber, cursor: "pointer" }}
                >
                  {updateRiskMutation.isPending ? "Mise à jour…" : "Mettre à jour le score"}
                </button>
              </div>
            )}

            {/* Tab: Activité */}
            {detailTab === "activity" && (
              <div>
                {!activityData ? (
                  <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, textAlign: "center", padding: "24px 0" }}>Chargement…</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      { label: `Transactions (${activityData.days}j)`, value: String(activityData.txCount) },
                      { label: `Volume (${activityData.days}j)`,       value: `${formatNumber(activityData.volume)} ${agentDetail.currency}` },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background: "var(--wr-hover)", borderRadius: 8, padding: "12px 14px" }}>
                        <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.12em", color: C.text3, margin: "0 0 4px" }}>{label}</p>
                        <p style={{ fontSize: 18, fontWeight: 600, fontFamily: C.mono, color: C.blue, margin: 0 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setDetailId(null)}
              style={{ width: "100%", marginTop: 16, padding: "6px 0", fontSize: 12, fontFamily: C.mono, color: C.text3, background: "none", border: "none", cursor: "pointer" }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
