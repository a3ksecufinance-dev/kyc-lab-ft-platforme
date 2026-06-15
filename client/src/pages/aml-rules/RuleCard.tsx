import { useState } from "react";
import type React from "react";
import {
  Trash2, ChevronDown, ChevronRight, TrendingUp,
  ThumbsDown, ToggleLeft, ToggleRight, Pencil,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { trpc } from "../../lib/trpc";
import { useI18n } from "../../hooks/useI18n";
import {
  C, CATEGORY_LABELS, CATEGORY_STYLE,
  inputCls, btnGhost, btnRed,
  type AmlRule, type Condition,
} from "./types";
import { RuleModal } from "./RuleModal";

export function RuleCard({ rule, canEdit, canDelete }: { rule: AmlRule; canEdit: boolean; canDelete: boolean }) {
  const { t } = useI18n();
  const utils  = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [showEdit, setShowEdit] = useState(false);

  const { data: stats } = trpc.amlRules.stats.useQuery(
    { id: rule.id, days: 30 },
    { enabled: open }
  );
  const { data: executions } = trpc.amlRules.recentExecutions.useQuery(
    { id: rule.id, limit: 30 },
    { enabled: open }
  );

  const toggleMut = trpc.amlRules.toggleStatus.useMutation({
    onSuccess: () => utils.amlRules.list.invalidate(),
  });
  const deleteMut = trpc.amlRules.delete.useMutation({
    onSuccess: () => utils.amlRules.list.invalidate(),
  });
  const feedbackMut = trpc.amlRules.feedback.useMutation({
    onSuccess: () => { setShowFeedback(false); setFeedbackNote(""); utils.amlRules.list.invalidate(); },
  });

  // Préparer les données recharts depuis les executions
  const chartData = executions
    ? (() => {
        const byDay: Record<string, { date: string; triggered: number; total: number }> = {};
        for (const e of executions) {
          const day = new Date(e.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
          if (!byDay[day]) byDay[day] = { date: day, triggered: 0, total: 0 };
          byDay[day].total += 1;
          if (e.triggered) byDay[day].triggered += 1;
        }
        return Object.values(byDay).slice(-14);
      })()
    : [];

  const STATUS_LABELS = { ACTIVE: "Actif", INACTIVE: "Inactif", TESTING: "Test A/B" };
  const STATUS_STYLE: Record<string, React.CSSProperties> = {
    ACTIVE:   { color: C.green,  background: "rgba(45,212,160,0.09)",  border: "1px solid rgba(45,212,160,0.22)"  },
    INACTIVE: { color: C.text4,  background: "var(--wr-border)",       border: "1px solid var(--wr-border2)"      },
    TESTING:  { color: C.amber,  background: "rgba(245,158,11,0.09)",  border: "1px solid rgba(245,158,11,0.22)"  },
  };

  return (
    <div className={`bg-[var(--wr-card)] border rounded-lg transition-all ${
      open ? "border-[var(--wr-blue)]/30" : "border-[var(--wr-border)] hover:border-[var(--wr-border2)]"
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-[var(--wr-text-1)]">{rule.name}</span>
              <span style={{ fontSize: 9, fontFamily: C.mono, padding: "2px 6px", borderRadius: 4, ...(CATEGORY_STYLE[rule.category] ?? {}) }}>
                {CATEGORY_LABELS[rule.category] ?? rule.category}
              </span>
              <span style={{ fontSize: 9, fontFamily: C.mono, padding: "2px 6px", borderRadius: 4, ...(STATUS_STYLE[rule.status] ?? {}) }}>
                {STATUS_LABELS[rule.status]}
              </span>
              {rule.status === "ACTIVE" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              )}
            </div>
            {rule.description && (
              <p className="text-[10px] font-mono text-[var(--wr-text-3)] mt-1 line-clamp-1">{rule.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-center">
              <div style={{ fontSize: 13, fontFamily: C.mono, fontWeight: 700,
                color: rule.baseScore >= 75 ? C.red : rule.baseScore >= 50 ? C.amber : C.green,
              }}>{rule.baseScore}</div>
              <div className="text-[9px] font-mono text-[var(--wr-text-4)]">score</div>
            </div>

            {canEdit && (
              <>
                <button
                  onClick={() => setShowEdit(true)}
                  className="text-[var(--wr-text-4)] hover:text-[var(--wr-blue)] transition-colors"
                  title="Modifier la règle"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => toggleMut.mutate({
                    id: rule.id,
                    status: rule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                  })}
                  className="text-[var(--wr-text-4)] hover:text-[var(--wr-blue)] transition-colors"
                  title={rule.status === "ACTIVE" ? "Désactiver" : "Activer"}
                >
                  {rule.status === "ACTIVE"
                    ? <ToggleRight size={18} style={{ color: C.green }} />
                    : <ToggleLeft  size={18} />
                  }
                </button>
              </>
            )}

            <button
              onClick={() => setShowFeedback(true)}
              className="text-[var(--wr-text-4)] hover:text-amber-400 transition-colors"
              title="Signaler faux positif"
            >
              <ThumbsDown size={14} />
            </button>

            {canDelete && (
              <button
                onClick={() => { if (confirm("Supprimer cette règle ?")) deleteMut.mutate({ id: rule.id }); }}
                className="text-[var(--wr-text-4)] hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}

            <button onClick={() => setOpen(!open)} className="text-[var(--wr-text-4)] hover:text-[var(--wr-text-1)] transition-colors">
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Feedback modal faux positif */}
      {showFeedback && (
        <div style={{ margin: "0 16px 16px", padding: 12, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8 }}>
          <p style={{ fontSize: 10, fontFamily: C.mono, color: C.amber, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Signaler un faux positif
          </p>
          <textarea
            value={feedbackNote}
            onChange={e => setFeedbackNote(e.target.value)}
            placeholder="Décrivez pourquoi cette règle génère trop de faux positifs..."
            rows={2}
            className={`${inputCls} mb-2 text-[11px]`}
          />
          <div className="flex gap-2">
            <button onClick={() => setShowFeedback(false)} className={btnGhost}>{t.common.cancel}</button>
            <button
              onClick={() => feedbackMut.mutate({ ruleId: rule.id, note: feedbackNote })}
              disabled={feedbackNote.length < 10 || feedbackMut.isPending}
              className={`${btnRed} disabled:opacity-40`}
            >
              {feedbackMut.isPending ? "Envoi..." : "Signaler"}
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <RuleModal
          onClose={() => setShowEdit(false)}
          editId={rule.id}
          initial={{
            name:        rule.name,
            description: rule.description ?? "",
            category:    rule.category,
            status:      rule.status,
            score:       rule.baseScore,
            priority:    rule.priority,
            alertType:   rule.alertType,
            conditions:  rule.conditions as Condition,
            threshold:   rule.thresholdValue ?? "",
            window:      rule.windowMinutes ? String(rule.windowMinutes) : "",
          }}
        />
      )}

      {/* Expand: stats + graph */}
      {open && (
        <div className="border-t border-[var(--wr-border)] p-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Exécutions 30j",   val: stats?.totalExecutions ?? 0 },
              { label: "Déclenchements",   val: stats?.totalTriggered  ?? 0 },
              { label: "Taux déclench.",   val: `${stats?.triggerRate ?? 0}%` },
              { label: "Règle ID",         val: rule.ruleId },
            ].map(({ label, val }) => (
              <div key={label} className="bg-[var(--wr-bg)] border border-[var(--wr-border)] rounded p-2">
                <div className="text-xs font-mono font-bold text-[var(--wr-text-1)]">{String(val)}</div>
                <div className="text-[9px] font-mono text-[var(--wr-text-4)] mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Graphe recharts */}
          {chartData.length > 0 && (
            <div>
              <p className="text-[9px] font-mono text-[var(--wr-text-4)] uppercase tracking-widest mb-2 flex items-center gap-1">
                <TrendingUp size={10} /> Déclenchements / jour (14 derniers jours)
              </p>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--wr-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--wr-text-4)", fontFamily: "monospace" }} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--wr-text-4)", fontFamily: "monospace" }} width={20} />
                  <Tooltip
                    contentStyle={{ background: "var(--wr-card)", border: "1px solid var(--wr-border)", borderRadius: 4, fontSize: 10, fontFamily: "monospace", color: "var(--wr-text-1)" }}
                    labelStyle={{ color: "var(--wr-text-2)" }}
                  />
                  <Line type="monotone" dataKey="triggered" stroke="var(--wr-amber)" strokeWidth={1.5} dot={false} name="Déclenchés" />
                  <Line type="monotone" dataKey="total" stroke="var(--wr-border2)" strokeWidth={1} dot={false} name="Analysés" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Conditions JSON */}
          <div>
            <p className="text-[9px] font-mono text-[var(--wr-text-4)] uppercase tracking-widest mb-1">Conditions JSON</p>
            <pre className="bg-[var(--wr-bg)] border border-[var(--wr-border)] rounded p-3 text-[10px] font-mono text-[var(--wr-blue)] overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(rule.conditions, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
