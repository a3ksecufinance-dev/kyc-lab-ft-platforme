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
        <div className="flex items-center gap-1.5">
          {r.isSuspicious && <ShieldAlert size={11} className="text-red-400 flex-shrink-0" />}
          <span className="font-mono text-xs text-[#58a6ff]">{r.transactionId}</span>
        </div>
      ),
    },
    {
      key: "amount", header: t.transactions.amount,
      render: (r) => (
        <span className={`font-mono text-sm font-medium ${r.isSuspicious ? "text-amber-400" : "text-[#e6edf3]"}`}>
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
      render: (r) => <span className="font-mono text-xs text-[#7d8590]">{r.channel}</span>,
    },
    {
      key: "country", header: t.transactions.countryAccount, width: "w-24",
      render: (r) => r.counterpartyCountry
        ? <span className="font-mono text-xs text-[#7d8590]">{r.counterpartyCountry}</span>
        : <span className="text-[#484f58]">—</span>,
    },
    {
      key: "status", header: t.common.status, width: "w-32",
      render: (r) => <Badge label={r.status} variant="status" />,
    },
    {
      key: "score", header: t.transactions.scoreLabel, width: "w-16",
      render: (r) => r.riskScore > 0
        ? <span className="font-mono text-xs text-red-400">{r.riskScore}</span>
        : <span className="font-mono text-xs text-[#484f58]">—</span>,
    },
    {
      key: "date", header: t.common.date, width: "w-28",
      render: (r) => <span className="font-mono text-[10px] text-[#7d8590]">{formatRelative(r.transactionDate)}</span>,
    },
    {
      key: "actions", header: "", width: "w-20",
      render: (r) => canBlock && r.status !== "BLOCKED" && r.status !== "REVERSED" ? (
        <button
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setBlockTarget(r); }}
          className="text-[11px] font-mono text-red-400/70 hover:text-red-400 hover:underline"
        >
          {t.transactions.block}
        </button>
      ) : null,
    },
  ];

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">{t.transactions.title}</h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            {data ? t.transactions.subtitle.replace("{count}", formatNumber(data.total)) : "—"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {/* Recherche texte */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t.transactions.searchPlaceholder ?? "Contrepartie, réf…"}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-md pl-8 pr-8 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40"
          />
          {search && (
            <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#7d8590]">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Statut */}
        <select
          value={status}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setStatus(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
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
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
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
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
          title={t.common.dateFrom ?? "Du"}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
          title={t.common.dateTo ?? "Au"}
        />

        {/* Réinitialiser */}
        {(search || status || suspicious || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(""); setStatus(""); setSuspicious(""); setDateFrom(""); setDateTo(""); setPage(1); }}
            className="px-3 py-2 text-xs font-mono text-[#7d8590] hover:text-[#e6edf3] border border-[#30363d] rounded-md transition-colors flex items-center gap-1.5"
          >
            <X size={11} /> {t.common.reset ?? "Réinitialiser"}
          </button>
        )}
      </div>

      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[#0d1117] border border-red-400/30 rounded-xl p-6 w-full max-w-sm animate-slide-in">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert size={16} className="text-red-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">{t.transactions.blockTitle}</h3>
            </div>
            <p className="text-xs font-mono text-[#7d8590] mb-4">
              {blockTarget.transactionId} — {formatAmount(blockTarget.amount, blockTarget.currency)}
            </p>
            <label className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase block mb-1.5">
              {t.transactions.blockReason}
            </label>
            <textarea
              value={blockReason}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setBlockReason(e.target.value)}
              rows={3}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-red-400/40 resize-none mb-4"
              placeholder={t.transactions.blockReasonPh}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setBlockTarget(null); setBlockReason(""); }}
                className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] rounded-md transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                disabled={blockReason.length < 10 || blockMutation.isPending}
                onClick={() => blockMutation.mutate({ id: blockTarget.id, reason: blockReason })}
                className="flex-1 py-2 text-xs font-mono bg-red-400/10 border border-red-400/30 text-red-400 hover:bg-red-400/20 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
