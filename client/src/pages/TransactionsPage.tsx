import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatAmount, formatRelative, formatNumber } from "../lib/utils";
import { ShieldAlert, Search, X, Wallet, Plus, Upload, Eye } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { useI18n } from "../hooks/useI18n";
import { useInstitution } from "../context/InstitutionContext";

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
  serif:   "var(--wr-font-serif)",
  hover:   "var(--wr-hover)",
};

type Tx = {
  id: number; transactionId: string; customerId: number;
  amount: string; currency: string; transactionType: string;
  channel: string; status: string; isSuspicious: boolean;
  riskScore: number; counterpartyCountry: string | null;
  transactionDate: Date; createdAt: Date;
};

const _MOBILE_TX_TYPES = [
  "AGENT_CASH_IN", "AGENT_CASH_OUT", "MOBILE_MONEY_IN", "MOBILE_MONEY_OUT",
  "P2P_TRANSFER", "MERCHANT_PAYMENT", "BILL_PAYMENT", "BULK_DISBURSEMENT",
] as const;

export function TransactionsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const flags = useInstitution();
  const [page, setPage]         = useState(1);
  const [status, setStatus]     = useState<string>("");
  const [suspicious, setSuspicious] = useState<string>("");
  const [txType, setTxType]     = useState<string>("");
  const [search, setSearch]     = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo]     = useState<string>("");
  const [blockTarget, setBlockTarget] = useState<Tx | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    customerId: "", amount: "", currency: "EUR", transactionType: "TRANSFER",
    channel: "ONLINE", counterparty: "", counterpartyCountry: "", purpose: "",
  });
  const [showImport, setShowImport] = useState(false);
  const [importCustomerId, setImportCustomerId] = useState("");
  const [importContent, setImportContent] = useState("");
  const [importDryRun, setImportDryRun] = useState(true);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.transactions.list.useQuery({
    page, limit: 20,
    ...(status    ? { status: status as "PENDING" | "COMPLETED" | "FLAGGED" | "BLOCKED" | "REVERSED" } : {}),
    ...(suspicious === "true"  ? { isSuspicious: true  } : {}),
    ...(suspicious === "false" ? { isSuspicious: false } : {}),
    ...(txType    ? { transactionType: txType as typeof _MOBILE_TX_TYPES[number] } : {}),
    ...(search    ? { search } : {}),
    ...(dateFrom  ? { dateFrom: new Date(dateFrom).toISOString() } : {}),
    ...(dateTo    ? { dateTo:   new Date(dateTo + "T23:59:59").toISOString() } : {}),
  }, { placeholderData: keepPreviousData });

  const blockMutation = trpc.transactions.block.useMutation({
    onSuccess: () => { utils.transactions.list.invalidate(); setBlockTarget(null); setBlockReason(""); },
  });
  const createMutation = trpc.transactions.create.useMutation({
    onSuccess: () => { utils.transactions.list.invalidate(); setShowCreate(false); setCreateForm({ customerId: "", amount: "", currency: "EUR", transactionType: "TRANSFER", channel: "ONLINE", counterparty: "", counterpartyCountry: "", purpose: "" }); },
  });
  const importMutation = trpc.transactions.importFile.useMutation({
    onSuccess: () => { if (!importDryRun) { utils.transactions.list.invalidate(); setShowImport(false); setImportContent(""); setImportCustomerId(""); } },
  });

  const { data: txStats } = trpc.transactions.stats.useQuery();

  const completeMutation = trpc.transactions.complete.useMutation({
    onSuccess: () => { void utils.transactions.list.invalidate(); },
  });

  const { data: txDetail } = trpc.transactions.getById.useQuery(
    { id: detailId ?? 0 },
    { enabled: !!detailId }
  );

  const canBlock = hasRole(user, "supervisor");
  const canCreate = hasRole(user, "analyst");
  const canImport = hasRole(user, "supervisor");

  const COLUMNS: Column<Tx>[] = [
    {
      key: "id", header: t.transactions.txRef, width: "w-40",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {r.isSuspicious && <ShieldAlert size={11} style={{ color: C.red, flexShrink: 0 }} />}
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.blue }}>{r.transactionId}</span>
        </div>
      ),
    },
    {
      key: "amount", header: t.transactions.amount,
      render: (r) => (
        <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 500, color: r.isSuspicious ? C.amber : C.text1 }}>
          {formatAmount(r.amount, r.currency)}
        </span>
      ),
    },
    {
      key: "type", header: t.transactions.type, width: "w-28",
      render: (r) => <Badge label={r.transactionType} />,
    },
    {
      key: "channel", header: t.transactions.channel, width: "w-32",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>{r.channel}</span>
          {flags.wallets && (r as Tx & { walletId?: number | null }).walletId && (
            <Wallet size={11} style={{ color: C.blue, opacity: 0.7 }} />
          )}
        </div>
      ),
    },
    {
      key: "country", header: t.transactions.countryAccount, width: "w-24",
      render: (r) => r.counterpartyCountry
        ? <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>{r.counterpartyCountry}</span>
        : <span style={{ color: C.text4 }}>—</span>,
    },
    {
      key: "status", header: t.common.status, width: "w-32",
      render: (r) => <Badge label={r.status} variant="status" />,
    },
    {
      key: "score", header: t.transactions.scoreLabel, width: "w-16",
      render: (r) => r.riskScore > 0
        ? <span style={{ fontFamily: C.mono, fontSize: 12, color: C.red }}>{r.riskScore}</span>
        : <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text4 }}>—</span>,
    },
    {
      key: "date", header: t.common.date, width: "w-28",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text3 }}>{formatRelative(r.transactionDate)}</span>,
    },
    {
      key: "actions", header: "", width: "w-28",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDetailId(r.id); }}
            style={{ padding: 5, background: "none", border: `1px solid ${C.border2}`, borderRadius: 5, cursor: "pointer", color: C.text3, display: "flex", alignItems: "center" }}
            title="Détail"
          >
            <Eye size={11} />
          </button>
          {canBlock && r.status !== "BLOCKED" && r.status !== "REVERSED" && (
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setBlockTarget(r); }}
              style={{ fontSize: 11, fontFamily: C.mono, color: C.red, background: "none", border: "none", cursor: "pointer", padding: 0, opacity: 0.7 }}
            >
              {t.transactions.block}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>{t.transactions.title}</h1>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {data ? t.transactions.subtitle.replace("{count}", formatNumber(data.total)) : "—"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {canImport && (
            <button
              onClick={() => setShowImport(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `${C.amber}14`, border: `1px solid ${C.amber}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.amber, cursor: "pointer" }}
            >
              <Upload size={13} /> Import CSV
            </button>
          )}
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer" }}
            >
              <Plus size={13} /> Nouvelle transaction
            </button>
          )}
        </div>
      </div>

      {/* KPI stats */}
      {txStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
          {([
            { label: "Total transactions", value: txStats.total,       color: C.text1 },
            { label: "Suspectes",          value: txStats.suspicious,  color: C.red   },
            { label: "Aujourd'hui",        value: txStats.todayCount,  color: C.blue  },
            { label: "Volume aujourd'hui", value: txStats.todayVolume.toLocaleString("fr-MA", { maximumFractionDigits: 0 }), color: C.green },
            { label: "Bloquées",           value: txStats.byStatus["BLOCKED"] ?? 0, color: C.amber },
          ] as const).map(({ label, value, color }) => (
            <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 18, fontWeight: 500, fontFamily: C.mono, color }}>{value}</div>
              <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 16 }}>
        {/* Recherche texte */}
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.text4, pointerEvents: "none" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t.transactions.searchPlaceholder ?? "Contrepartie, réf…"}
            style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, paddingTop: 7, paddingBottom: 7, paddingLeft: 30, paddingRight: 28, fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none", boxSizing: "border-box" as const }}
          />
          {search && (
            <button onClick={() => { setSearch(""); setPage(1); }} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: C.text4, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <X size={11} />
            </button>
          )}
        </div>

        {/* Statut */}
        <select
          value={status}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setStatus(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">{t.common.all}</option>
          <option value="PENDING">{t.transactions.statusPending}</option>
          <option value="COMPLETED">{t.transactions.statusCompleted}</option>
          <option value="FLAGGED">{t.transactions.statusFlagged}</option>
          <option value="BLOCKED">{t.transactions.statusBlocked}</option>
        </select>

        {/* Suspicion */}
        <select
          value={suspicious}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setSuspicious(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">{t.common.all}</option>
          <option value="true">{t.transactions.filterFlagged}</option>
          <option value="false">{t.transactions.flagged}</option>
        </select>

        {/* Type de transaction (inclut types mobiles si flag actif) */}
        <select
          value={txType}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setTxType(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">Tous types</option>
          <option value="TRANSFER">TRANSFER</option>
          <option value="DEPOSIT">DEPOSIT</option>
          <option value="WITHDRAWAL">WITHDRAWAL</option>
          <option value="PAYMENT">PAYMENT</option>
          <option value="EXCHANGE">EXCHANGE</option>
          {flags.mobileTransactionTypes && <>
            <option value="AGENT_CASH_IN">AGENT_CASH_IN</option>
            <option value="AGENT_CASH_OUT">AGENT_CASH_OUT</option>
            <option value="MOBILE_MONEY_IN">MOBILE_MONEY_IN</option>
            <option value="MOBILE_MONEY_OUT">MOBILE_MONEY_OUT</option>
            <option value="P2P_TRANSFER">P2P_TRANSFER</option>
            <option value="MERCHANT_PAYMENT">MERCHANT_PAYMENT</option>
            <option value="BILL_PAYMENT">BILL_PAYMENT</option>
            <option value="BULK_DISBURSEMENT">BULK_DISBURSEMENT</option>
          </>}
        </select>

        {/* Période */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
          title={t.common.dateFrom ?? "Du"}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
          title={t.common.dateTo ?? "Au"}
        />

        {/* Réinitialiser */}
        {(search || status || suspicious || txType || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(""); setStatus(""); setSuspicious(""); setTxType(""); setDateFrom(""); setDateTo(""); setPage(1); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.text2, cursor: "pointer" }}
          >
            <X size={11} /> {t.common.reset ?? "Réinitialiser"}
          </button>
        )}
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <DataTable
          columns={COLUMNS}
          data={(data?.data ?? []) as Tx[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          total={data?.total}
          page={page}
          limit={20}
          onPageChange={setPage}
          emptyMessage={t.common.noResults}
        />
      </div>

      {/* Modal création transaction */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 500 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 16px" }}>Nouvelle transaction</h3>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: C.text3, marginBottom: 5, display: "block" }}>Client ID *</label>
                  <input type="number" value={createForm.customerId} onChange={e => setCreateForm(f => ({ ...f, customerId: e.target.value }))} placeholder="123" style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" as const }} />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: C.text3, marginBottom: 5, display: "block" }}>Montant *</label>
                  <input type="text" value={createForm.amount} onChange={e => setCreateForm(f => ({ ...f, amount: e.target.value }))} placeholder="1500.00" style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" as const }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: C.text3, marginBottom: 5, display: "block" }}>Devise</label>
                  <select value={createForm.currency} onChange={e => setCreateForm(f => ({ ...f, currency: e.target.value }))} style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: C.mono, color: C.text2, outline: "none", boxSizing: "border-box" as const }}>
                    {["EUR", "MAD", "USD", "GBP", "XOF"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: C.text3, marginBottom: 5, display: "block" }}>Type</label>
                  <select value={createForm.transactionType} onChange={e => setCreateForm(f => ({ ...f, transactionType: e.target.value }))} style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: C.mono, color: C.text2, outline: "none", boxSizing: "border-box" as const }}>
                    {["TRANSFER", "DEPOSIT", "WITHDRAWAL", "PAYMENT", "EXCHANGE"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: C.text3, marginBottom: 5, display: "block" }}>Canal</label>
                  <select value={createForm.channel} onChange={e => setCreateForm(f => ({ ...f, channel: e.target.value }))} style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: C.mono, color: C.text2, outline: "none", boxSizing: "border-box" as const }}>
                    {["ONLINE", "ATM", "BRANCH", "MOBILE", "API"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: C.text3, marginBottom: 5, display: "block" }}>Contrepartie</label>
                  <input value={createForm.counterparty} onChange={e => setCreateForm(f => ({ ...f, counterparty: e.target.value }))} placeholder="Nom ou IBAN" style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" as const }} />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: C.text3, marginBottom: 5, display: "block" }}>Pays contrepartie</label>
                  <input value={createForm.counterpartyCountry} onChange={e => setCreateForm(f => ({ ...f, counterpartyCountry: e.target.value }))} placeholder="FR, MA, US…" maxLength={2} style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" as const }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: C.text3, marginBottom: 5, display: "block" }}>Objet</label>
                <input value={createForm.purpose} onChange={e => setCreateForm(f => ({ ...f, purpose: e.target.value }))} placeholder="Motif du virement…" style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" as const }} />
              </div>
            </div>
            {createMutation.error && <p style={{ marginTop: 10, fontSize: 11, fontFamily: C.mono, color: C.red }}>{createMutation.error.message}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}>
                Annuler
              </button>
              <button
                disabled={!createForm.customerId || !createForm.amount || createMutation.isPending}
                onClick={() => createMutation.mutate({
                  customerId: parseInt(createForm.customerId),
                  amount: createForm.amount,
                  currency: createForm.currency,
                  transactionType: createForm.transactionType as "TRANSFER" | "DEPOSIT" | "WITHDRAWAL" | "PAYMENT" | "EXCHANGE",
                  channel: createForm.channel as "ONLINE" | "ATM" | "BRANCH" | "MOBILE" | "API",
                  ...(createForm.counterparty ? { counterparty: createForm.counterparty } : {}),
                  ...(createForm.counterpartyCountry ? { counterpartyCountry: createForm.counterpartyCountry } : {}),
                  ...(createForm.purpose ? { purpose: createForm.purpose } : {}),
                })}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: (!createForm.customerId || !createForm.amount || createMutation.isPending) ? 0.4 : 1 }}
              >
                {createMutation.isPending ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal import CSV */}
      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 560 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 4px" }}>Import CSV / MT940</h3>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 16px" }}>Coller le contenu du fichier CSV ou MT940 ci-dessous.</p>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
              <div>
                <label style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: C.text3, marginBottom: 5, display: "block" }}>Client ID *</label>
                <input type="number" value={importCustomerId} onChange={e => setImportCustomerId(e.target.value)} placeholder="123" style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <label style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: C.text3, marginBottom: 5, display: "block" }}>Contenu fichier</label>
                <textarea
                  value={importContent}
                  onChange={e => setImportContent(e.target.value)}
                  rows={8}
                  placeholder={"date,amount,currency,type,counterparty\n2024-01-15,1500.00,EUR,TRANSFER,JOHN DOE\n..."}
                  style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 11, fontFamily: C.mono, color: C.text1, outline: "none", resize: "vertical" as const, boxSizing: "border-box" as const }}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: C.mono, color: C.text2, cursor: "pointer" }}>
                <input type="checkbox" checked={importDryRun} onChange={e => setImportDryRun(e.target.checked)} />
                Simulation (dry-run) — parse sans insérer
              </label>
            </div>

            {importMutation.error && <p style={{ marginTop: 10, fontSize: 11, fontFamily: C.mono, color: C.red }}>{importMutation.error.message}</p>}

            {importMutation.data && (
              <div style={{ marginTop: 12, background: importMutation.data.success ? `${C.green}10` : `${C.amber}10`, border: `1px solid ${importMutation.data.success ? C.green : C.amber}30`, borderRadius: 6, padding: "10px 12px" }}>
                <p style={{ fontSize: 11, fontFamily: C.mono, color: importMutation.data.success ? C.green : C.amber, margin: 0 }}>
                  {importMutation.data.success
                    ? `${importDryRun ? "Simulation OK" : "Import OK"} — ${importMutation.data.inserted} transaction(s)`
                    : `Format non reconnu`
                  }
                </p>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => { setShowImport(false); importMutation.reset?.(); setImportContent(""); setImportCustomerId(""); }} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}>
                Fermer
              </button>
              <button
                disabled={!importCustomerId || !importContent || importMutation.isPending}
                onClick={() => importMutation.mutate({ customerId: parseInt(importCustomerId), content: importContent, dryRun: importDryRun })}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.amber}14`, border: `1px solid ${C.amber}40`, borderRadius: 7, color: C.amber, cursor: "pointer", opacity: (!importCustomerId || !importContent || importMutation.isPending) ? 0.4 : 1 }}
              >
                {importMutation.isPending ? "Traitement…" : importDryRun ? "Simuler" : "Importer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal blocage */}
      {blockTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.red}40`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 380 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <ShieldAlert size={16} style={{ color: C.red }} />
              <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: 0 }}>{t.transactions.blockTitle}</h3>
            </div>
            <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: "0 0 16px" }}>
              {blockTarget.transactionId} — {formatAmount(blockTarget.amount, blockTarget.currency)}
            </p>
            <label style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 6, display: "block" }}>
              {t.transactions.blockReason}
            </label>
            <textarea
              value={blockReason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBlockReason(e.target.value)}
              rows={3}
              style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", resize: "none" as const, boxSizing: "border-box" as const, marginBottom: 16 }}
              placeholder={t.transactions.blockReasonPh}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setBlockTarget(null); setBlockReason(""); }}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}
              >
                {t.common.cancel}
              </button>
              <button
                disabled={blockReason.length < 10 || blockMutation.isPending}
                onClick={() => blockMutation.mutate({ id: blockTarget.id, reason: blockReason })}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.red}14`, border: `1px solid ${C.red}40`, borderRadius: 7, color: C.red, cursor: "pointer", opacity: (blockReason.length < 10 || blockMutation.isPending) ? 0.4 : 1 }}
              >
                {blockMutation.isPending ? t.common.loading : t.transactions.confirmBlock}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Modal détail transaction ── */}
      {detailId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={() => setDetailId(null)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", padding: 24 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 400, fontFamily: C.serif, color: C.text1, margin: "0 0 2px" }}>Détail transaction</h2>
                {txDetail && <p style={{ fontSize: 11, fontFamily: C.mono, color: C.blue, margin: 0 }}>{txDetail.transactionId}</p>}
              </div>
              <button onClick={() => setDetailId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.text3, padding: 4 }}><X size={16} /></button>
            </div>

            {!txDetail ? (
              <div style={{ textAlign: "center", padding: "40px 0", fontSize: 11, fontFamily: C.mono, color: C.text4 }}>Chargement…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Statut + badges */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 10px", borderRadius: 5, background: `${C.blue}14`, border: `1px solid ${C.blue}30`, color: C.blue }}>{txDetail.transactionType}</span>
                  <span style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 10px", borderRadius: 5, background: C.hover, border: `1px solid ${C.border2}`, color: C.text2 }}>{txDetail.status}</span>
                  <span style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 10px", borderRadius: 5, background: C.hover, border: `1px solid ${C.border2}`, color: C.text3 }}>{txDetail.channel}</span>
                  {txDetail.isSuspicious && (
                    <span style={{ fontSize: 10, fontFamily: C.mono, padding: "3px 10px", borderRadius: 5, background: `${C.red}14`, border: `1px solid ${C.red}30`, color: C.red, display: "flex", alignItems: "center", gap: 4 }}>
                      <ShieldAlert size={10} /> Suspect
                    </span>
                  )}
                  {txDetail.status === "PENDING" && canBlock && (
                    <button
                      disabled={completeMutation.isPending}
                      onClick={() => completeMutation.mutate({ id: txDetail.id })}
                      style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 5, fontSize: 10, fontFamily: C.mono, background: `${C.green}14`, border: `1px solid ${C.green}30`, color: C.green, cursor: "pointer", opacity: completeMutation.isPending ? 0.6 : 1 }}
                    >
                      {completeMutation.isPending ? "…" : "Compléter"}
                    </button>
                  )}
                </div>

                {/* Montant */}
                <div style={{ background: C.hover, borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontFamily: C.mono, fontWeight: 600, color: txDetail.isSuspicious ? C.amber : C.text1 }}>
                    {formatAmount(txDetail.amount, txDetail.currency)}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, marginTop: 4 }}>
                    Score risque : <span style={{ color: txDetail.riskScore > 60 ? C.red : C.text3 }}>{txDetail.riskScore}/100</span>
                  </div>
                </div>

                {/* Grille détails */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
                  {([
                    ["Client ID",          String(txDetail.customerId)],
                    ["Date transaction",   new Date(txDetail.transactionDate).toLocaleString("fr-MA")],
                    ["Contrepartie",       txDetail.counterparty ?? "—"],
                    ["Pays contrepartie",  txDetail.counterpartyCountry ?? "—"],
                    ["Banque contrepartie",txDetail.counterpartyBank ?? "—"],
                    ["Objet",              txDetail.purpose ?? "—"],
                    ["Wallet ID",          txDetail.walletId ? String(txDetail.walletId) : "—"],
                    ["Agent ID",           txDetail.agentId  ? String(txDetail.agentId)  : "—"],
                    ["Créé le",            new Date(txDetail.createdAt).toLocaleString("fr-MA")],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: 9, fontFamily: C.mono, color: C.text4, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 12, fontFamily: C.mono, color: C.text1 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Raison de blocage */}
                {txDetail.flagReason && (
                  <div style={{ background: `${C.red}08`, border: `1px solid ${C.red}20`, borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 9, fontFamily: C.mono, color: C.red, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>Raison de signalement</div>
                    <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text2 }}>{txDetail.flagReason}</div>
                  </div>
                )}

                {/* Règles AML déclenchées */}
                {Array.isArray(txDetail.riskRules) && txDetail.riskRules.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, fontFamily: C.mono, color: C.text4, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>Règles AML déclenchées</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(txDetail.riskRules as Record<string, unknown>[]).map((rule, i) => (
                        <div key={i} style={{ background: `${C.amber}08`, border: `1px solid ${C.amber}20`, borderRadius: 6, padding: "6px 12px", fontSize: 11, fontFamily: C.mono, color: C.amber }}>
                          {String(rule.name ?? rule.id ?? JSON.stringify(rule))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
