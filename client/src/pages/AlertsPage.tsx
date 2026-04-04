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
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 12, color: C.blue }}>{r.alertId}</span>,
    },
    {
      key: "scenario", header: t.alerts.scenario,
      render: (r) => (
        <div>
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text1, margin: "0 0 2px" }}>{r.scenario}</p>
          <p style={{ fontSize: 10, color: C.text3, margin: 0 }}>{formatRelative(r.createdAt)}</p>
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 56, height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 3,
                background: r.riskScore >= 75 ? C.red : r.riskScore >= 50 ? C.amber : C.green,
                width: `${r.riskScore}%`,
              }}
            />
          </div>
          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{r.riskScore}</span>
        </div>
      ),
    },
    {
      key: "actions", header: "", width: "w-20",
      render: (r) => r.status === "OPEN" || r.status === "IN_REVIEW" ? (
        <button
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSelected(r); }}
          style={{ fontSize: 11, fontFamily: C.mono, color: C.blue, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {t.common.submit}
        </button>
      ) : null,
    },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>{t.alerts.title}</h1>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {data ? t.alerts.subtitle.replace("{count}", formatNumber(data.total)) : "—"}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <select
          value={status}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setStatus(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
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
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setPriority(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">{t.alerts.allSeverities}</option>
          <option value="CRITICAL">{t.alerts.critical}</option>
          <option value="HIGH">{t.alerts.high}</option>
          <option value="MEDIUM">{t.alerts.medium}</option>
          <option value="LOW">{t.alerts.low}</option>
        </select>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 440 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 4px" }}>{selected.alertId}</h3>
            <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: "0 0 16px" }}>{selected.scenario}</p>

            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <Badge label={selected.priority} variant="priority" />
              <Badge label={selected.status} variant="status" />
              <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text3 }}>{t.alerts.scoreLabel} : {selected.riskScore}</span>
            </div>

            {/* Assigner */}
            {user && !selected.assignedTo && (
              <button
                onClick={() => assignMutation.mutate({ id: selected.id, userId: user.id })}
                disabled={assignMutation.isPending}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "8px 14px", marginBottom: 12, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer", boxSizing: "border-box" as const }}
              >
                <UserPlus size={12} />
                {assignMutation.isPending ? t.common.loading : t.alerts.assignToMe}
              </button>
            )}

            {/* Résoudre */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
              <label style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 6, display: "block" }}>
                {t.alerts.resolveNote}
              </label>
              <textarea
                value={resolveNote}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setResolveNote(e.target.value)}
                rows={3}
                placeholder={t.alerts.resolveNotePh}
                style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", resize: "none" as const, boxSizing: "border-box" as const }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                {(["CLOSED", "FALSE_POSITIVE", "ESCALATED"] as const).map((res) => (
                  <button
                    key={res}
                    disabled={resolveNote.length < 10 || resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate({ id: selected.id, resolution: res, note: resolveNote })}
                    style={{ flex: 1, padding: "6px 8px", fontSize: 10, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 6, color: C.text3, background: "transparent", cursor: "pointer", opacity: (resolveNote.length < 10 || resolveMutation.isPending) ? 0.4 : 1 }}
                  >
                    {res === "CLOSED" ? t.alerts.closeAction : res === "FALSE_POSITIVE" ? t.alerts.falsePositiveAction : t.alerts.escalate}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { setSelected(null); setResolveNote(""); }}
              style={{ width: "100%", marginTop: 12, padding: "6px 0", fontSize: 12, fontFamily: C.mono, color: C.text4, background: "none", border: "none", cursor: "pointer" }}
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
