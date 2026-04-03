import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatRelative, formatNumber } from "../lib/utils";
import { UserPlus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";

type Alert = {
  id: number; alertId: string; scenario: string;
  alertType: string; priority: string; status: string;
  riskScore: number; customerId: number; assignedTo: number | null;
  createdAt: Date;
};

export function AlertsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus]   = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [selected, setSelected] = useState<Alert | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.alerts.list.useQuery({
    page, limit: 20,
    ...(status   ? { status:   status   as "OPEN" | "IN_REVIEW" | "ESCALATED" | "CLOSED" | "FALSE_POSITIVE" } : {}),
    ...(priority ? { priority: priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } : {}),
  }, { placeholderData: keepPreviousData });

  const assignMutation  = trpc.alerts.assign.useMutation({
    onSuccess: () => { utils.alerts.list.invalidate(); setSelected(null); },
  });
  const resolveMutation = trpc.alerts.resolve.useMutation({
    onSuccess: () => { utils.alerts.list.invalidate(); setSelected(null); setResolveNote(""); },
  });

  const COLUMNS: Column<Alert>[] = [
    {
      key: "id", header: t.alerts.alertId, width: "w-36",
      render: (r) => <span className="font-mono text-xs text-[#58a6ff]">{r.alertId}</span>,
    },
    {
      key: "scenario", header: t.alerts.scenario,
      render: (r) => (
        <div>
          <p className="text-xs text-[#e6edf3] font-mono">{r.scenario}</p>
          <p className="text-[10px] text-[#7d8590] mt-0.5">{formatRelative(r.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "type", header: "Type", width: "w-28",
      render: (r) => <Badge label={r.alertType} />,
    },
    {
      key: "priority", header: t.alerts.severity, width: "w-28",
      render: (r) => <Badge label={r.priority} variant="priority" />,
    },
    {
      key: "status", header: t.common.status, width: "w-32",
      render: (r) => <Badge label={r.status} variant="status" />,
    },
    {
      key: "score", header: t.alerts.scoreLabel, width: "w-20",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${r.riskScore}%`,
                background: r.riskScore >= 75 ? "#f85149" : r.riskScore >= 50 ? "#d29922" : "#3fb950",
              }}
            />
          </div>
          <span className="text-[10px] font-mono text-[#7d8590]">{r.riskScore}</span>
        </div>
      ),
    },
    {
      key: "actions", header: "", width: "w-20",
      render: (r) => r.status === "OPEN" || r.status === "IN_REVIEW" ? (
        <button
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSelected(r); }}
          className="text-[11px] font-mono text-[#58a6ff] hover:underline"
        >
          {t.common.submit}
        </button>
      ) : null,
    },
  ];

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">{t.alerts.title}</h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            {data ? t.alerts.subtitle.replace("{count}", formatNumber(data.total)) : "—"}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-4">
        <select
          value={status}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setStatus(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">{t.alerts.allStatuses}</option>
          <option value="OPEN">{t.alerts.statusOpen}</option>
          <option value="IN_REVIEW">{t.alerts.statusInReview}</option>
          <option value="ESCALATED">{t.alerts.statusEscalated}</option>
          <option value="CLOSED">{t.alerts.statusClosed}</option>
          <option value="FALSE_POSITIVE">{t.alerts.statusFalsePositive}</option>
        </select>
        <select
          value={priority}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setPriority(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">{t.alerts.allSeverities}</option>
          <option value="CRITICAL">{t.alerts.critical}</option>
          <option value="HIGH">{t.alerts.high}</option>
          <option value="MEDIUM">{t.alerts.medium}</option>
          <option value="LOW">{t.alerts.low}</option>
        </select>
      </div>

      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
        <DataTable
          columns={COLUMNS}
          data={(data?.data ?? []) as Alert[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          total={data?.total}
          page={page}
          limit={20}
          onPageChange={setPage}
          emptyMessage={t.alerts.noAlerts}
        />
      </div>

      {/* Panneau de traitement */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 w-full max-w-md animate-slide-in">
            <h3 className="text-sm font-semibold text-[#e6edf3] font-mono mb-1">{selected.alertId}</h3>
            <p className="text-xs font-mono text-[#7d8590] mb-4">{selected.scenario}</p>

            <div className="flex gap-2 mb-4">
              <Badge label={selected.priority} variant="priority" />
              <Badge label={selected.status} variant="status" />
              <span className="text-[11px] font-mono text-[#7d8590]">{t.alerts.scoreLabel} : {selected.riskScore}</span>
            </div>

            {/* Assigner */}
            {user && !selected.assignedTo && (
              <button
                onClick={() => assignMutation.mutate({ id: selected.id, userId: user.id })}
                disabled={assignMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 mb-3 bg-[#1f6feb]/20 border border-[#1f6feb]/30 hover:bg-[#1f6feb]/30 text-[#58a6ff] text-xs font-mono rounded-md transition-colors"
              >
                <UserPlus size={12} />
                {assignMutation.isPending ? t.common.loading : t.alerts.assignToMe}
              </button>
            )}

            {/* Résoudre */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase">
                {t.alerts.resolveNote}
              </label>
              <textarea
                value={resolveNote}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setResolveNote(e.target.value)}
                rows={3}
                placeholder={t.alerts.resolveNotePh}
                className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40 resize-none"
              />
              <div className="flex gap-2">
                {(["CLOSED", "FALSE_POSITIVE", "ESCALATED"] as const).map((res) => (
                  <button
                    key={res}
                    disabled={resolveNote.length < 10 || resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate({ id: selected.id, resolution: res, note: resolveNote })}
                    className="flex-1 py-1.5 text-[10px] font-mono border rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                      border-[#30363d] text-[#7d8590] hover:border-[#58a6ff]/40 hover:text-[#58a6ff]"
                  >
                    {res === "CLOSED" ? t.alerts.closeAction : res === "FALSE_POSITIVE" ? t.alerts.falsePositiveAction : t.alerts.escalate}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { setSelected(null); setResolveNote(""); }}
              className="w-full mt-3 py-1.5 text-xs font-mono text-[#484f58] hover:text-[#7d8590] transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
