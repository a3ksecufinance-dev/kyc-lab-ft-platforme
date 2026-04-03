import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { useI18n } from "../hooks/useI18n";
import { formatDate, formatNumber } from "../lib/utils";
import { Search } from "lucide-react";

type Customer = {
  id: number; customerId: string; firstName: string; lastName: string;
  customerType: string; kycStatus: string; riskLevel: string;
  riskScore: number; pepStatus: boolean; createdAt: Date;
  nationality: string | null;
};

export function CustomersPage() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [riskLevel, setRiskLevel] = useState<string>("");
  const [kycStatus, setKycStatus] = useState<string>("");
  const { t } = useI18n();

  const { data, isLoading } = trpc.customers.list.useQuery({
    page, limit: 20,
    ...(riskLevel ? { riskLevel: riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } : {}),
    ...(kycStatus ? { kycStatus: kycStatus as "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED" } : {}),
  }, { placeholderData: keepPreviousData });

  const COLUMNS: Column<Customer>[] = [
    {
      key: "id", header: t.customers.clientId, width: "w-36",
      render: (r) => <span className="font-mono text-xs text-[#58a6ff]">{r.customerId}</span>,
    },
    {
      key: "name", header: t.customers.fullName,
      render: (r) => (
        <div>
          <p className="text-sm text-[#e6edf3]">{r.firstName} {r.lastName}</p>
          <p className="text-[10px] font-mono text-[#7d8590]">{r.nationality ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "type", header: t.customers.type, width: "w-28",
      render: (r) => <Badge label={r.customerType} />,
    },
    {
      key: "kyc", header: "KYC", width: "w-32",
      render: (r) => <Badge label={r.kycStatus} variant="status" />,
    },
    {
      key: "risk", header: t.customers.filterRisk, width: "w-28",
      render: (r) => (
        <div className="flex items-center gap-2">
          <Badge label={r.riskLevel} variant="risk" />
          <span className="text-xs font-mono text-[#7d8590]">{r.riskScore}</span>
        </div>
      ),
    },
    {
      key: "pep", header: t.customers.pepStatus, width: "w-16",
      render: (r) => r.pepStatus
        ? <span className="text-[11px] font-mono text-amber-400">{t.common.yes}</span>
        : <span className="text-[11px] font-mono text-[#484f58]">{t.common.no}</span>,
    },
    {
      key: "date", header: t.customers.createdAt, width: "w-28",
      render: (r) => <span className="font-mono text-xs text-[#7d8590]">{formatDate(r.createdAt)}</span>,
    },
  ];

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">{t.customers.title}</h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            {data
              ? t.customers.subtitle.replace("{count}", formatNumber(data.total))
              : "—"}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58]" />
          <input
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder={t.customers.searchPlaceholder}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-md pl-8 pr-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40 transition-colors"
          />
        </div>
        <select
          value={riskLevel}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setRiskLevel(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">{t.customers.allRisks}</option>
          <option value="LOW">{t.risk.low}</option>
          <option value="MEDIUM">{t.risk.medium}</option>
          <option value="HIGH">{t.risk.high}</option>
          <option value="CRITICAL">{t.risk.critical}</option>
        </select>
        <select
          value={kycStatus}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setKycStatus(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">{t.customers.allStatuses}</option>
          <option value="PENDING">{t.kyc.pending}</option>
          <option value="IN_REVIEW">{t.kyc.inReview}</option>
          <option value="APPROVED">{t.kyc.approved}</option>
          <option value="REJECTED">{t.kyc.rejected}</option>
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
          emptyMessage={t.common.noResults}
        />
      </div>
    </AppLayout>
  );
}
