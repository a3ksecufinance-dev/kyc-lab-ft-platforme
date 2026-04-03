import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatDate, formatRelative, formatNumber } from "../lib/utils";
import { FolderPlus, Clock, User } from "lucide-react";
import { useI18n } from "../hooks/useI18n";

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
      render: (r) => <span className="font-mono text-xs text-[#58a6ff]">{r.caseId}</span>,
    },
    {
      key: "title", header: t.cases.subject,
      render: (r) => (
        <div>
          <p className="text-xs text-[#e6edf3] truncate max-w-xs">{r.title}</p>
          <p className="text-[10px] font-mono text-[#7d8590] mt-0.5">Client #{r.customerId}</p>
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
        if (!r.dueDate) return <span className="text-[#484f58]">—</span>;
        const overdue = new Date(r.dueDate) < new Date() && r.status !== "CLOSED";
        return (
          <div className={`flex items-center gap-1 ${overdue ? "text-red-400" : "text-[#7d8590]"}`}>
            <Clock size={11} />
            <span className="font-mono text-[10px]">{formatDate(r.dueDate)}</span>
          </div>
        );
      },
    },
    {
      key: "assigned", header: t.cases.assignedTo, width: "w-24",
      render: (r) => r.assignedTo
        ? <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#7d8590]"><User size={10} />#{r.assignedTo}</div>
        : <span className="text-[10px] font-mono text-[#484f58]">—</span>,
    },
    {
      key: "date", header: t.cases.createdAt, width: "w-28",
      render: (r) => <span className="font-mono text-[10px] text-[#7d8590]">{formatRelative(r.createdAt)}</span>,
    },
  ];

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">{t.cases.title}</h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            {data ? t.cases.subtitle.replace("{count}", formatNumber(data.total)) : "—"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 hover:bg-[#1f6feb]/30 text-[#58a6ff] rounded-md transition-colors"
        >
          <FolderPlus size={13} />
          {t.cases.openCase}
        </button>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-4">
        <select
          value={status}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setStatus(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
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
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setSeverity(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">{t.cases.allPriorities}</option>
          <option value="CRITICAL">{t.cases.critical}</option>
          <option value="HIGH">{t.cases.high}</option>
          <option value="MEDIUM">{t.risk.medium}</option>
          <option value="LOW">{t.risk.low}</option>
        </select>
      </div>

      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 w-full max-w-lg animate-slide-in">
            <h3 className="text-sm font-semibold text-[#e6edf3] font-mono mb-4">{t.cases.openCase}</h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                    {t.cases.customerIdRequired}
                  </label>
                  <input
                    type="number"
                    value={form.customerId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, customerId: e.target.value }))}
                    placeholder="123"
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                    {t.cases.severity}
                  </label>
                  <select
                    value={form.severity}
                    onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, severity: e.target.value as typeof form.severity }))}
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
                  >
                    <option value="LOW">{t.risk.low}</option>
                    <option value="MEDIUM">{t.risk.medium}</option>
                    <option value="HIGH">{t.cases.high}</option>
                    <option value="CRITICAL">{t.cases.critical}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                  {t.cases.titleLabel} *
                </label>
                <input
                  value={form.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, title: e.target.value }))}
                  placeholder={t.cases.titlePh}
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                  {t.cases.descriptionLabel}
                </label>
                <textarea
                  value={form.description}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder={t.cases.descriptionPh}
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40 resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                  {t.cases.dueDate}
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, dueDate: e.target.value }))}
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
                />
              </div>
            </div>

            {createMutation.error && (
              <p className="mt-3 text-xs font-mono text-red-400">{createMutation.error.message}</p>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] rounded-md transition-colors"
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
                className="flex-1 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 hover:bg-[#1f6feb]/30 text-[#58a6ff] rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
