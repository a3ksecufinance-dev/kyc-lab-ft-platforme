import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatRelative, formatNumber } from "../lib/utils";
import { Wallet, AlertTriangle, Plus, History } from "lucide-react";
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
  hover:   "var(--wr-hover)",
};

type KycTier = "ALLEGED" | "STANDARD" | "RENFORCE";

const TIER_COLORS: Record<KycTier, { bg: string; text: string; border: string }> = {
  ALLEGED:  { bg: "rgba(248,113,113,0.1)",  text: "#F87171", border: "rgba(248,113,113,0.25)" },
  STANDARD: { bg: "rgba(251,191,36,0.1)",   text: "#FBB924", border: "rgba(251,191,36,0.25)"  },
  RENFORCE: { bg: "rgba(52,211,153,0.1)",   text: "#34D399", border: "rgba(52,211,153,0.25)"  },
};

function TierBadge({ tier }: { tier: string }) {
  const c = TIER_COLORS[(tier as KycTier)] ?? TIER_COLORS.ALLEGED;
  return (
    <span style={{
      fontSize: 10, fontFamily: C.mono, fontWeight: 600,
      letterSpacing: "0.07em", padding: "2px 7px", borderRadius: 5,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      {tier}
    </span>
  );
}

type Wallet = {
  id: number; walletId: string; customerId: number;
  provider: string; kycTier: string; balance: string;
  currency: string; isDormant: boolean; isActive: boolean;
  createdAt: Date;
};

const INPUT_S: React.CSSProperties = {
  width: "100%", background: "var(--wr-hover)", border: "1px solid var(--wr-border2)",
  borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: "var(--wr-font-mono)",
  color: "var(--wr-text-1)", outline: "none", boxSizing: "border-box",
};
const LABEL_S: React.CSSProperties = {
  fontSize: 9, fontFamily: "var(--wr-font-mono)", letterSpacing: "0.15em",
  textTransform: "uppercase", color: "var(--wr-text-3)", marginBottom: 5, display: "block",
};

export function WalletsPage() {
  const flags = useInstitution();
  const { user } = useAuth();
  const isSupervisor = hasRole(user, "supervisor");
  const [page, setPage] = useState(1);
  const [tierFilter, setTierFilter] = useState("");
  const [dormantOnly, setDormantOnly] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [newTier, setNewTier] = useState<KycTier>("STANDARD");
  const [tierReason, setTierReason] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ customerId: "", provider: "INTERNAL", phoneNumber: "", currency: "MAD", kycTier: "ALLEGED" as KycTier });

  // Detail modal
  const [detailId, setDetailId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: stats } = trpc.wallets.stats.useQuery(undefined, {
    enabled: flags.wallets,
  });

  const { data, isLoading } = trpc.wallets.list.useQuery({
    page, limit: 20,
    ...(tierFilter  ? { kycTier: tierFilter as KycTier } : {}),
    ...(dormantOnly ? { isDormant: true } : {}),
  }, {
    placeholderData: keepPreviousData,
    enabled: flags.wallets,
  });

  // Detail + tier history queries
  const { data: walletDetail } = trpc.wallets.get.useQuery(
    { id: detailId ?? 0 }, { enabled: !!detailId }
  );
  const { data: tierHistoryData } = trpc.wallets.tierHistory.useQuery(
    { walletId: detailId ?? 0 }, { enabled: !!detailId }
  );

  const createMutation = trpc.wallets.create.useMutation({
    onSuccess: () => { utils.wallets.list.invalidate(); utils.wallets.stats.invalidate(); setShowCreate(false); setCreateForm({ customerId: "", provider: "INTERNAL", phoneNumber: "", currency: "MAD", kycTier: "ALLEGED" }); },
  });

  const promoteMutation = trpc.wallets.promoteTier.useMutation({
    onSuccess: () => {
      utils.wallets.list.invalidate();
      utils.wallets.stats.invalidate();
      setSelectedWallet(null);
      setTierReason("");
    },
  });

  const reactivateMutation = trpc.wallets.reactivate.useMutation({
    onSuccess: () => {
      utils.wallets.list.invalidate();
      utils.wallets.stats.invalidate();
    },
  });

  const COLUMNS: Column<Wallet>[] = [
    {
      key: "id", header: "Wallet ID", width: "w-40",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 11, color: C.blue }}>{r.walletId}</span>,
    },
    {
      key: "provider", header: "Provider", width: "w-28",
      render: (r) => <Badge label={r.provider} />,
    },
    {
      key: "kycTier", header: "Tier KYC", width: "w-28",
      render: (r) => <TierBadge tier={r.kycTier} />,
    },
    {
      key: "balance", header: "Solde", width: "w-32",
      render: (r) => (
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text1 }}>
          {formatNumber(Number(r.balance))} {r.currency}
        </span>
      ),
    },
    {
      key: "isDormant", header: "Statut", width: "w-28",
      render: (r) => (
        r.isDormant
          ? <span style={{ fontSize: 10, fontFamily: C.mono, color: C.amber, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5, padding: "2px 7px" }}>DORMANT</span>
          : r.isActive
            ? <span style={{ fontSize: 10, fontFamily: C.mono, color: C.green, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 5, padding: "2px 7px" }}>ACTIF</span>
            : <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "2px 7px" }}>INACTIF</span>
      ),
    },
    {
      key: "createdAt", header: "Créé", width: "w-32",
      render: (r) => <span style={{ fontSize: 11, color: C.text3 }}>{formatRelative(r.createdAt)}</span>,
    },
    {
      key: "actions", header: "", width: "w-36",
      render: (r) => (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setDetailId(r.id)}
            style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 8px", borderRadius: 5,
              border: `1px solid ${C.border2}`, background: "transparent", color: C.blue,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
          >
            <History size={10} /> Détail
          </button>
          {isSupervisor && (
            <button
              onClick={() => { setSelectedWallet(r); setNewTier("STANDARD"); }}
              style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 8px", borderRadius: 5,
                border: `1px solid ${C.border2}`, background: "transparent", color: C.text3,
                cursor: "pointer" }}
            >
              Tier
            </button>
          )}
          {r.isDormant && isSupervisor && (
            <button
              onClick={() => reactivateMutation.mutate({ walletId: r.id })}
              style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 8px", borderRadius: 5,
                border: "1px solid rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.06)",
                color: C.green, cursor: "pointer" }}
            >
              Activer
            </button>
          )}
        </div>
      ),
    },
  ];

  if (!flags.wallets) {
    return (
      <AppLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
          <Wallet size={32} style={{ color: C.text3, opacity: 0.4 }} />
          <p style={{ color: C.text3, fontSize: 13 }}>Module wallets non activé pour cette institution.</p>
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
              <Wallet size={18} style={{ color: C.gold }} />
              Wallets
            </h1>
            <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
              Gestion des wallets et tiers KYC — {flags.institutionName}
            </p>
          </div>
          {isSupervisor && (
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer" }}
            >
              <Plus size={13} /> Nouveau wallet
            </button>
          )}
        </div>

        {/* ── KPI ─────────────────────────────────────────────────────────── */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Wallets actifs",    value: stats.total,   icon: <Wallet size={14} />,       color: C.blue  },
              { label: "Dormants",          value: stats.dormant, icon: <AlertTriangle size={14} />, color: C.amber },
              { label: "Allégé",            value: stats.byTier?.["ALLEGED"]  ?? 0, color: C.red   },
              { label: "Standard",          value: stats.byTier?.["STANDARD"] ?? 0, color: C.gold  },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: 10, color: C.text3, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.1em" }}>{kpi.label}</p>
                <p style={{ fontSize: 22, fontWeight: 600, color: kpi.color, margin: 0, fontFamily: C.mono }}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Filtres ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <select
            value={tierFilter}
            onChange={e => { setTierFilter(e.target.value); setPage(1); }}
            style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border2}`,
              background: C.surface, color: C.text2, outline: "none", cursor: "pointer" }}
          >
            <option value="">Tous les tiers</option>
            <option value="ALLEGED">ALLEGED</option>
            <option value="STANDARD">STANDARD</option>
            <option value="RENFORCE">RENFORCE</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text2, cursor: "pointer" }}>
            <input type="checkbox" checked={dormantOnly} onChange={e => { setDormantOnly(e.target.checked); setPage(1); }} />
            Dormants uniquement
          </label>
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <DataTable<Wallet>
          columns={COLUMNS}
          data={(data?.data ?? []) as Wallet[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          page={page}
          total={data?.total ?? 0}
          limit={20}
          onPageChange={setPage}
        />

        {/* ── Modal promotion de tier ──────────────────────────────────────── */}
        {selectedWallet && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
          }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, width: 380 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: C.text1, margin: "0 0 4px" }}>
                Promotion de tier
              </h2>
              <p style={{ fontSize: 12, color: C.text3, margin: "0 0 18px", fontFamily: C.mono }}>
                {selectedWallet.walletId} — tier actuel : <TierBadge tier={selectedWallet.kycTier} />
              </p>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: C.text3, display: "block", marginBottom: 5 }}>Nouveau tier</label>
                <select
                  value={newTier}
                  onChange={e => setNewTier(e.target.value as KycTier)}
                  style={{ width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 7,
                    border: `1px solid ${C.border2}`, background: "var(--wr-bg)", color: C.text1, outline: "none" }}
                >
                  <option value="ALLEGED">ALLEGED — 5 000 / 20 000 MAD</option>
                  <option value="STANDARD">STANDARD — 50 000 / 200 000 MAD</option>
                  <option value="RENFORCE">RENFORCE — 500 000 / 2 000 000 MAD</option>
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, color: C.text3, display: "block", marginBottom: 5 }}>Motif (obligatoire)</label>
                <textarea
                  value={tierReason}
                  onChange={e => setTierReason(e.target.value)}
                  rows={3}
                  placeholder="Documents vérifiés, entretien EDD réalisé…"
                  style={{ width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 7,
                    border: `1px solid ${C.border2}`, background: "var(--wr-bg)", color: C.text1,
                    outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setSelectedWallet(null)}
                  style={{ flex: 1, fontSize: 12, padding: "8px 0", borderRadius: 8,
                    border: `1px solid ${C.border2}`, background: "transparent", color: C.text3, cursor: "pointer" }}
                >
                  Annuler
                </button>
                <button
                  disabled={tierReason.trim().length < 5 || promoteMutation.isPending}
                  onClick={() => promoteMutation.mutate({
                    walletId: selectedWallet.id,
                    customerId: selectedWallet.customerId,
                    newTier,
                    reason: tierReason,
                  })}
                  style={{ flex: 1, fontSize: 12, padding: "8px 0", borderRadius: 8,
                    border: "1px solid rgba(212,175,55,0.35)", background: "rgba(212,175,55,0.1)",
                    color: C.gold, cursor: "pointer", opacity: tierReason.trim().length < 5 ? 0.4 : 1 }}
                >
                  {promoteMutation.isPending ? "…" : "Confirmer"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── Modal création wallet ────────────────────────────────────────── */}
        {showCreate && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 420 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 16px" }}>Nouveau wallet</h3>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                <div>
                  <label style={LABEL_S}>ID Client *</label>
                  <input type="number" value={createForm.customerId} onChange={e => setCreateForm(f => ({ ...f, customerId: e.target.value }))} placeholder="123" style={INPUT_S} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LABEL_S}>Provider</label>
                    <select value={createForm.provider} onChange={e => setCreateForm(f => ({ ...f, provider: e.target.value }))} style={INPUT_S}>
                      {["INTERNAL", "ORANGE_MONEY", "WAVE", "CIH_MOBILE"].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={LABEL_S}>Tier initial</label>
                    <select value={createForm.kycTier} onChange={e => setCreateForm(f => ({ ...f, kycTier: e.target.value as KycTier }))} style={INPUT_S}>
                      <option value="ALLEGED">ALLEGED</option>
                      <option value="STANDARD">STANDARD</option>
                      <option value="RENFORCE">RENFORCE</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LABEL_S}>Téléphone</label>
                    <input value={createForm.phoneNumber} onChange={e => setCreateForm(f => ({ ...f, phoneNumber: e.target.value }))} placeholder="+212600000000" style={INPUT_S} />
                  </div>
                  <div>
                    <label style={LABEL_S}>Devise</label>
                    <select value={createForm.currency} onChange={e => setCreateForm(f => ({ ...f, currency: e.target.value }))} style={INPUT_S}>
                      {["MAD", "XOF", "EUR", "USD"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {createMutation.error && <p style={{ fontSize: 11, color: C.red, fontFamily: C.mono, marginTop: 8 }}>{createMutation.error.message}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}>Annuler</button>
                <button
                  disabled={!createForm.customerId || createMutation.isPending}
                  onClick={() => createMutation.mutate({ customerId: parseInt(createForm.customerId), provider: createForm.provider, phoneNumber: createForm.phoneNumber || undefined, currency: createForm.currency, kycTier: createForm.kycTier })}
                  style={{ flex: 1, padding: "7px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: !createForm.customerId ? 0.4 : 1 }}
                >
                  {createMutation.isPending ? "Création…" : "Créer"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal détail + historique tiers ─────────────────────────────── */}
        {detailId && walletDetail && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 480, maxHeight: "80vh", overflowY: "auto" as const }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 4px" }}>{walletDetail.walletId}</h3>
                  <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>Client #{walletDetail.customerId} — {walletDetail.provider}</p>
                </div>
                <TierBadge tier={walletDetail.kycTier} />
              </div>

              {/* Infos */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Solde", value: `${formatNumber(Number(walletDetail.balance))} ${walletDetail.currency}` },
                  { label: "Statut", value: walletDetail.isDormant ? "DORMANT" : walletDetail.isActive ? "ACTIF" : "INACTIF" },
                  { label: "Créé", value: formatRelative(walletDetail.createdAt) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: C.hover, borderRadius: 6, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text1 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Historique tiers */}
              <div>
                <div style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 10 }}>Historique des tiers KYC</div>
                {!tierHistoryData || tierHistoryData.length === 0 ? (
                  <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3 }}>Aucun changement de tier.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                    {tierHistoryData.map((h: { id: number; previousTier: string | null; newTier: string; reason: string | null; createdAt: Date }) => (
                      <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: C.hover, borderRadius: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text2 }}>
                            {h.previousTier ?? "—"} → {h.newTier}
                          </div>
                          {h.reason && <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>{h.reason}</div>}
                        </div>
                        <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{formatDate(h.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={() => setDetailId(null)} style={{ width: "100%", marginTop: 16, padding: "7px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}>Fermer</button>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
