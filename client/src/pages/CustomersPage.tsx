import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatDate, formatNumber } from "../lib/utils";
import { Search } from "lucide-react";

type Customer = {
  id: number; customerId: string; firstName: string; lastName: string;
  customerType: string; kycStatus: string; riskLevel: string;
  riskScore: number; pepStatus: boolean; createdAt: Date;
  nationality: string | null;
};

const COLUMNS: Column<Customer>[] = [
  {
    key: "id", header: "ID Client", width: "w-36",
    render: (r) => <span className="font-mono text-xs text-[#58a6ff]">{r.customerId}</span>,
  },
  {
    key: "name", header: "Nom",
    render: (r) => (
      <div>
        <p className="text-sm text-[#e6edf3]">{r.firstName} {r.lastName}</p>
        <p className="text-[10px] font-mono text-[#7d8590]">{r.nationality ?? "—"}</p>
      </div>
    ),
  },
  {
    key: "type", header: "Type", width: "w-28",
    render: (r) => <Badge label={r.customerType} />,
  },
  {
    key: "kyc", header: "KYC", width: "w-32",
    render: (r) => <Badge label={r.kycStatus} variant="status" />,
  },
  {
    key: "risk", header: "Risque", width: "w-28",
    render: (r) => (
      <div className="flex items-center gap-2">
        <Badge label={r.riskLevel} variant="risk" />
        <span className="text-xs font-mono text-[#7d8590]">{r.riskScore}</span>
      </div>
    ),
  },
  {
    key: "pep", header: "PEP", width: "w-16",
    render: (r) => r.pepStatus
      ? <span className="text-[11px] font-mono text-amber-400">OUI</span>
      : <span className="text-[11px] font-mono text-[#484f58]">NON</span>,
  },
  {
    key: "date", header: "Créé le", width: "w-28",
    render: (r) => <span className="font-mono text-xs text-[#7d8590]">{formatDate(r.createdAt)}</span>,
  },
];

export function CustomersPage() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [riskLevel, setRiskLevel] = useState<string>("");
  const [kycStatus, setKycStatus] = useState<string>("");

  const { data, isLoading } = trpc.customers.list.useQuery({
    page, limit: 20,
    ...(riskLevel ? { riskLevel: riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } : {}),
    ...(kycStatus ? { kycStatus: kycStatus as "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED" } : {}),
  }, { placeholderData: keepPreviousData });

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">Clients</h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            {data ? formatNumber(data.total) : "—"} clients enregistrés
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58]" />
          <input
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setSearch(e.target.value)}
            placeholder="Rechercher un client..."
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-md pl-8 pr-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40 transition-colors"
          />
        </div>
        <select
          value={riskLevel}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setRiskLevel(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">Tous les risques</option>
          <option value="LOW">Bas</option>
          <option value="MEDIUM">Moyen</option>
          <option value="HIGH">Élevé</option>
          <option value="CRITICAL">Critique</option>
        </select>
        <select
          value={kycStatus}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setKycStatus(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">Tous les statuts KYC</option>
          <option value="PENDING">En attente</option>
          <option value="IN_REVIEW">En révision</option>
          <option value="APPROVED">Approuvé</option>
          <option value="REJECTED">Rejeté</option>
        </select>
      </div>

      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
        <DataTable
          columns={COLUMNS}
          data={(data?.data ?? []) as Customer[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          total={data?.total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onRowClick={(r) => navigate(`/customers/${r.id}`)}
          emptyMessage="Aucun client trouvé"
        />
      </div>
    </AppLayout>
  );
}
