import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatDate, formatRelative, formatNumber } from "../lib/utils";
import { FolderPlus, Clock, User } from "lucide-react";
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

type Case = {
  id: number; caseId: string; title: string;
  status: string; severity: string; customerId: number;
  assignedTo: number | null; supervisorId: number | null;
  dueDate: Date | null; createdAt: Date; updatedAt: Date;
};

type CaseStatus = "OPEN" | "UNDER_INVESTIGATION" | "PENDING_APPROVAL" | "ESCALATED" | "CLOSED" | "SAR_SUBMITTED";

export function CasesPage() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [status, setStatus]     = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);

  // Formulaire création
  const [form, setForm] = useState({
    customerId: "",
    title: "",
    description: "",
    severity: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    dueDate: "",
  });

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.cases.list.useQuery({
    page, limit: 20,
    ...(status   ? { status:   status   as CaseStatus } : {}),
    ...(severity ? { severity: severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } : {}),
  }, { placeholderData: keepPreviousData });

  const createMutation = trpc.cases.create.useMutation({
    onSuccess: () => {
      utils.cases.list.invalidate();
      setShowCreate(false);
      setForm({ customerId: "", title: "", description: "", severity: "MEDIUM", dueDate: "" });
    },
  });

  const COLUMNS: Column<Case>[] = [
    {
      key: "id", header: t.cases.caseId, width: "w-36",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 12, color: C.blue }}>{r.caseId}</span>,
    },
    {
      key: "title", header: t.cases.subject,
      render: (r) => (
        <div>
          <p style={{ fontSize: 12, color: C.text1, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{r.title}</p>
          <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>Client #{r.customerId}</p>
        </div>
      ),
    },
    {
      key: "status", header: t.common.status, width: "w-40",
      render: (r) => <Badge label={r.status} variant="status" />,
    },
    {
      key: "severity", header: t.cases.priority, width: "w-28",
      render: (r) => <Badge label={r.severity} variant="risk" />,
    },
    {
      key: "due", header: t.cases.updatedAt, width: "w-28",
      render: (r) => {
        if (!r.dueDate) return <span style={{ color: C.text4 }}>—</span>;
        const overdue = new Date(r.dueDate) < new Date() && r.status !== "CLOSED";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 4, color: overdue ? C.red : C.text3 }}>
            <Clock size={11} />
            <span style={{ fontFamily: C.mono, fontSize: 10 }}>{formatDate(r.dueDate)}</span>
          </div>
        );
      },
    },
    {
      key: "assigned", header: t.cases.assignedTo, width: "w-24",
      render: (r) => r.assignedTo
        ? <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: C.mono, color: C.text3 }}><User size={10} />#{r.assignedTo}</div>
        : <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4 }}>—</span>,
    },
    {
      key: "date", header: t.cases.createdAt, width: "w-28",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text3 }}>{formatRelative(r.createdAt)}</span>,
    },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>{t.cases.title}</h1>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {data ? t.cases.subtitle.replace("{count}", formatNumber(data.total)) : "—"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer" }}
        >
          <FolderPlus size={13} />
          {t.cases.openCase}
        </button>
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <select
          value={status}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setStatus(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">{t.cases.allStatuses}</option>
          <option value="OPEN">{t.cases.statusOpen}</option>
          <option value="UNDER_INVESTIGATION">{t.cases.statusInvestigation}</option>
          <option value="PENDING_APPROVAL">{t.cases.statusApproval}</option>
          <option value="ESCALATED">{t.cases.statusEscalated}</option>
          <option value="SAR_SUBMITTED">{t.cases.statusSarSubmitted}</option>
          <option value="CLOSED">{t.cases.statusClosed}</option>
        </select>
        <select
          value={severity}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setSeverity(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">{t.cases.allPriorities}</option>
          <option value="CRITICAL">{t.cases.critical}</option>
          <option value="HIGH">{t.cases.high}</option>
          <option value="MEDIUM">{t.risk.medium}</option>
          <option value="LOW">{t.risk.low}</option>
        </select>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <DataTable
          columns={COLUMNS}
          data={(data?.data ?? []) as Case[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          total={data?.total}
          page={page}
          limit={20}
          onPageChange={setPage}
          emptyMessage={t.common.noResults}
        />
      </div>

      {/* Modal création */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 500 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 16px" }}>{t.cases.openCase}</h3>

            <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 6, display: "block" }}>
                    {t.cases.customerIdRequired}
                  </label>
                  <input
                    type="number"
                    value={form.customerId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f: typeof form) => ({ ...f, customerId: e.target.value }))}
                    placeholder="123"
                    style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" as const }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 6, display: "block" }}>
                    {t.cases.severity}
                  </label>
                  <select
                    value={form.severity}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, severity: e.target.value as typeof form.severity }))}
                    style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono, color: C.text2, outline: "none", boxSizing: "border-box" as const }}
                  >
                    <option value="LOW">{t.risk.low}</option>
                    <option value="MEDIUM">{t.risk.medium}</option>
                    <option value="HIGH">{t.cases.high}</option>
                    <option value="CRITICAL">{t.cases.critical}</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 6, display: "block" }}>
                  {t.cases.titleLabel} *
                </label>
                <input
                  value={form.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f: typeof form) => ({ ...f, title: e.target.value }))}
                  placeholder={t.cases.titlePh}
                  style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" as const }}
                />
              </div>

              <div>
                <label style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 6, display: "block" }}>
                  {t.cases.descriptionLabel}
                </label>
                <textarea
                  value={form.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((f: typeof form) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder={t.cases.descriptionPh}
                  style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", resize: "none" as const, boxSizing: "border-box" as const }}
                />
              </div>

              <div>
                <label style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 6, display: "block" }}>
                  {t.cases.dueDate}
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f: typeof form) => ({ ...f, dueDate: e.target.value }))}
                  style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono, color: C.text2, outline: "none", boxSizing: "border-box" as const }}
                />
              </div>
            </div>

            {createMutation.error && (
              <p style={{ marginTop: 12, fontSize: 12, fontFamily: C.mono, color: C.red }}>{createMutation.error.message}</p>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setShowCreate(false)}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}
              >
                {t.common.cancel}
              </button>
              <button
                disabled={!form.customerId || !form.title || createMutation.isPending}
                onClick={() => createMutation.mutate({
                  customerId:  parseInt(form.customerId),
                  title:       form.title,
                  severity:    form.severity,
                  ...(form.description ? { description: form.description } : {}),
                  ...(form.dueDate     ? { dueDate: new Date(form.dueDate).toISOString() } : {}),
                })}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: (!form.customerId || !form.title || createMutation.isPending) ? 0.4 : 1 }}
              >
                {createMutation.isPending ? t.common.loading : t.cases.openCase}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
