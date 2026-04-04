import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatAmount, formatRelative, formatNumber } from "../lib/utils";
import { ShieldAlert, Search, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { useI18n } from "../hooks/useI18n";

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

export function TransactionsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [page, setPage]         = useState(1);
  const [status, setStatus]     = useState<string>("");
  const [suspicious, setSuspicious] = useState<string>("");
  const [search, setSearch]     = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo]     = useState<string>("");
  const [blockTarget, setBlockTarget] = useState<Tx | null>(null);
  const [blockReason, setBlockReason] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.transactions.list.useQuery({
    page, limit: 20,
    ...(status    ? { status: status as "PENDING" | "COMPLETED" | "FLAGGED" | "BLOCKED" | "REVERSED" } : {}),
    ...(suspicious === "true"  ? { isSuspicious: true  } : {}),
    ...(suspicious === "false" ? { isSuspicious: false } : {}),
    ...(search    ? { search } : {}),
    ...(dateFrom  ? { dateFrom: new Date(dateFrom).toISOString() } : {}),
    ...(dateTo    ? { dateTo:   new Date(dateTo + "T23:59:59").toISOString() } : {}),
  }, { placeholderData: keepPreviousData });

  const blockMutation = trpc.transactions.block.useMutation({
    onSuccess: () => { utils.transactions.list.invalidate(); setBlockTarget(null); setBlockReason(""); },
  });

  const canBlock = hasRole(user, "supervisor");

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
      key: "channel", header: t.transactions.channel, width: "w-24",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>{r.channel}</span>,
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
      key: "actions", header: "", width: "w-20",
      render: (r) => canBlock && r.status !== "BLOCKED" && r.status !== "REVERSED" ? (
        <button
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setBlockTarget(r); }}
          style={{ fontSize: 11, fontFamily: C.mono, color: C.red, background: "none", border: "none", cursor: "pointer", padding: 0, opacity: 0.7 }}
        >
          {t.transactions.block}
        </button>
      ) : null,
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
      </div>

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
        {(search || status || suspicious || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(""); setStatus(""); setSuspicious(""); setDateFrom(""); setDateTo(""); setPage(1); }}
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
    </AppLayout>
  );
}
