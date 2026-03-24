import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatAmount, formatRelative, formatNumber } from "../lib/utils";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";

type Tx = {
  id: number; transactionId: string; customerId: number;
  amount: string; currency: string; transactionType: string;
  channel: string; status: string; isSuspicious: boolean;
  riskScore: number; counterpartyCountry: string | null;
  transactionDate: Date; createdAt: Date;
};

export function TransactionsPage() {
  const { user } = useAuth();
  const [page, setPage]     = useState(1);
  const [status, setStatus] = useState<string>("");
  const [suspicious, setSuspicious] = useState<string>("");
  const [blockTarget, setBlockTarget] = useState<Tx | null>(null);
  const [blockReason, setBlockReason] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.transactions.list.useQuery({
    page, limit: 20,
    ...(status    ? { status:        status === "FLAGGED" ? "FLAGGED" : status as "PENDING" | "COMPLETED" | "FLAGGED" | "BLOCKED" | "REVERSED" } : {}),
    ...(suspicious === "true"  ? { isSuspicious: true  } : {}),
    ...(suspicious === "false" ? { isSuspicious: false } : {}),
  }, { placeholderData: keepPreviousData });

  const blockMutation = trpc.transactions.block.useMutation({
    onSuccess: () => { utils.transactions.list.invalidate(); setBlockTarget(null); setBlockReason(""); },
  });

  const canBlock = hasRole(user, "supervisor");

  const COLUMNS: Column<Tx>[] = [
    {
      key: "id", header: "ID Transaction", width: "w-40",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          {r.isSuspicious && <ShieldAlert size={11} className="text-red-400 flex-shrink-0" />}
          <span className="font-mono text-xs text-[#58a6ff]">{r.transactionId}</span>
        </div>
      ),
    },
    {
      key: "amount", header: "Montant",
      render: (r) => (
        <span className={`font-mono text-sm font-medium ${r.isSuspicious ? "text-amber-400" : "text-[#e6edf3]"}`}>
          {formatAmount(r.amount, r.currency)}
        </span>
      ),
    },
    {
      key: "type", header: "Type", width: "w-28",
      render: (r) => <Badge label={r.transactionType} />,
    },
    {
      key: "channel", header: "Canal", width: "w-24",
      render: (r) => <span className="font-mono text-xs text-[#7d8590]">{r.channel}</span>,
    },
    {
      key: "country", header: "Pays cpte", width: "w-24",
      render: (r) => r.counterpartyCountry
        ? <span className="font-mono text-xs text-[#7d8590]">{r.counterpartyCountry}</span>
        : <span className="text-[#484f58]">—</span>,
    },
    {
      key: "status", header: "Statut", width: "w-32",
      render: (r) => <Badge label={r.status} variant="status" />,
    },
    {
      key: "score", header: "Score", width: "w-16",
      render: (r) => r.riskScore > 0
        ? <span className="font-mono text-xs text-red-400">{r.riskScore}</span>
        : <span className="font-mono text-xs text-[#484f58]">—</span>,
    },
    {
      key: "date", header: "Date", width: "w-28",
      render: (r) => <span className="font-mono text-[10px] text-[#7d8590]">{formatRelative(r.transactionDate)}</span>,
    },
    {
      key: "actions", header: "", width: "w-20",
      render: (r) => canBlock && r.status !== "BLOCKED" && r.status !== "REVERSED" ? (
        <button
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setBlockTarget(r); }}
          className="text-[11px] font-mono text-red-400/70 hover:text-red-400 hover:underline"
        >
          Bloquer
        </button>
      ) : null,
    },
  ];

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">Transactions</h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            {data ? formatNumber(data.total) : "—"} transactions
          </p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <select
          value={status}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setStatus(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">Tous les statuts</option>
          <option value="PENDING">En attente</option>
          <option value="COMPLETED">Complété</option>
          <option value="FLAGGED">Signalé</option>
          <option value="BLOCKED">Bloqué</option>
        </select>
        <select
          value={suspicious}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setSuspicious(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">Toutes</option>
          <option value="true">Suspectes seulement</option>
          <option value="false">Non suspectes</option>
        </select>
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
          emptyMessage="Aucune transaction"
        />
      </div>

      {/* Modal blocage */}
      {blockTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[#0d1117] border border-red-400/30 rounded-xl p-6 w-full max-w-sm animate-slide-in">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert size={16} className="text-red-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">Bloquer la transaction</h3>
            </div>
            <p className="text-xs font-mono text-[#7d8590] mb-4">
              {blockTarget.transactionId} — {formatAmount(blockTarget.amount, blockTarget.currency)}
            </p>
            <label className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase block mb-1.5">
              Raison (obligatoire, min 10 caractères)
            </label>
            <textarea
              value={blockReason}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setBlockReason(e.target.value)}
              rows={3}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-red-400/40 resize-none mb-4"
              placeholder="Motif de blocage..."
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setBlockTarget(null); setBlockReason(""); }}
                className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] rounded-md transition-colors"
              >
                Annuler
              </button>
              <button
                disabled={blockReason.length < 10 || blockMutation.isPending}
                onClick={() => blockMutation.mutate({ id: blockTarget.id, reason: blockReason })}
                className="flex-1 py-2 text-xs font-mono bg-red-400/10 border border-red-400/30 text-red-400 hover:bg-red-400/20 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {blockMutation.isPending ? "En cours..." : "Confirmer le blocage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
