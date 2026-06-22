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
import { Button } from "../../components/ui/Button";
import {
  C, CATEGORY_LABELS, CATEGORY_STYLE,
  inputCls,
  type AmlRule, type Condition,
} from "./types";
import { RuleModal } from "./RuleModal";

function ActionButton({ onClick, title, icon: Icon, color = "var(--wr-text-3)", hoverColor, size = 14, disabled }: {
  onClick: () => void; title: string; icon: React.ElementType;
  color?: string; hoverColor?: string; size?: number; disabled?: boolean;
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: 6,
        background: "transparent", border: "1px solid transparent",
        color, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "all 0.15s",
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.background = "var(--wr-hover)";
          e.currentTarget.style.borderColor = "var(--wr-border)";
          if (hoverColor) e.currentTarget.style.color = hoverColor;
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "transparent";
        e.currentTarget.style.color = color;
      }}
    >
      <Icon size={size} />
    </button>
  );
}

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

  const scoreColor = rule.baseScore >= 75 ? C.red : rule.baseScore >= 50 ? C.amber : C.green;

  return (
    <div
      className={`bg-[var(--wr-card)] border rounded-lg transition-all ${
        open ? "border-[var(--wr-blue)]/30 shadow-[0_0_0_1px_rgba(74,158,255,0.08)]" : "border-[var(--wr-border)] hover:border-[var(--wr-border2)]"
      }`}
    >
      {/* Main row — clickable to expand */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setOpen(!open)}
        style={{ userSelect: "none" }}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left: info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span style={{ fontSize: 13, fontFamily: C.mono, fontWeight: 600, color: C.text1 }}>{rule.name}</span>
              <span style={{ fontSize: 9, fontFamily: C.mono, padding: "2px 8px", borderRadius: 4, ...(CATEGORY_STYLE[rule.category] ?? {}) }}>
                {CATEGORY_LABELS[rule.category] ?? rule.category}
              </span>
              <span style={{ fontSize: 9, fontFamily: C.mono, padding: "2px 8px", borderRadius: 4, ...(STATUS_STYLE[rule.status] ?? {}) }}>
                {STATUS_LABELS[rule.status]}
              </span>
              {rule.status === "ACTIVE" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              )}
            </div>
            {rule.description && (
              <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "4px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rule.description}
              </p>
            )}
          </div>

          {/* Center: score pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 20,
            background: `color-mix(in srgb, ${scoreColor} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${scoreColor} 20%, transparent)`,
          }}>
            <span style={{ fontSize: 14, fontFamily: C.mono, fontWeight: 700, color: scoreColor }}>
              {rule.baseScore}
            </span>
            <span style={{ fontSize: 9, fontFamily: C.mono, color: scoreColor, opacity: 0.7 }}>
              /100
            </span>
          </div>

          {/* Right: action buttons */}
          <div style={{
            display: "flex", alignItems: "center", gap: 2,
            padding: "2px 4px", borderRadius: 8,
            background: "var(--wr-surface)", border: "1px solid var(--wr-border)",
          }}>
            {canEdit && (
              <>
                <ActionButton
                  onClick={() => setShowEdit(true)}
                  title="Modifier la règle"
                  icon={Pencil}
                  hoverColor="var(--wr-blue)"
                />
                <ActionButton
                  onClick={() => toggleMut.mutate({
                    id: rule.id,
                    status: rule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                  })}
                  title={rule.status === "ACTIVE" ? "Désactiver" : "Activer"}
                  icon={rule.status === "ACTIVE" ? ToggleRight : ToggleLeft}
                  color={rule.status === "ACTIVE" ? C.green : "var(--wr-text-3)"}
                  hoverColor="var(--wr-blue)"
                  size={18}
                />
              </>
            )}
            <ActionButton
              onClick={() => setShowFeedback(!showFeedback)}
              title="Signaler faux positif"
              icon={ThumbsDown}
              hoverColor="var(--wr-amber)"
            />
            {canDelete && (
              <ActionButton
                onClick={() => { if (confirm("Supprimer cette règle ?")) deleteMut.mutate({ id: rule.id }); }}
                title="Supprimer"
                icon={Trash2}
                hoverColor="var(--wr-red)"
              />
            )}
            <div style={{ width: 1, height: 18, background: "var(--wr-border)", margin: "0 2px" }} />
            <ActionButton
              onClick={() => setOpen(!open)}
              title={open ? "Réduire" : "Détails"}
              icon={open ? ChevronDown : ChevronRight}
              hoverColor="var(--wr-text-1)"
            />
          </div>
        </div>
      </div>

      {/* Feedback panel */}
      {showFeedback && (
        <div style={{
          margin: "0 16px 16px", padding: 14,
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.18)", borderRadius: 10,
        }}>
          <p style={{ fontSize: 10, fontFamily: C.mono, color: C.amber, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, fontWeight: 600 }}>
            Signaler un faux positif
          </p>
          <textarea
            value={feedbackNote}
            onChange={e => setFeedbackNote(e.target.value)}
            placeholder="Décrivez pourquoi cette règle génère trop de faux positifs..."
            rows={2}
            className={`${inputCls} mb-3 text-[11px]`}
            onClick={e => e.stopPropagation()}
          />
          <div className="flex gap-2 justify-end">
            <Button onClick={() => setShowFeedback(false)} variant="ghost" size="sm">
              {t.common.cancel}
            </Button>
            <Button
              onClick={() => feedbackMut.mutate({ ruleId: rule.id, note: feedbackNote })}
              disabled={feedbackNote.length < 10 || feedbackMut.isPending}
              variant="warning" size="sm"
            >
              {feedbackMut.isPending ? "Envoi..." : "Signaler"}
            </Button>
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
