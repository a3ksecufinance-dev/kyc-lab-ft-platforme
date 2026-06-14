import { keepPreviousData } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatRelative, formatNumber } from "../lib/utils";
import {
  Wallet, AlertTriangle, Plus, History, Upload, Download,
  Ban, CheckCircle, TrendingUp, ChevronRight, X,
} from "lucide-react";
import { useInstitution } from "../context/InstitutionContext";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { formatDate } from "../lib/utils";
import { useI18n } from "../hooks/useI18n";

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

type WalletRow = {
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

// ─── Usage gauge ──────────────────────────────────────────────────────────────
function UsageBar({ label, used, limit, currency }: { label: string; used: number; limit: number; currency: string }) {
  const pct   = Math.min(100, Math.round(used / limit * 100));
  const color = pct >= 90 ? C.red : pct >= 70 ? C.amber : C.green;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: C.mono, color }}>
          {formatNumber(used)} / {formatNumber(limit)} {currency}
        </span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.5s" }} />
      </div>
    </div>
  );
}

// ─── Detail tab enum ──────────────────────────────────────────────────────────
type DetailTab = "info" | "usage" | "transactions" | "history";

export function WalletsPage() {
  const { t } = useI18n();
  const flags       = useInstitution();
  const { user }    = useAuth();
  const isSupervisor = hasRole(user, "supervisor");
  const [page, setPage] = useState(1);
  const [tierFilter, setTierFilter]   = useState("");
  const [dormantOnly, setDormantOnly] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletRow | null>(null);
  const [newTier, setNewTier]     = useState<KycTier>("STANDARD");
  const [tierReason, setTierReason] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ customerId: "", provider: "INTERNAL", phoneNumber: "", currency: "MAD", kycTier: "ALLEGED" as KycTier });

  // Detail modal
  const [detailId, setDetailId]   = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [txPage, setTxPage]       = useState(1);

  // Suspend modal
  const [suspendTarget, setSuspendTarget] = useState<WalletRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  // Import par-wallet (conservé pour usage avancé)
  const [importTarget, setImportTarget]   = useState<WalletRow | null>(null);
  const [importContent, setImportContent] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importDryRun, setImportDryRun]   = useState(true);
  const [importReport, setImportReport]   = useState<null | {
    format: string; total: number; parsed: number; inserted: number;
    duplicates: number; skipped: number; errors: Array<{ line: number; error: string }>;
    sampleRows: Array<{ date: string; amount: string; type: string; counterparty?: string }>;
  }>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import global (multi-wallets)
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkContent, setBulkContent]       = useState("");
  const [bulkFileName, setBulkFileName]     = useState("");
  const [bulkDryRun, setBulkDryRun]         = useState(true);
  const [bulkProvider, setBulkProvider]     = useState("ORANGE_MONEY");
  const [bulkReport, setBulkReport]         = useState<null | {
    format: string; totalRows: number; parsedRows: number;
    walletsFound: number; walletsCreated: number; walletsSkipped: number;
    totalInserted: number;
    groups: Array<{ phone: string; walletId: string | null; action: string; txCount: number; inserted: number; duplicates: number; totalAmount: number; currency: string; errors: string[] }>;
    errors: Array<{ line: number; error: string }>;
  }>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Queries
  const { data: stats } = trpc.wallets.stats.useQuery(undefined, { enabled: flags.wallets });
  const { data, isLoading } = trpc.wallets.list.useQuery({
    page, limit: 20,
    ...(tierFilter  ? { kycTier: tierFilter as KycTier } : {}),
    ...(dormantOnly ? { isDormant: true } : {}),
  }, { placeholderData: keepPreviousData, enabled: flags.wallets });

  const { data: walletDetail } = trpc.wallets.get.useQuery(
    { id: detailId ?? 0 }, { enabled: !!detailId }
  );
  const { data: tierHistoryData } = trpc.wallets.tierHistory.useQuery(
    { walletId: detailId ?? 0 }, { enabled: !!detailId && detailTab === "history" }
  );
  const { data: usageData } = trpc.wallets.getUsage.useQuery(
    { walletId: detailId ?? 0 }, { enabled: !!detailId && detailTab === "usage" }
  );
  const { data: txData } = trpc.wallets.getTransactions.useQuery(
    { walletId: detailId ?? 0, page: txPage, limit: 10 },
    { enabled: !!detailId && detailTab === "transactions", placeholderData: keepPreviousData }
  );

  // Mutations
  const createMutation = trpc.wallets.create.useMutation({
    onSuccess: () => {
      utils.wallets.list.invalidate();
      utils.wallets.stats.invalidate();
      setShowCreate(false);
      setCreateForm({ customerId: "", provider: "INTERNAL", phoneNumber: "", currency: "MAD", kycTier: "ALLEGED" });
    },
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
    onSuccess: () => { utils.wallets.list.invalidate(); utils.wallets.stats.invalidate(); },
  });
  const suspendMutation = trpc.wallets.suspend.useMutation({
    onSuccess: () => {
      utils.wallets.list.invalidate();
      setSuspendTarget(null);
      setSuspendReason("");
    },
  });
  const unsuspendMutation = trpc.wallets.unsuspend.useMutation({
    onSuccess: () => { utils.wallets.list.invalidate(); },
  });
  const importMutation = trpc.wallets.importTransactions.useMutation({
    onSuccess: (data) => {
      setImportReport(data);
      if (!importDryRun) utils.wallets.list.invalidate();
    },
  });

  const bulkImportMutation = trpc.wallets.bulkImport.useMutation({
    onSuccess: (data) => {
      setBulkReport(data);
      if (!bulkDryRun) { utils.wallets.list.invalidate(); utils.wallets.stats.invalidate(); }
    },
  });

  // Export CSV
  const { refetch: fetchCsv, isFetching: isExporting } = trpc.wallets.exportCsv.useQuery(
    { walletId: detailId ?? 0 },
    { enabled: false }
  );
  const handleExport = async () => {
    const result = await fetchCsv();
    if (result.data) {
      const blob = new Blob([result.data], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `wallet-${detailId}-transactions.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // File picker
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportReport(null);
    const reader = new FileReader();
    reader.onload = (ev) => setImportContent((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportReport(null);
    const reader = new FileReader();
    reader.onload = (ev) => setImportContent((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  const handleBulkFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    setBulkReport(null);
    const reader = new FileReader();
    reader.onload = (ev) => setBulkContent((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  const handleBulkDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setBulkFileName(file.name);
    setBulkReport(null);
    const reader = new FileReader();
    reader.onload = (ev) => setBulkContent((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  const COLUMNS: Column<WalletRow>[] = [
    {
      key: "id", header: t.wallets.walletId, width: "w-44",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 11, color: C.blue }}>{r.walletId}</span>,
    },
    {
      key: "provider", header: t.wallets.provider, width: "w-28",
      render: (r) => <Badge label={r.provider} />,
    },
    {
      key: "kycTier", header: t.wallets.tier, width: "w-28",
      render: (r) => <TierBadge tier={r.kycTier} />,
    },
    {
      key: "balance", header: t.wallets.balance, width: "w-36",
      render: (r) => (
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text1 }}>
          {formatNumber(Number(r.balance))} {r.currency}
        </span>
      ),
    },
    {
      key: "isDormant", header: t.wallets.status, width: "w-28",
      render: (r) => (
        r.isDormant
          ? <span style={{ fontSize: 10, fontFamily: C.mono, color: C.amber, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5, padding: "2px 7px" }}>DORMANT</span>
          : r.isActive
            ? <span style={{ fontSize: 10, fontFamily: C.mono, color: C.green, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 5, padding: "2px 7px" }}>ACTIF</span>
            : <span style={{ fontSize: 10, fontFamily: C.mono, color: C.red, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 5, padding: "2px 7px" }}>{t.wallets.suspended}</span>
      ),
    },
    {
      key: "createdAt", header: t.wallets.createdAt, width: "w-32",
      render: (r) => <span style={{ fontSize: 11, color: C.text3 }}>{formatRelative(r.createdAt)}</span>,
    },
    {
      key: "actions", header: "", width: "w-52",
      render: (r) => (
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => { setDetailId(r.id); setDetailTab("info"); setTxPage(1); }}
            style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: "transparent", color: C.blue, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
            <History size={10} /> {t.wallets.detail}
          </button>
          {isSupervisor && (
            <>
              <button onClick={() => setSelectedWallet(r)}
                style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: "transparent", color: C.text3, cursor: "pointer" }}>
                {t.wallets.tier}
              </button>
              {r.isActive && !r.isDormant
                ? <button onClick={() => { setSuspendTarget(r); setSuspendReason(""); }}
                    aria-label={t.wallets.suspendWallet}
                    style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 7px", borderRadius: 5, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: C.red, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                    <Ban size={10} />
                  </button>
                : !r.isActive
                  ? <button onClick={() => unsuspendMutation.mutate({ walletId: r.id })}
                      aria-label={t.wallets.unfreeze}
                      style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 7px", borderRadius: 5, border: "1px solid rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.06)", color: C.green, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                      <CheckCircle size={10} />
                    </button>
                  : null}
              {r.isDormant && (
                <button onClick={() => reactivateMutation.mutate({ walletId: r.id })}
                  style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 7px", borderRadius: 5, border: "1px solid rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.06)", color: C.green, cursor: "pointer" }}>
                  {t.wallets.activate}
                </button>
              )}
            </>
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
          <p style={{ color: C.text3, fontSize: 13 }}>{t.wallets.moduleNotActive}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ padding: "24px 28px", maxWidth: 1280 }}>

        {/* ── En-tête ──────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: C.text1, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
              <Wallet size={18} style={{ color: C.gold }} /> {t.wallets.title}
            </h1>
            <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
              {t.wallets.management} — {flags.institutionName}
            </p>
          </div>
          {isSupervisor && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowBulkImport(true); setBulkContent(""); setBulkFileName(""); setBulkReport(null); setBulkDryRun(true); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `${C.gold}14`, border: `1px solid ${C.gold}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.gold, cursor: "pointer" }}>
                <Upload size={13} /> {t.wallets.importTransactions}
              </button>
              <button onClick={() => setShowCreate(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer" }}>
                <Plus size={13} /> {t.wallets.newWallet}
              </button>
            </div>
          )}
        </div>

        {/* ── KPI ──────────────────────────────────────────────────────────── */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: t.wallets.activeWallets, value: stats.total,                              icon: <Wallet size={14} />,        color: C.blue  },
              { label: t.wallets.dormant,        value: stats.dormant,                            icon: <AlertTriangle size={14} />, color: C.amber },
              { label: t.wallets.alleged,        value: stats.byTier?.["ALLEGED"]  ?? 0,          color: C.red                                     },
              { label: t.wallets.volume30d,      value: `${formatNumber(stats.volume30d ?? 0)}`, icon: <TrendingUp size={14} />,   color: C.green },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: 10, color: C.text3, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.1em" }}>{kpi.label}</p>
                <p style={{ fontSize: typeof kpi.value === "string" ? 14 : 22, fontWeight: 600, color: kpi.color, margin: 0, fontFamily: C.mono }}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Filtres ───────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <select value={tierFilter} onChange={e => { setTierFilter(e.target.value); setPage(1); }}
            style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface, color: C.text2, outline: "none", cursor: "pointer" }}>
            <option value="">{t.wallets.allTiers}</option>
            <option value="ALLEGED">ALLEGED</option>
            <option value="STANDARD">STANDARD</option>
            <option value="RENFORCE">RENFORCE</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text2, cursor: "pointer" }}>
            <input type="checkbox" checked={dormantOnly} onChange={e => { setDormantOnly(e.target.checked); setPage(1); }} />
            {t.wallets.dormantOnly}
          </label>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <DataTable<WalletRow>
          columns={COLUMNS}
          data={(data?.data ?? []) as WalletRow[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          page={page}
          total={data?.total ?? 0}
          limit={20}
          onPageChange={setPage}
        />

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* MODAL — Promotion de tier                                           */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {selectedWallet && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div role="dialog" aria-modal="true" aria-label={t.wallets.tierPromotion} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, width: 380 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: C.text1, margin: "0 0 4px" }}>{t.wallets.tierPromotion}</h2>
              <p style={{ fontSize: 12, color: C.text3, margin: "0 0 18px", fontFamily: C.mono }}>
                {selectedWallet.walletId} — {t.wallets.currentTier} : <TierBadge tier={selectedWallet.kycTier} />
              </p>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: C.text3, display: "block", marginBottom: 5 }}>{t.wallets.newTier}</label>
                <select value={newTier} onChange={e => setNewTier(e.target.value as KycTier)}
                  style={{ width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border2}`, background: "var(--wr-bg)", color: C.text1, outline: "none" }}>
                  <option value="ALLEGED">ALLEGED — 5 000 / 20 000 MAD</option>
                  <option value="STANDARD">STANDARD — 50 000 / 200 000 MAD</option>
                  <option value="RENFORCE">RENFORCE — 500 000 / 2 000 000 MAD</option>
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, color: C.text3, display: "block", marginBottom: 5 }}>{t.wallets.reason}</label>
                <textarea value={tierReason} onChange={e => setTierReason(e.target.value)} rows={3}
                  placeholder={t.wallets.reasonPlaceholder}
                  style={{ width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border2}`, background: "var(--wr-bg)", color: C.text1, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setSelectedWallet(null)}
                  style={{ flex: 1, fontSize: 12, padding: "8px 0", borderRadius: 8, border: `1px solid ${C.border2}`, background: "transparent", color: C.text3, cursor: "pointer" }}>{t.common.cancel}</button>
                <button disabled={tierReason.trim().length < 5 || promoteMutation.isPending}
                  onClick={() => promoteMutation.mutate({ walletId: selectedWallet.id, customerId: selectedWallet.customerId, newTier, reason: tierReason })}
                  style={{ flex: 1, fontSize: 12, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(212,175,55,0.35)", background: "rgba(212,175,55,0.1)", color: C.gold, cursor: "pointer", opacity: tierReason.trim().length < 5 ? 0.4 : 1 }}>
                  {promoteMutation.isPending ? "…" : t.common.confirm}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* MODAL — Création wallet                                             */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {showCreate && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div role="dialog" aria-modal="true" aria-label={t.wallets.newWallet} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 420 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 16px" }}>{t.wallets.newWallet}</h3>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                <div>
                  <label style={LABEL_S}>{t.wallets.clientId} *</label>
                  <input type="number" value={createForm.customerId} onChange={e => setCreateForm(f => ({ ...f, customerId: e.target.value }))} placeholder="123" style={INPUT_S} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LABEL_S}>{t.wallets.provider}</label>
                    <select value={createForm.provider} onChange={e => setCreateForm(f => ({ ...f, provider: e.target.value }))} style={INPUT_S}>
                      {["INTERNAL", "ORANGE_MONEY", "WAVE", "CIH_MOBILE"].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={LABEL_S}>{t.wallets.initialTier}</label>
                    <select value={createForm.kycTier} onChange={e => setCreateForm(f => ({ ...f, kycTier: e.target.value as KycTier }))} style={INPUT_S}>
                      <option value="ALLEGED">ALLEGED</option>
                      <option value="STANDARD">STANDARD</option>
                      <option value="RENFORCE">RENFORCE</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LABEL_S}>{t.wallets.phone}</label>
                    <input value={createForm.phoneNumber} onChange={e => setCreateForm(f => ({ ...f, phoneNumber: e.target.value }))} placeholder="+212600000000" style={INPUT_S} />
                  </div>
                  <div>
                    <label style={LABEL_S}>{t.wallets.currency}</label>
                    <select value={createForm.currency} onChange={e => setCreateForm(f => ({ ...f, currency: e.target.value }))} style={INPUT_S}>
                      {["MAD", "XOF", "EUR", "USD"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {createMutation.error && <p style={{ fontSize: 11, color: C.red, fontFamily: C.mono, marginTop: 8 }}>{createMutation.error.message}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}>{t.common.cancel}</button>
                <button disabled={!createForm.customerId || createMutation.isPending}
                  onClick={() => createMutation.mutate({ customerId: parseInt(createForm.customerId), provider: createForm.provider, phoneNumber: createForm.phoneNumber || undefined, currency: createForm.currency, kycTier: createForm.kycTier })}
                  style={{ flex: 1, padding: "7px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: !createForm.customerId ? 0.4 : 1 }}>
                  {createMutation.isPending ? t.wallets.creating : t.wallets.create}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* MODAL — Suspension                                                  */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {suspendTarget && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div role="dialog" aria-modal="true" aria-label={t.wallets.suspendWallet} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 380 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.red, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                <Ban size={14} /> {t.wallets.suspendWallet}
              </h3>
              <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 16px" }}>{suspendTarget.walletId}</p>
              <div style={{ marginBottom: 16 }}>
                <label style={LABEL_S}>{t.wallets.suspendReason} *</label>
                <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} rows={3}
                  placeholder={t.wallets.suspendPlaceholder}
                  style={{ width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border2}`, background: "var(--wr-bg)", color: C.text1, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              {suspendMutation.error && <p style={{ fontSize: 11, color: C.red, margin: "0 0 8px" }}>{suspendMutation.error.message}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setSuspendTarget(null)} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}>{t.common.cancel}</button>
                <button disabled={suspendReason.trim().length < 5 || suspendMutation.isPending}
                  onClick={() => suspendMutation.mutate({ walletId: suspendTarget.id, reason: suspendReason })}
                  style={{ flex: 1, padding: "7px 0", fontSize: 12, fontFamily: C.mono, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 7, color: C.red, cursor: "pointer", opacity: suspendReason.trim().length < 5 ? 0.4 : 1 }}>
                  {suspendMutation.isPending ? "…" : t.common.confirm}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* MODAL — Import global (multi-wallets)                               */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {showBulkImport && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div role="dialog" aria-modal="true" aria-label={t.wallets.bulkImportTitle} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, width: 620, maxHeight: "88vh", overflowY: "auto" as const }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text1, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <Upload size={15} style={{ color: C.gold }} /> {t.wallets.bulkImportTitle}
                </h3>
                <button onClick={() => setShowBulkImport(false)} aria-label={t.common.close} style={{ background: "none", border: "none", color: C.text3, cursor: "pointer" }}><X size={16} /></button>
              </div>
              <p style={{ fontSize: 12, color: C.text3, margin: "0 0 20px" }}>
                {t.wallets.bulkImportDesc}
              </p>

              {/* Format hint */}
              <div style={{ background: C.hover, borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 11, fontFamily: C.mono, color: C.text3, lineHeight: 1.8 }}>
                <div style={{ color: C.gold, marginBottom: 4, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{t.wallets.requiredColumns}</div>
                <span style={{ color: C.blue }}>phone</span> (ou msisdn, telephone, numero) &nbsp;·&nbsp;
                <span style={{ color: C.blue }}>date</span> &nbsp;·&nbsp;
                <span style={{ color: C.blue }}>amount</span> (ou montant) &nbsp;·&nbsp;
                <span style={{ color: C.text2 }}>type</span> · <span style={{ color: C.text2 }}>currency</span> · <span style={{ color: C.text2 }}>counterparty</span> (optionnels)
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleBulkDrop}
                onClick={() => bulkFileRef.current?.click()}
                style={{
                  border: `2px dashed ${bulkContent ? C.green : C.border2}`, borderRadius: 10, padding: "32px 20px",
                  textAlign: "center" as const, cursor: "pointer", marginBottom: 16,
                  background: bulkContent ? "rgba(52,211,153,0.04)" : "transparent",
                }}
              >
                <Upload size={28} style={{ color: bulkContent ? C.green : C.text3, margin: "0 auto 8px", display: "block" }} />
                {bulkContent
                  ? <p style={{ fontSize: 12, color: C.green, fontFamily: C.mono, margin: 0 }}>{bulkFileName} — {bulkContent.split("\n").length - 1} {t.wallets.dataLines}</p>
                  : <>
                      <p style={{ fontSize: 13, color: C.text2, margin: "0 0 4px" }}>{t.wallets.dropFile}</p>
                      <p style={{ fontSize: 11, color: C.text3, margin: 0 }}>{t.wallets.orClick}</p>
                    </>}
                <input ref={bulkFileRef} type="file" accept=".csv,.txt,.sta,.mt940" onChange={handleBulkFilePick} style={{ display: "none" }} />
              </div>

              {/* Options */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={LABEL_S}>{t.wallets.providerDetected}</label>
                  <select value={bulkProvider} onChange={e => setBulkProvider(e.target.value)} style={INPUT_S}>
                    {["ORANGE_MONEY", "WAVE", "CIH_MOBILE", "INTERNAL"].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text2, cursor: "pointer" }}>
                    <input type="checkbox" checked={bulkDryRun} onChange={e => setBulkDryRun(e.target.checked)} />
                    {t.wallets.dryRun}
                  </label>
                </div>
              </div>

              {/* Rapport */}
              {bulkReport && (
                <div style={{ background: C.hover, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  {/* KPIs */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
                    {[
                      { label: t.wallets.lines,          val: bulkReport.totalRows,       color: C.text2 },
                      { label: t.wallets.walletsFound,   val: bulkReport.walletsFound,   color: C.blue  },
                      { label: t.wallets.walletsCreated, val: bulkReport.walletsCreated, color: C.green },
                      { label: t.wallets.skipped,        val: bulkReport.walletsSkipped, color: C.amber },
                      { label: t.wallets.txInserted,     val: bulkReport.totalInserted,  color: C.gold  },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: "center" as const }}>
                        <div style={{ fontSize: 20, fontFamily: C.mono, fontWeight: 700, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: 9, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Détail par wallet */}
                  {bulkReport.groups.length > 0 && (
                    <>
                      <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 8 }}>
                        {t.wallets.detailPerWallet} ({bulkReport.groups.length})
                      </div>
                      <div style={{ maxHeight: 200, overflowY: "auto" as const, display: "flex", flexDirection: "column" as const, gap: 5 }}>
                        {bulkReport.groups.map((g, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6, border: `1px solid ${C.border}` }}>
                            <div style={{ width: 56, flexShrink: 0 }}>
                              <span style={{
                                fontSize: 9, fontFamily: C.mono, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                                background: g.action === "found" ? `${C.blue}18` : g.action === "created" ? `${C.green}18` : `${C.amber}18`,
                                color:      g.action === "found" ? C.blue       : g.action === "created" ? C.green       : C.amber,
                                border: `1px solid ${g.action === "found" ? `${C.blue}40` : g.action === "created" ? `${C.green}40` : `${C.amber}40`}`,
                              }}>
                                {g.action === "found" ? t.wallets.found : g.action === "created" ? t.wallets.created2 : t.wallets.skipped2}
                              </span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text2 }}>{g.phone}</div>
                              {g.walletId && <div style={{ fontSize: 10, color: C.text3 }}>{g.walletId}</div>}
                            </div>
                            <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                              <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text1 }}>{g.txCount} tx</div>
                              <div style={{ fontSize: 10, color: C.text3 }}>{formatNumber(g.totalAmount)} {g.currency}</div>
                            </div>
                            {g.inserted > 0 && (
                              <div style={{ fontSize: 10, fontFamily: C.mono, color: C.green, minWidth: 40, textAlign: "right" as const }}>+{g.inserted}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Erreurs */}
                  {bulkReport.errors.length > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 10, fontFamily: C.mono, color: C.red, cursor: "pointer" }}>{bulkReport.errors.length} {t.wallets.parsingErrors}</summary>
                      <div style={{ maxHeight: 80, overflowY: "auto" as const, marginTop: 4 }}>
                        {bulkReport.errors.slice(0, 15).map((e, i) => (
                          <div key={i} style={{ fontSize: 10, fontFamily: C.mono, color: C.red, padding: "1px 0" }}>L.{e.line}: {e.error}</div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {bulkImportMutation.error && (
                <p style={{ fontSize: 11, color: C.red, fontFamily: C.mono, margin: "0 0 12px" }}>{bulkImportMutation.error.message}</p>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowBulkImport(false)} style={{ flex: 1, padding: "9px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text2, background: "transparent", cursor: "pointer" }}>{t.common.close}</button>
                <button
                  disabled={!bulkContent || bulkImportMutation.isPending}
                  onClick={() => bulkImportMutation.mutate({ content: bulkContent, provider: bulkProvider, dryRun: bulkDryRun })}
                  style={{ flex: 2, padding: "9px 0", fontSize: 12, fontFamily: C.mono, background: `${C.gold}14`, border: `1px solid ${C.gold}40`, borderRadius: 8, color: C.gold, cursor: "pointer", opacity: !bulkContent ? 0.4 : 1 }}>
                  {bulkImportMutation.isPending ? t.wallets.analyzing : bulkDryRun ? t.wallets.analyzeFile : t.wallets.importAll}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* MODAL — Import transactions                                         */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {importTarget && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div role="dialog" aria-modal="true" aria-label={t.wallets.importTransactions} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 26, width: 560, maxHeight: "85vh", overflowY: "auto" as const }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text1, margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
                  <Upload size={14} style={{ color: C.gold }} /> {t.wallets.importTransactions}
                </h3>
                <button onClick={() => setImportTarget(null)} aria-label={t.common.close} style={{ background: "none", border: "none", color: C.text3, cursor: "pointer" }}><X size={16} /></button>
              </div>
              <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 16px" }}>
                {t.wallets.wallet} : <span style={{ color: C.blue }}>{importTarget.walletId}</span> — {importTarget.provider}
              </p>

              {/* Drop zone */}
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${importContent ? C.green : C.border2}`, borderRadius: 10, padding: "28px 20px",
                  textAlign: "center" as const, cursor: "pointer", marginBottom: 14,
                  background: importContent ? "rgba(52,211,153,0.04)" : "transparent",
                  transition: "all 0.2s",
                }}
              >
                <Upload size={24} style={{ color: importContent ? C.green : C.text3, margin: "0 auto 8px" }} />
                {importContent
                  ? <p style={{ fontSize: 12, color: C.green, fontFamily: C.mono, margin: 0 }}>{importFileName} — {importContent.split("\n").length} {t.wallets.lines.toLowerCase()}</p>
                  : <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>{t.wallets.dropFile}</p>}
                <input ref={fileInputRef} type="file" accept=".csv,.txt,.sta,.mt940" onChange={handleFilePick} style={{ display: "none" }} />
              </div>

              {/* Formats acceptés */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" as const }}>
                {["CSV générique", "Orange Money CSV", "Wave CSV", "SWIFT MT940"].map(f => (
                  <span key={f} style={{ fontSize: 10, fontFamily: C.mono, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border2}`, color: C.text3 }}>{f}</span>
                ))}
              </div>

              {/* Options */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text2, cursor: "pointer", marginBottom: 16 }}>
                <input type="checkbox" checked={importDryRun} onChange={e => setImportDryRun(e.target.checked)} />
                {t.wallets.dryRun} — {t.wallets.dryRunAnalyze}
              </label>

              {/* Rapport */}
              {importReport && (
                <div style={{ background: C.hover, borderRadius: 8, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontFamily: C.mono, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 10 }}>{t.wallets.importReport}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                    {[
                      { label: t.wallets.detected,   val: importReport.total,      color: C.text2 },
                      { label: t.wallets.parsed,     val: importReport.parsed,     color: C.blue  },
                      { label: t.wallets.inserted,   val: importReport.inserted,   color: C.green },
                      { label: t.wallets.duplicates, val: importReport.duplicates, color: C.amber },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: "center" as const }}>
                        <div style={{ fontSize: 18, fontFamily: C.mono, fontWeight: 700, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: 9, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {importReport.sampleRows.length > 0 && (
                    <>
                      <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, marginBottom: 6 }}>{t.wallets.preview}</div>
                      {importReport.sampleRows.map((r, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, fontSize: 10, fontFamily: C.mono, color: C.text2, padding: "4px 0", borderTop: `1px solid ${C.border}` }}>
                          <span style={{ color: C.text3, minWidth: 80 }}>{r.date}</span>
                          <span style={{ minWidth: 100 }}>{r.amount}</span>
                          <span style={{ color: C.blue }}>{r.type}</span>
                          {r.counterparty && <span style={{ color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{r.counterparty}</span>}
                        </div>
                      ))}
                    </>
                  )}
                  {importReport.errors.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: 10, fontFamily: C.mono, color: C.red, cursor: "pointer" }}>{importReport.errors.length} {t.wallets.parsingErrors}</summary>
                      <div style={{ maxHeight: 100, overflowY: "auto" as const, marginTop: 4 }}>
                        {importReport.errors.slice(0, 20).map((e, i) => (
                          <div key={i} style={{ fontSize: 10, fontFamily: C.mono, color: C.red, padding: "2px 0" }}>L.{e.line}: {e.error}</div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {importMutation.error && <p style={{ fontSize: 11, color: C.red, margin: "0 0 8px" }}>{importMutation.error.message}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setImportTarget(null)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}>{t.common.close}</button>
                <button
                  disabled={!importContent || importMutation.isPending}
                  onClick={() => importMutation.mutate({
                    walletId:   importTarget.id,
                    customerId: importTarget.customerId,
                    content:    importContent,
                    dryRun:     importDryRun,
                  })}
                  style={{ flex: 2, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.gold}14`, border: `1px solid ${C.gold}40`, borderRadius: 7, color: C.gold, cursor: "pointer", opacity: !importContent ? 0.4 : 1 }}>
                  {importMutation.isPending ? t.wallets.importing : importDryRun ? t.wallets.analyzeOnly : t.wallets.importTx}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* MODAL — Détail wallet (onglets)                                     */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {detailId && walletDetail && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div role="dialog" aria-modal="true" aria-label={t.wallets.detail} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, width: 560, maxHeight: "85vh", overflowY: "auto" as const }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 4px" }}>{walletDetail.walletId}</h3>
                  <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
                    Client #{walletDetail.customerId} — {walletDetail.provider}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <TierBadge tier={walletDetail.kycTier} />
                  <button onClick={() => setDetailId(null)} aria-label={t.common.close} style={{ background: "none", border: "none", color: C.text3, cursor: "pointer" }}><X size={16} /></button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 2, marginBottom: 18, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
                {([
                  { id: "info" as const,         label: t.wallets.infoTab },
                  { id: "usage" as const,        label: t.wallets.usageTab },
                  { id: "transactions" as const, label: t.wallets.transactionsTab },
                  { id: "history" as const,      label: t.wallets.historyTab },
                ] as const).map(tab => (
                  <button key={tab.id} onClick={() => setDetailTab(tab.id)}
                    style={{
                      fontSize: 11, fontFamily: C.mono, padding: "6px 12px", borderRadius: "6px 6px 0 0",
                      border: `1px solid ${detailTab === tab.id ? C.border : "transparent"}`,
                      borderBottom: detailTab === tab.id ? "1px solid var(--wr-card)" : "none",
                      background: detailTab === tab.id ? C.surface : "transparent",
                      color: detailTab === tab.id ? C.text1 : C.text3,
                      cursor: "pointer", marginBottom: -1,
                    }}>
                    {tab.label}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button onClick={handleExport} disabled={isExporting}
                  style={{ fontSize: 10, fontFamily: C.mono, padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: "transparent", color: C.blue, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                  <Download size={10} /> {isExporting ? "…" : "CSV"}
                </button>
              </div>

              {/* Tab: Info */}
              {detailTab === "info" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { label: t.wallets.balance,   value: `${formatNumber(Number(walletDetail.balance))} ${walletDetail.currency}` },
                    { label: t.wallets.status,    value: walletDetail.isDormant ? "DORMANT" : walletDetail.isActive ? "ACTIF" : t.wallets.suspended },
                    { label: t.wallets.tier,      value: walletDetail.kycTier },
                    { label: t.wallets.provider,  value: walletDetail.provider },
                    { label: t.wallets.phone,     value: (walletDetail.phoneNumber ?? "—") as string },
                    { label: t.wallets.createdAt, value: formatRelative(walletDetail.createdAt) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: C.hover, borderRadius: 6, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text1 }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab: Usage / Limites */}
              {detailTab === "usage" && (
                <div>
                  {usageData ? (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <UsageBar label={t.wallets.dailyUsage}   used={usageData.dailyUsed}   limit={usageData.dailyLimit}   currency={usageData.currency} />
                        <UsageBar label={t.wallets.monthlyUsage} used={usageData.monthlyUsed} limit={usageData.monthlyLimit} currency={usageData.currency} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={{ background: C.hover, borderRadius: 6, padding: "10px 12px" }}>
                          <div style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 4 }}>{t.wallets.currentBalance}</div>
                          <div style={{ fontSize: 16, fontFamily: C.mono, fontWeight: 600, color: C.blue }}>{formatNumber(usageData.balance)} {usageData.currency}</div>
                        </div>
                        <div style={{ background: C.hover, borderRadius: 6, padding: "10px 12px" }}>
                          <div style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 4 }}>{t.wallets.tier}</div>
                          <TierBadge tier={usageData.tier} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: C.text3, fontFamily: C.mono }}>{t.common.loading}</p>
                  )}
                </div>
              )}

              {/* Tab: Transactions */}
              {detailTab === "transactions" && (
                <div>
                  {!txData ? (
                    <p style={{ fontSize: 12, color: C.text3, fontFamily: C.mono }}>{t.common.loading}</p>
                  ) : txData.data.length === 0 ? (
                    <p style={{ fontSize: 12, color: C.text3, fontFamily: C.mono }}>{t.wallets.noTransactions}</p>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                        {txData.data.map((tx: {
                          id: number; transactionId: string; transactionType: string; channel: string;
                          amount: string; currency: string; counterparty: string | null; status: string;
                          riskScore: number; transactionDate: Date; isSuspicious: boolean;
                        }) => (
                          <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: C.hover, borderRadius: 7, border: tx.isSuspicious ? "1px solid rgba(248,113,113,0.2)" : "1px solid transparent" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontFamily: C.mono, color: C.blue }}>{tx.transactionId}</div>
                              <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>
                                {tx.transactionType} · {tx.channel}
                                {tx.counterparty && ` · ${tx.counterparty}`}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" as const }}>
                              <div style={{ fontSize: 12, fontFamily: C.mono, fontWeight: 600, color: tx.isSuspicious ? C.red : C.text1 }}>
                                {formatNumber(Number(tx.amount))} {tx.currency}
                              </div>
                              <div style={{ fontSize: 10, color: C.text3 }}>{formatDate(tx.transactionDate)}</div>
                            </div>
                            <div style={{ width: 32, textAlign: "center" as const }}>
                              {tx.riskScore > 0 && (
                                <span style={{ fontSize: 9, fontFamily: C.mono, padding: "1px 5px", borderRadius: 4, background: tx.riskScore >= 70 ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.12)", color: tx.riskScore >= 70 ? C.red : C.amber }}>
                                  {tx.riskScore}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Pagination mini */}
                      {txData.totalPages > 1 && (
                        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
                          <button disabled={txPage === 1} onClick={() => setTxPage(p => p - 1)}
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: "transparent", color: C.text2, cursor: txPage === 1 ? "default" : "pointer", opacity: txPage === 1 ? 0.4 : 1 }}>{"\u2190"}</button>
                          <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, padding: "4px 0" }}>{txPage}/{txData.totalPages}</span>
                          <button disabled={txPage >= txData.totalPages} onClick={() => setTxPage(p => p + 1)}
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: "transparent", color: C.text2, cursor: txPage >= txData.totalPages ? "default" : "pointer", opacity: txPage >= txData.totalPages ? 0.4 : 1 }}>{"\u2192"}</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Tab: Historique tiers */}
              {detailTab === "history" && (
                <div>
                  {!tierHistoryData || tierHistoryData.length === 0 ? (
                    <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3 }}>{t.wallets.noTierChanges}</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                      {tierHistoryData.map((h: { id: number; previousTier: string | null; newTier: string; reason: string | null; createdAt: Date }) => (
                        <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: C.hover, borderRadius: 6 }}>
                          <ChevronRight size={12} style={{ color: C.gold, flexShrink: 0 }} />
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
              )}

            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
