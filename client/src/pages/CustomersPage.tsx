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
    ...(search    ? { search } : {}),
    ...(riskLevel ? { riskLevel: riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } : {}),
    ...(kycStatus ? { kycStatus: kycStatus as "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED" } : {}),
  }, { placeholderData: keepPreviousData });

  const COLUMNS: Column<Customer>[] = [
    {
      key: "id", header: t.customers.clientId, width: "w-36",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 12, color: C.blue }}>{r.customerId}</span>,
    },
    {
      key: "name", header: t.customers.fullName,
      render: (r) => (
        <div>
          <p style={{ fontSize: 13, color: C.text1, margin: "0 0 2px" }}>{r.firstName} {r.lastName}</p>
          <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>{r.nationality ?? "—"}</p>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge label={r.riskLevel} variant="risk" />
          <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text3 }}>{r.riskScore}</span>
        </div>
      ),
    },
    {
      key: "pep", header: t.customers.pepStatus, width: "w-16",
      render: (r) => r.pepStatus
        ? <span style={{ fontSize: 11, fontFamily: C.mono, color: C.amber }}>{t.common.yes}</span>
        : <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text4 }}>{t.common.no}</span>,
    },
    {
      key: "date", header: t.customers.createdAt, width: "w-28",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>{formatDate(r.createdAt)}</span>,
    },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>{t.customers.title}</h1>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {data
              ? t.customers.subtitle.replace("{count}", formatNumber(data.total))
              : "—"}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 192 }}>
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.text4 }} />
          <input
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t.customers.searchPlaceholder}
            style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, paddingTop: 7, paddingBottom: 7, paddingLeft: 30, paddingRight: 11, fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none", boxSizing: "border-box" as const }}
          />
        </div>
        <select
          value={riskLevel}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setRiskLevel(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
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
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">{t.customers.allStatuses}</option>
          <option value="PENDING">{t.kyc.pending}</option>
          <option value="IN_REVIEW">{t.kyc.inReview}</option>
          <option value="APPROVED">{t.kyc.approved}</option>
          <option value="REJECTED">{t.kyc.rejected}</option>
        </select>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
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
