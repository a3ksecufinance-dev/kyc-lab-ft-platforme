import { useState } from "react";
import { AppLayout }  from "../components/layout/AppLayout";
import { StatCard }   from "../components/ui/StatCard";
import { Badge }      from "../components/ui/Badge";
import { trpc }       from "../lib/trpc";
import { formatRelative } from "../lib/utils";
import {
  Search, ShieldCheck, ShieldAlert, AlertTriangle,
  RefreshCw, Plus, Trash2, Shield, Database, Clock,
  AlertOctagon, Layers, History, CheckCircle, XCircle, ArrowUpRight,
} from "lucide-react";
import { useAuth }  from "../hooks/useAuth";
import { hasRole }  from "../lib/auth";
import { useI18n }  from "../hooks/useI18n";

// ─── Palette (identique Dashboard) ───────────────────────────────────────────
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

type Tab = "search" | "batch" | "pending" | "lists" | "custom";

// ─── Composants partagés ──────────────────────────────────────────────────────

function Card({ title, right, children }: {
  title: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 10, fontFamily: C.mono, letterSpacing: "0.16em", textTransform: "uppercase", color: C.text2, margin: 0, fontWeight: 600 }}>{title}</p>
        {right}
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

function Input({ label, required, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; required?: boolean }) {
  return (
    <div>
      {label && (
        <p style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3, marginBottom: 6 }}>
          {label}{required && <span style={{ color: C.red }}> *</span>}
        </p>
      )}
      <input {...props} style={{
        width: "100%", boxSizing: "border-box",
        background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 8,
        padding: "9px 12px", fontSize: 12, fontFamily: C.mono, color: C.text1,
        outline: "none", transition: "border-color 0.15s",
        ...(props.style ?? {}),
      }}
      onFocus={e => (e.target.style.borderColor = "var(--wr-accent-border)")}
      onBlur={e => (e.target.style.borderColor = C.border2)}
      />
    </div>
  );
}

function Textarea({ label, required, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; required?: boolean }) {
  return (
    <div>
      {label && (
        <p style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3, marginBottom: 6 }}>
          {label}{required && <span style={{ color: C.red }}> *</span>}
        </p>
      )}
      <textarea {...props} style={{
        width: "100%", boxSizing: "border-box",
        background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 8,
        padding: "9px 12px", fontSize: 12, fontFamily: C.mono, color: C.text1,
        outline: "none", resize: "none", transition: "border-color 0.15s",
      }}
      onFocus={e => (e.target.style.borderColor = "var(--wr-accent-border)")}
      onBlur={e => (e.target.style.borderColor = C.border2)}
      />
    </div>
  );
}

function Btn({ variant = "primary", disabled, onClick, children, style }: {
  variant?: "primary" | "danger" | "ghost" | "success";
  disabled?: boolean; onClick?: () => void; children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.3)", color: C.gold },
    danger:  { background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: C.red },
    ghost:   { background: "transparent", border: `1px solid ${C.border2}`, color: C.text2 },
    success: { background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", color: C.green },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "8px 14px", borderRadius: 8,
      fontSize: 11, fontFamily: C.mono, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, transition: "opacity 0.15s",
      ...styles[variant], ...style,
    }}>
      {children}
    </button>
  );
}

function ReviewModal({ target, onClose, onConfirm, isPending }: {
  target: { id: number; label: string };
  onClose: () => void;
  onConfirm: (decision: "CONFIRMED" | "DISMISSED" | "ESCALATED", reason: string) => void;
  isPending: boolean;
}) {
  const [decision, setDecision] = useState<"CONFIRMED" | "DISMISSED" | "ESCALATED">("DISMISSED");
  const [reason, setReason] = useState("");
  const { t } = useI18n();

  const DECISIONS = [
    { key: "DISMISSED" as const, label: t.screening.dismissed, color: C.green, bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.3)" },
    { key: "CONFIRMED" as const, label: t.screening.confirmed, color: C.red,   bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.3)" },
    { key: "ESCALATED" as const, label: t.screening.escalated, color: C.amber, bg: "rgba(251,146,60,0.1)",  border: "rgba(251,146,60,0.3)" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div style={{ background: "var(--wr-sidebar-bg, #0d1117)", border: `1px solid ${C.border2}`, borderRadius: 12, width: "100%", maxWidth: 400 }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} style={{ color: C.amber }} />
          <p style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: 0 }}>
            Révision — {target.label}
          </p>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {DECISIONS.map(d => (
              <button key={d.key} onClick={() => setDecision(d.key)} style={{
                flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 10, fontFamily: C.mono,
                cursor: "pointer", transition: "all 0.15s",
                background: decision === d.key ? d.bg : "transparent",
                border: `1px solid ${decision === d.key ? d.border : C.border2}`,
                color: decision === d.key ? d.color : C.text3,
              }}>
                {d.label}
              </button>
            ))}
          </div>
          <Textarea label="Motif de décision" required rows={3}
            value={reason} placeholder="Minimum 10 caractères…"
            onChange={e => setReason((e as React.ChangeEvent<HTMLTextAreaElement>).target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={onClose} style={{ flex: 1, justifyContent: "center" }}>{t.common.cancel}</Btn>
            <Btn variant="primary" disabled={reason.length < 10 || isPending}
              onClick={() => onConfirm(decision, reason)}
              style={{ flex: 1, justifyContent: "center" }}>
              {isPending ? t.common.loading : t.common.confirm}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function ScreeningPage() {
  const { t }     = useI18n();
  const { user }  = useAuth();
  const canReview = hasRole(user, "compliance_officer");
  const canAdmin  = hasRole(user, "admin");
  const canEdit   = hasRole(user, "supervisor");
  const [tab, setTab] = useState<Tab>("search");

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "search",  label: t.screening.title,       icon: Search    },
    { key: "batch",   label: "Screening batch",        icon: Layers    },
    { key: "pending", label: t.screening.pending,      icon: AlertTriangle },
    { key: "lists",   label: t.screening.listsStatus,  icon: Database  },
    { key: "custom",  label: t.screening.customList,   icon: Shield    },
  ];

  return (
    <AppLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* En-tête */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>
            {t.screening.title}
          </h1>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>{t.screening.subtitle}</p>
        </div>

        {/* Onglets */}
        <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button key={key} onClick={() => setTab(key)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 14px",
                fontSize: 11, fontFamily: C.mono,
                borderBottom: `2px solid ${active ? C.gold : "transparent"}`,
                color: active ? C.gold : C.text3,
                background: "none", border: "none",
                cursor: "pointer", transition: "color 0.15s",
                marginBottom: -1,
              }}>
                <Icon size={12} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Contenu */}
        {tab === "search"  && <SearchTab canReview={canReview} />}
        {tab === "batch"   && <BatchTab canReview={canReview} />}
        {tab === "pending" && (canReview
          ? <PendingTab />
          : <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text4, textAlign: "center", padding: "40px 0" }}>{t.screening.accessReserved}</p>
        )}
        {tab === "lists"   && <ListsTab canAdmin={canAdmin} />}
        {tab === "custom"  && <CustomListTab canEdit={canEdit} />}
      </div>
    </AppLayout>
  );
}

// ─── Onglet Recherche ─────────────────────────────────────────────────────────

function SearchTab({ canReview }: { canReview: boolean }) {
  const { t } = useI18n();
  const [customerId, setCustomerId]     = useState("");
  const [customerName, setCustomerName] = useState("");
  const [reviewTarget, setReviewTarget] = useState<{ id: number; label: string } | null>(null);
  const [showHistory, setShowHistory]   = useState(false);

  const runMutation    = trpc.screening.run.useMutation();
  const reviewMutation = trpc.screening.review.useMutation({
    onSuccess: () => { setReviewTarget(null); runMutation.reset(); },
  });
  const { data: history, refetch: refetchHistory } = trpc.screening.getByCustomer.useQuery(
    { customerId: parseInt(customerId) || 0 },
    { enabled: showHistory && !!customerId && parseInt(customerId) > 0, retry: false }
  );

  const result   = runMutation.data;
  const hasMatch = result?.status && result.status !== "CLEAR";

  function handleRun() {
    runMutation.mutate({ customerId: parseInt(customerId), customerName });
    setShowHistory(false);
  }

  const scoreColor = (s: number) => s >= 85 ? C.red : s >= 70 ? C.amber : C.green;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Formulaire */}
      <Card title="Lancer un screening individuel">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Input label={`${t.screening.customerId} *`} type="number" value={customerId}
            placeholder="Ex : 42"
            onChange={e => setCustomerId((e as React.ChangeEvent<HTMLInputElement>).target.value)} />
          <Input label={t.screening.fullNameRequired} value={customerName}
            placeholder={t.screening.namePh}
            onChange={e => setCustomerName((e as React.ChangeEvent<HTMLInputElement>).target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={handleRun} disabled={!customerId || customerName.length < 2 || runMutation.isPending}>
            <Search size={12} />
            {runMutation.isPending ? t.common.loading : t.screening.runScreening}
          </Btn>
          {customerId && parseInt(customerId) > 0 && (
            <Btn variant="ghost" onClick={() => { setShowHistory(v => !v); refetchHistory(); }}>
              <History size={12} />
              Historique
            </Btn>
          )}
        </div>
      </Card>

      {/* Résultat */}
      {result && (
        <Card title={t.screening.result} right={
          canReview && result.status !== "CLEAR" && (
            <Btn variant="danger"
              onClick={() => setReviewTarget({ id: result.sanctionsResult.id, label: `Client #${customerId}` })}>
              Réviser
            </Btn>
          )
        }>
          {/* Statut global */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
            borderRadius: 8, marginBottom: 14,
            background: hasMatch ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)",
            border: `1px solid ${hasMatch ? "rgba(248,113,113,0.25)" : "rgba(52,211,153,0.25)"}`,
          }}>
            {hasMatch
              ? <ShieldAlert size={22} style={{ color: C.red, flexShrink: 0 }} />
              : <ShieldCheck size={22} style={{ color: C.green, flexShrink: 0 }} />}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: hasMatch ? C.red : C.green, margin: "0 0 2px" }}>
                {hasMatch ? t.screening.matchDetected : t.screening.noMatchDetected}
              </p>
              <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>
                Statut : {result.status}
              </p>
            </div>
            <Badge label={result.status} variant="status" />
          </div>

          {/* Détails match */}
          {result.sanctionsResult && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Entité correspondante", value: result.sanctionsResult.matchedEntity ?? "—" },
                { label: "Score de correspondance",
                  value: result.sanctionsResult.matchScore !== undefined
                    ? `${result.sanctionsResult.matchScore} / 100` : "—",
                  color: result.sanctionsResult.matchScore !== undefined
                    ? scoreColor(result.sanctionsResult.matchScore) : undefined },
                { label: "Source de la liste", value: result.sanctionsResult.listSource ?? "—" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: C.hover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.13em", textTransform: "uppercase", color: C.text3, margin: "0 0 6px" }}>{label}</p>
                  <p style={{ fontSize: 14, fontWeight: 600, fontFamily: C.mono, color: color ?? C.text1, margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Breakdown par source */}
          {(() => {
            const details = result.sanctionsResult?.details as Record<string, unknown> | null;
            const bySource = details?.bySource as Record<string, { score: number; matched: boolean; entity?: string }> | undefined;
            return bySource && Object.keys(bySource).length > 0 ? (
            <div>
              <p style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.14em", textTransform: "uppercase", color: C.text3, margin: "0 0 8px" }}>
                Détail par source
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(bySource).map(([src, info]) => (
                  <div key={src} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 10px", borderRadius: 6,
                    background: info.matched ? "rgba(248,113,113,0.06)" : C.hover,
                    border: `1px solid ${info.matched ? "rgba(248,113,113,0.2)" : C.border}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: info.matched ? C.red : C.green, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text2 }}>{src}</span>
                      {info.entity && <span style={{ fontSize: 10, fontFamily: C.mono, color: C.red }}>→ {info.entity}</span>}
                    </div>
                    <span style={{ fontSize: 11, fontFamily: C.mono, color: scoreColor(info.score), fontWeight: 600 }}>
                      {info.score}/100
                    </span>
                  </div>
                ))}
              </div>
            </div>
            ) : null;
          })()}
        </Card>
      )}

      {/* Historique client */}
      {showHistory && history && (
        <Card title={`Historique — Client #${customerId}`} right={
          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{history.length} résultat(s)</span>
        }>
          {!history.length ? (
            <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text4, textAlign: "center", padding: "16px 0" }}>Aucun screening antérieur</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {history.map((s: {
                id: number; screeningType: string; status: string;
                matchScore: number; matchedEntity: string | null;
                listSource: string | null; decision: string; createdAt: Date;
              }) => (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  padding: "10px 0", borderBottom: `1px solid ${C.border}`,
                }}>
                  <div>
                    <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text1, margin: "0 0 2px" }}>
                      {s.matchedEntity ?? "Aucune correspondance"}
                      {s.listSource && <span style={{ color: C.text3, marginLeft: 8 }}>{s.listSource}</span>}
                    </p>
                    <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>
                      {s.screeningType} · {formatRelative(s.createdAt)}
                      {s.matchScore > 0 && <span style={{ marginLeft: 8, color: scoreColor(s.matchScore) }}>score {s.matchScore}/100</span>}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <Badge label={s.status} variant="status" />
                    {s.decision !== "PENDING" && <Badge label={s.decision} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {reviewTarget && (
        <ReviewModal target={reviewTarget} onClose={() => setReviewTarget(null)} isPending={reviewMutation.isPending}
          onConfirm={(decision, reason) => reviewMutation.mutate({ id: reviewTarget.id, decision, reason })} />
      )}
    </div>
  );
}

// ─── Onglet Batch ─────────────────────────────────────────────────────────────

function BatchTab({ canReview }: { canReview: boolean }) {
  const utils = trpc.useUtils();
  const [filters, setFilters] = useState({ onlyHighRisk: false, onlyPep: false, sinceLastScreen: false });
  const [jobId, setJobId]     = useState<string | null>(null);

  const batchMutation = trpc.screening.batchScreen.useMutation({
    onSuccess: (data: { jobId: string }) => setJobId(data.jobId),
  });
  const { data: status } = trpc.screening.batchStatus.useQuery(
    { jobId: jobId ?? "" },
    { enabled: !!jobId, refetchInterval: jobId ? 3000 : false }
  );

  const isDone = status?.status === "done" || status?.status === "failed";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Filtres batch */}
      <Card title="Paramètres du screening batch">
        <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 16px" }}>
          Lance un screening en arrière-plan sur tous les clients correspondant aux critères sélectionnés.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {([
            { key: "onlyHighRisk" as const,    label: "Clients haut risque uniquement (CRITICAL / HIGH)" },
            { key: "onlyPep" as const,         label: "Clients PPE (Personnes Politiquement Exposées)" },
            { key: "sinceLastScreen" as const, label: "Uniquement les non-screenés depuis 30 jours" },
          ]).map(({ key, label }) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div onClick={() => setFilters(f => ({ ...f, [key]: !f[key] }))} style={{
                width: 18, height: 18, borderRadius: 4,
                background: filters[key] ? C.gold : C.hover,
                border: `1px solid ${filters[key] ? C.gold : C.border2}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}>
                {filters[key] && <CheckCircle size={12} style={{ color: "#1A2B4B" }} />}
              </div>
              <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text2 }}>{label}</span>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => batchMutation.mutate({
              onlyHighRisk: filters.onlyHighRisk,
              onlyPep:      filters.onlyPep,
              sinceLastScreen: filters.sinceLastScreen ? 30 : undefined,
            })} disabled={batchMutation.isPending || (!!jobId && !isDone)}>
            <Layers size={12} />
            {batchMutation.isPending ? "Lancement…" : "Lancer le batch"}
          </Btn>
          {jobId && isDone && (
            <Btn variant="ghost" onClick={() => { setJobId(null); batchMutation.reset(); utils.screening.getPending.invalidate(); }}>
              <RefreshCw size={12} />
              Nouveau batch
            </Btn>
          )}
        </div>
      </Card>

      {/* Statut batch */}
      {jobId && status && (() => {
        const r = status.result as { total?: number; processed?: number; matches?: number } | null;
        const total     = r?.total     ?? 0;
        const processed = r?.processed ?? 0;
        const matches   = r?.matches   ?? 0;
        return (
        <Card title="Progression du batch" right={
          !isDone && <RefreshCw size={12} style={{ color: C.gold, animation: "spin 1s linear infinite" }} />
        }>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Total clients", value: String(total || "—") },
              { label: "Traités",       value: String(processed || "—") },
              { label: "Matchs",        value: String(matches || "—"), color: matches > 0 ? C.red : undefined },
              { label: "Statut",        value: status.status ?? "—",
                color: status.status === "done" ? C.green : status.status === "failed" ? C.red : C.amber },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: C.hover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                <p style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.13em", textTransform: "uppercase", color: C.text3, margin: "0 0 6px" }}>{label}</p>
                <p style={{ fontSize: 18, fontWeight: 600, fontFamily: C.mono, color: color ?? C.text1, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Barre de progression */}
          {total > 0 && (
            <div>
              <div style={{ height: 6, background: C.hover, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                <div style={{
                  height: "100%", borderRadius: 3, transition: "width 0.5s",
                  background: status.status === "failed" ? C.red : C.gold,
                  width: `${Math.round((processed / total) * 100)}%`,
                }} />
              </div>
              <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
                {Math.round((processed / total) * 100)}% — {processed}/{total} clients traités
              </p>
            </div>
          )}

          {isDone && status.status === "done" && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 8 }}>
              <p style={{ fontSize: 12, fontFamily: C.mono, color: C.green, margin: 0 }}>
                ✓ Batch terminé — {matches} nouveau(x) match(s) détecté(s). Consultez l'onglet « En attente » pour réviser.
              </p>
            </div>
          )}
        </Card>
        );
      })()}

      {!canReview && (
        <div style={{ padding: "12px 16px", background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.2)", borderRadius: 8 }}>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.amber, margin: 0 }}>
            ⚠ Vous pouvez lancer un batch, mais la révision des résultats nécessite le rôle Compliance Officer.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Onglet En attente ────────────────────────────────────────────────────────

function PendingTab() {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [reviewTarget, setReviewTarget] = useState<{ id: number; label: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "MATCH" | "REVIEW">("ALL");
  const [sortByScore,  setSortByScore]  = useState(true);

  const { data, isLoading } = trpc.screening.getPending.useQuery(undefined, { retry: false });
  const reviewMutation = trpc.screening.review.useMutation({
    onSuccess: () => { utils.screening.getPending.invalidate(); setReviewTarget(null); },
  });

  type PendingRow = {
    id: number; customerId: number; screeningType: string;
    status: string; matchScore: number; matchedEntity: string | null;
    listSource: string | null; decision: string; createdAt: Date;
  };

  const filtered = (data as PendingRow[] ?? [])
    .filter(s => filterStatus === "ALL" || s.status === filterStatus)
    .sort((a, b) => sortByScore ? b.matchScore - a.matchScore : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const scoreColor = (s: number) => s >= 85 ? C.red : s >= 70 ? C.amber : C.green;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* KPIs + filtres */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <StatCard label="Total en attente" value={String(data?.length ?? "—")} icon={AlertTriangle}
            accent={(data?.length ?? 0) > 0 ? "warning" : "default"} />
          <StatCard label="Matchs confirmés" value={String((data as PendingRow[] ?? []).filter(s => s.status === "MATCH").length)} icon={ShieldAlert}
            accent={(data as PendingRow[] ?? []).filter(s => s.status === "MATCH").length > 0 ? "danger" : "default"} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["ALL", "MATCH", "REVIEW"] as const).map(f => (
            <button key={f} onClick={() => setFilterStatus(f)} style={{
              padding: "6px 12px", borderRadius: 6, fontSize: 10, fontFamily: C.mono,
              cursor: "pointer", transition: "all 0.15s",
              background: filterStatus === f ? "rgba(212,175,55,0.12)" : "transparent",
              border: `1px solid ${filterStatus === f ? "rgba(212,175,55,0.35)" : C.border2}`,
              color: filterStatus === f ? C.gold : C.text3,
            }}>{f}</button>
          ))}
          <button onClick={() => setSortByScore(v => !v)} style={{
            padding: "6px 12px", borderRadius: 6, fontSize: 10, fontFamily: C.mono,
            cursor: "pointer", background: "transparent", border: `1px solid ${C.border2}`, color: C.text3,
          }}>
            Trier : {sortByScore ? "Score ↓" : "Date ↓"}
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ height: 64, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, opacity: 0.5 }} />
      ) : !filtered.length ? (
        <div style={{ textAlign: "center", padding: "48px 0", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <ShieldCheck size={28} style={{ color: C.border2, marginBottom: 10 }} />
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text4 }}>{t.common.noResults}</p>
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 90px 90px 100px 80px", gap: 12 }}>
            {["Client / Entité", "Type", "Source", "Score", "Action"].map(h => (
              <span key={h} style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.14em", textTransform: "uppercase", color: C.text3 }}>{h}</span>
            ))}
          </div>
          {filtered.map((s) => (
            <div key={s.id} style={{
              display: "grid", gridTemplateColumns: "1fr 90px 90px 100px 80px", gap: 12,
              padding: "11px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", transition: "background 0.15s",
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.hover)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              <div>
                <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text1, margin: "0 0 2px" }}>
                  Client #{s.customerId}
                  {s.matchedEntity && <span style={{ color: C.red, marginLeft: 6 }}>→ {s.matchedEntity}</span>}
                </p>
                <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>
                  {formatRelative(s.createdAt)}
                </p>
              </div>
              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text2 }}>{s.screeningType}</span>
              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text2 }}>{s.listSource ?? "—"}</span>
              <span style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: s.matchScore > 0 ? scoreColor(s.matchScore) : C.text3 }}>
                {s.matchScore > 0 ? `${s.matchScore}/100` : "—"}
              </span>
              <button onClick={() => setReviewTarget({ id: s.id, label: `Client #${s.customerId}` })}
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: C.mono, color: C.gold, background: "none", border: "none", cursor: "pointer" }}>
                Réviser <ArrowUpRight size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {reviewTarget && (
        <ReviewModal target={reviewTarget} onClose={() => setReviewTarget(null)} isPending={reviewMutation.isPending}
          onConfirm={(decision, reason) => reviewMutation.mutate({ id: reviewTarget.id, decision, reason })} />
      )}
    </div>
  );
}

// ─── Onglet État des listes ───────────────────────────────────────────────────

const SOURCE_META: Record<string, { color: string; label: string; description: string }> = {
  OFAC:   { color: C.blue,   label: "OFAC",  description: "US Treasury — ~17 000 entités" },
  EU:     { color: "var(--wr-purple, #a78bfa)", label: "EU", description: "Commission Européenne — ~4 500 entités" },
  UN:     { color: "var(--wr-cyan, #22d3ee)",   label: "ONU", description: "Conseil de Sécurité ONU — ~750 entités" },
  UK:     { color: C.green,  label: "UK",    description: "HM Treasury FCDO — ~3 000 entités" },
  PEP:    { color: C.amber,  label: "PEP",   description: "OpenSanctions — ~1 700 000 PPE" },
  BAM:    { color: C.red,    label: "BAM",   description: "ANRF Maroc — liste nationale" },
  CUSTOM: { color: C.gold,   label: "LOCAL", description: "Liste personnalisée locale" },
};

type ProviderStatus = {
  provider: string; count: number; lastUpdate: string | null;
  inCache: boolean; ageHours: number | null; isStale: boolean;
};

function ListsTab({ canAdmin }: { canAdmin: boolean }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.screening.listsStatus.useQuery(undefined, { refetchInterval: 60_000 });
  const refreshMutation = trpc.screening.forceRefresh.useMutation({
    onSuccess: () => utils.screening.listsStatus.invalidate(),
  });

  const staleProviders  = data?.providers.filter((p: ProviderStatus) => p.isStale) ?? [];
  const activeProviders = data?.providers.filter((p: ProviderStatus) => p.inCache) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Alerte fraîcheur */}
      {data?.anyStale && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.25)", borderRadius: 8 }}>
          <AlertOctagon size={14} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 12, fontFamily: C.mono, color: C.amber, fontWeight: 600, margin: "0 0 3px" }}>
              {staleProviders.length} liste{staleProviders.length > 1 ? "s" : ""} non mises à jour récemment
            </p>
            <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>
              {staleProviders.map((p: ProviderStatus) => `${p.provider} (${p.ageHours !== null ? `${p.ageHours}h` : "inconnue"})`).join(" · ")}
              {canAdmin && " — utilisez « Forcer la mise à jour »"}
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <StatCard label="Entités totales"       value={data ? data.total.toLocaleString("fr-FR") : "—"} icon={Database} />
        <StatCard label={t.screening.activeLists} value={data ? `${activeProviders.length} / ${data.providers.length}` : "—"} icon={Shield} />
        <StatCard label="Dernière mise à jour"  value={data?.updatedAt ? formatRelative(new Date(data.updatedAt)) : "—"} icon={Clock} />
      </div>

      {/* Tableau des sources */}
      <Card title={t.screening.sanctionSources} right={
        canAdmin && (
          <Btn onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} variant="ghost">
            <RefreshCw size={11} style={{ animation: refreshMutation.isPending ? "spin 1s linear infinite" : "none" }} />
            {refreshMutation.isPending ? t.common.loading : t.screening.forceRefresh}
          </Btn>
        )
      }>
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
            <div style={{ width: 20, height: 20, border: "2px solid rgba(212,175,55,0.3)", borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {data?.providers.map((p: ProviderStatus) => {
              const meta = SOURCE_META[p.provider];
              const statusColor = !p.inCache ? C.text4 : p.isStale ? C.amber : C.green;
              const statusLabel = !p.inCache ? t.screening.notLoaded : p.isStale ? "Stale" : "Actif";
              return (
                <div key={p.provider} style={{
                  display: "grid", gridTemplateColumns: "60px 1fr 160px",
                  alignItems: "center", gap: 16,
                  padding: "12px 0", borderBottom: `1px solid ${C.border}`,
                  background: p.isStale ? "rgba(251,146,60,0.03)" : "transparent",
                }}>
                  {/* Badge */}
                  <span style={{ fontSize: 10, fontFamily: C.mono, fontWeight: 700, padding: "3px 8px", borderRadius: 5, textAlign: "center", color: meta?.color ?? C.text3, background: `${meta?.color ?? C.text3}15`, border: `1px solid ${meta?.color ?? C.text3}30` }}>
                    {meta?.label ?? p.provider}
                  </span>
                  {/* Info */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 3 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: C.mono, color: statusColor }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
                        {statusLabel}
                      </span>
                      {p.count > 0 && (
                        <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text1, fontWeight: 600 }}>
                          {p.count.toLocaleString("fr-FR")} <span style={{ color: C.text3, fontWeight: 400, fontSize: 10 }}>entités</span>
                        </span>
                      )}
                      {p.ageHours !== null && (
                        <span style={{ fontSize: 10, fontFamily: C.mono, color: p.isStale ? C.amber : C.text4 }}>
                          {p.ageHours < 1 ? "< 1h" : `${p.ageHours}h`}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, margin: 0 }}>
                      {p.lastUpdate ? `Mis à jour ${formatRelative(new Date(p.lastUpdate))}` : t.screening.neverLoaded}
                    </p>
                  </div>
                  {/* Description */}
                  <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, textAlign: "right", margin: 0 }}>{meta?.description}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Résultat refresh */}
      {refreshMutation.data && (
        <Card title="Résultat de la mise à jour">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {refreshMutation.data.statuses.map((s: { provider: string; count: number; fromCache: boolean; error?: string }) => (
              <div key={s.provider} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: C.hover, borderRadius: 6, border: `1px solid ${s.error ? "rgba(248,113,113,0.2)" : C.border}` }}>
                {s.error
                  ? <XCircle size={12} style={{ color: C.red }} />
                  : s.fromCache ? <Database size={12} style={{ color: C.amber }} />
                  : <CheckCircle size={12} style={{ color: C.green }} />}
                <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text2 }}>{s.provider}</span>
                <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text1, fontWeight: 600, marginLeft: "auto" }}>
                  {s.count.toLocaleString("fr-FR")}
                </span>
                {s.error && <span style={{ fontSize: 10, fontFamily: C.mono, color: C.amber }}>{s.error}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Note technique */}
      <div style={{ padding: "12px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, margin: 0, lineHeight: 1.6 }}>
          Rechargement automatique chaque nuit à 02:00 UTC (TTL cache 23h). PEP : ~1 700 000 PPE via OpenSanctions.
          BAM/ANRF : configurer <span style={{ color: C.blue }}>BAM_SANCTIONS_URL</span> dans .env pour activer la liste nationale marocaine.
          En cas d'échec d'une source, le cache précédent est conservé automatiquement.
        </p>
      </div>
    </div>
  );
}

// ─── Onglet Liste personnalisée ───────────────────────────────────────────────

type CustomEntry = {
  id: string; name: string; aliases: string[];
  country: string; reason: string; addedAt: string; addedBy: number | string;
};

const COUNTRIES = [
  { code: "", label: "Tous pays" }, { code: "AF", label: "Afghanistan" },
  { code: "BY", label: "Biélorussie" }, { code: "CF", label: "Centrafrique" },
  { code: "CD", label: "Congo (RDC)" }, { code: "CU", label: "Cuba" },
  { code: "KP", label: "Corée du Nord" }, { code: "IR", label: "Iran" },
  { code: "IQ", label: "Irak" }, { code: "LY", label: "Libye" },
  { code: "ML", label: "Mali" }, { code: "MM", label: "Myanmar" },
  { code: "NI", label: "Nicaragua" }, { code: "RU", label: "Russie" },
  { code: "SO", label: "Somalie" }, { code: "SS", label: "Soudan du Sud" },
  { code: "SY", label: "Syrie" }, { code: "VE", label: "Venezuela" },
  { code: "YE", label: "Yémen" }, { code: "ZW", label: "Zimbabwe" },
];

function CustomListTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const { data: entries, isLoading } = trpc.screening.getCustomList.useQuery();
  const addMutation    = trpc.screening.addCustomEntry.useMutation({
    onSuccess: () => { utils.screening.getCustomList.invalidate(); setShowAdd(false); setForm({ name: "", aliases: "", country: "", reason: "" }); },
  });
  const removeMutation = trpc.screening.removeCustomEntry.useMutation({
    onSuccess: () => utils.screening.getCustomList.invalidate(),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch]   = useState("");
  const [form, setForm]       = useState({ name: "", aliases: "", country: "", reason: "" });

  const filtered = ((entries as CustomEntry[]) ?? []).filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.aliases.some(a => a.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Barre d'actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Input placeholder="Rechercher…" value={search} style={{ width: 220 }}
            onChange={e => setSearch((e as React.ChangeEvent<HTMLInputElement>).target.value)} />
          <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text3 }}>
            {filtered.length} entrée{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        {canEdit && (
          <Btn onClick={() => setShowAdd(true)}>
            <Plus size={12} /> Ajouter une entrée
          </Btn>
        )}
      </div>

      {/* Liste */}
      {isLoading ? (
        <div style={{ height: 80, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, opacity: 0.5 }} />
      ) : !filtered.length ? (
        <div style={{ textAlign: "center", padding: "48px 0", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <Shield size={28} style={{ color: C.border2, marginBottom: 10 }} />
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text4 }}>
            {search ? "Aucun résultat" : t.screening.noCustomEntries}
          </p>
          {!search && <p style={{ fontSize: 10, fontFamily: C.mono, color: C.border, marginTop: 4 }}>{t.screening.addEntryHint}</p>}
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {filtered.map((e, i) => (
            <div key={e.id} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 16px",
              borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none",
              transition: "background 0.15s",
            }}
            onMouseEnter={ev => ((ev.currentTarget as HTMLElement).style.background = C.hover)}
            onMouseLeave={ev => ((ev.currentTarget as HTMLElement).style.background = "transparent")}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontFamily: C.mono, fontWeight: 600, color: C.text1 }}>{e.name}</span>
                  {e.country && (
                    <span style={{ fontSize: 9, fontFamily: C.mono, padding: "2px 6px", borderRadius: 4, background: C.hover, border: `1px solid ${C.border2}`, color: C.text3 }}>
                      {e.country}
                    </span>
                  )}
                  <span style={{ fontSize: 9, fontFamily: C.mono, padding: "2px 6px", borderRadius: 4, background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", color: C.gold }}>
                    CUSTOM
                  </span>
                </div>
                {e.aliases.length > 0 && (
                  <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: "0 0 2px" }}>
                    Aliases : {e.aliases.join(", ")}
                  </p>
                )}
                <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text2, margin: "0 0 2px" }}>{e.reason}</p>
                <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, margin: 0 }}>
                  Ajouté {formatRelative(new Date(e.addedAt))}
                </p>
              </div>
              {canEdit && (
                <button onClick={() => removeMutation.mutate({ id: e.id })} disabled={removeMutation.isPending}
                  style={{ padding: "6px", borderRadius: 6, background: "none", border: "none", cursor: "pointer", color: C.text4, transition: "color 0.15s" }}
                  onMouseEnter={ev => ((ev.currentTarget as HTMLElement).style.color = C.red)}
                  onMouseLeave={ev => ((ev.currentTarget as HTMLElement).style.color = C.text4)}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal ajout */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: "var(--wr-sidebar-bg, #0d1117)", border: `1px solid ${C.border2}`, borderRadius: 12, width: "100%", maxWidth: 440 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 14, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 3px" }}>Nouvelle entrée personnalisée</p>
              <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, margin: 0 }}>Sera incluse dans tous les screenings futurs</p>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <Input label="Nom" required value={form.name} placeholder="Ex : Jean Dupont, Société XYZ"
                onChange={e => setForm(f => ({ ...f, name: (e as React.ChangeEvent<HTMLInputElement>).target.value }))} />
              <Input label="Aliases (séparés par virgules)" value={form.aliases} placeholder="Ex : J. Dupont, Dupont Jean"
                onChange={e => setForm(f => ({ ...f, aliases: (e as React.ChangeEvent<HTMLInputElement>).target.value }))} />
              <div>
                <p style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3, marginBottom: 6 }}>Pays (optionnel)</p>
                <select value={form.country}
                  onChange={e => setForm(f => ({ ...f, country: (e as React.ChangeEvent<HTMLSelectElement>).target.value }))}
                  style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none" }}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
              <Textarea label="Motif de surveillance" required rows={2} value={form.reason}
                placeholder="Ex : Suspicion de fraude documentée, Client PEP identifié…"
                onChange={e => setForm(f => ({ ...f, reason: (e as React.ChangeEvent<HTMLTextAreaElement>).target.value }))} />
              {addMutation.error && (
                <p style={{ fontSize: 11, fontFamily: C.mono, color: C.red, margin: 0 }}>{addMutation.error.message}</p>
              )}
            </div>
            <div style={{ padding: "0 20px 16px", display: "flex", gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowAdd(false); setForm({ name: "", aliases: "", country: "", reason: "" }); }} style={{ flex: 1, justifyContent: "center" }}>Annuler</Btn>
              <Btn disabled={form.name.length < 2 || form.reason.length < 5 || addMutation.isPending}
                onClick={() => addMutation.mutate({ name: form.name, aliases: form.aliases.split(",").map((s: string) => s.trim()).filter(Boolean), ...(form.country ? { country: form.country } : {}), reason: form.reason })}
                style={{ flex: 1, justifyContent: "center" }}>
                {addMutation.isPending ? "Ajout…" : "Ajouter"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
