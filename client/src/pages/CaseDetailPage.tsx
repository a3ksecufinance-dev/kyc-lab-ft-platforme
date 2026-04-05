import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatDate, formatRelative } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { useI18n } from "../hooks/useI18n";
import {
  ArrowLeft, Clock, User, ShieldAlert, FileText,
  CheckCircle, AlertTriangle, ChevronRight, Edit3,
} from "lucide-react";

const C = {
  surface: "var(--wr-card)",
  border:  "var(--wr-border)",
  border2: "var(--wr-border2)",
  text1:   "var(--wr-text-1)",
  text2:   "var(--wr-text-2)",
  text3:   "var(--wr-text-3)",
  text4:   "var(--wr-text-4)",
  red:     "var(--wr-red)",
  amber:   "var(--wr-amber)",
  green:   "var(--wr-green)",
  blue:    "var(--wr-blue)",
  mono:    "var(--wr-font-mono)",
  serif:   "var(--wr-font-serif)",
  hover:   "var(--wr-hover)",
};

const LABEL: React.CSSProperties = {
  fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em",
  textTransform: "uppercase", color: C.text3, marginBottom: 6, display: "block",
};
const INPUT: React.CSSProperties = {
  width: "100%", background: C.hover, border: `1px solid ${C.border2}`,
  borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono,
  color: C.text1, outline: "none", boxSizing: "border-box",
};
const SECTION: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: 20, marginBottom: 16,
};

const STATUS_NEXT: Record<string, string[]> = {
  OPEN:                ["UNDER_INVESTIGATION", "ESCALATED", "CLOSED"],
  UNDER_INVESTIGATION: ["PENDING_APPROVAL",    "ESCALATED", "CLOSED"],
  PENDING_APPROVAL:    ["CLOSED",              "ESCALATED"],
  ESCALATED:           ["UNDER_INVESTIGATION", "CLOSED"],
  SAR_SUBMITTED:       ["CLOSED"],
  CLOSED:              [],
};

const STATUS_LABELS: Record<string, string> = {
  OPEN:                "Ouvert",
  UNDER_INVESTIGATION: "En investigation",
  PENDING_APPROVAL:    "En approbation",
  ESCALATED:           "Escaladé",
  SAR_SUBMITTED:       "SAR soumis",
  CLOSED:              "Fermé",
};

const DECISION_LABELS: Record<string, string> = {
  PENDING:          "En attente",
  CLOSED_NO_ACTION: "Fermé — aucune action",
  ESCALATED:        "Escaladé",
  SAR_FILED:        "SAR déposé",
  STR_FILED:        "STR déposé",
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  CASE_OPENED:         <FileText size={12} />,
  CASE_STATUS_CHANGED: <ChevronRight size={12} />,
  CASE_ASSIGNED:       <User size={12} />,
  CASE_DECISION_MADE:  <CheckCircle size={12} />,
  NOTE_ADDED:          <Edit3 size={12} />,
};

export function CaseDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const caseId = parseInt(id ?? "0");
  const isSupervisor = hasRole(user, "supervisor");

  // ─── Queries ───────────────────────────────────────────────────────────────
  const { data: c, isLoading, error } = trpc.cases.getById.useQuery(
    { id: caseId }, { enabled: caseId > 0 }
  );
  const { data: timeline } = trpc.cases.getTimeline.useQuery(
    { id: caseId }, { enabled: caseId > 0 }
  );

  // ─── Mutations ────────────────────────────────────────────────────────────
  const invalidate = () => {
    utils.cases.getById.invalidate({ id: caseId });
    utils.cases.getTimeline.invalidate({ id: caseId });
    utils.cases.list.invalidate();
  };

  const updateStatusMut = trpc.cases.updateStatus.useMutation({ onSuccess: invalidate });
  const assignMut       = trpc.cases.assign.useMutation({ onSuccess: invalidate });
  const findingsMut     = trpc.cases.addFindings.useMutation({ onSuccess: invalidate });
  const decideMut       = trpc.cases.decide.useMutation({ onSuccess: invalidate });

  // ─── Local state ──────────────────────────────────────────────────────────
  const [statusNote, setStatusNote]       = useState("");
  const [nextStatus, setNextStatus]       = useState("");
  const [findingsText, setFindingsText]   = useState("");
  const [editFindings, setEditFindings]   = useState(false);
  const [assignTo, setAssignTo]           = useState("");
  const [assignSuper, setAssignSuper]     = useState("");
  const [decision, setDecision]           = useState<"CLOSED_NO_ACTION" | "ESCALATED" | "SAR_FILED" | "STR_FILED">("CLOSED_NO_ACTION");
  const [decisionNotes, setDecisionNotes] = useState("");

  if (isLoading) {
    return (
      <AppLayout>
        <div style={{ padding: 40, fontFamily: C.mono, fontSize: 12, color: C.text3 }}>
          {t.common.loading}
        </div>
      </AppLayout>
    );
  }
  if (error || !c) {
    return (
      <AppLayout>
        <div style={{ padding: 40, fontFamily: C.mono, fontSize: 12, color: C.red }}>
          Dossier introuvable.
        </div>
      </AppLayout>
    );
  }

  const availableNext = STATUS_NEXT[c.status] ?? [];
  const isClosed = c.status === "CLOSED";

  return (
    <AppLayout>
      {/* ─── Breadcrumb ─────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate("/cases")}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: C.mono, fontSize: 11, color: C.text3, padding: 0, marginBottom: 20 }}
      >
        <ArrowLeft size={13} /> {t.cases.title}
      </button>

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div style={{ ...SECTION, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.blue }}>{c.caseId}</span>
              <Badge label={c.status} variant="status" />
              <Badge label={c.severity} variant="risk" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 400, fontFamily: C.serif, color: C.text1, margin: "0 0 8px", letterSpacing: "-0.3px" }}>
              {c.title}
            </h1>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text3 }}>
                Client <a href={`/customers/${c.customerId}`} style={{ color: C.blue }}>#{c.customerId}</a>
              </span>
              {c.assignedTo && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: C.mono, fontSize: 11, color: C.text3 }}>
                  <User size={11} /> Analyste #{c.assignedTo}
                </span>
              )}
              {c.dueDate && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: C.mono, fontSize: 11, color: new Date(c.dueDate) < new Date() && !isClosed ? C.red : C.text3 }}>
                  <Clock size={11} /> Échéance : {formatDate(c.dueDate)}
                </span>
              )}
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text4 }}>
                Créé {formatRelative(c.createdAt)}
              </span>
            </div>
          </div>
          {c.decision !== "PENDING" && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Décision</div>
              <Badge label={c.decision} variant="status" />
            </div>
          )}
        </div>
      </div>

      {/* ─── Main layout ──────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>

        {/* LEFT COLUMN */}
        <div>
          {/* Description */}
          {c.description && (
            <div style={SECTION}>
              <div style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3, marginBottom: 10 }}>Description</div>
              <p style={{ fontSize: 12, color: C.text2, margin: 0, lineHeight: 1.6 }}>{c.description}</p>
            </div>
          )}

          {/* Findings */}
          <div style={SECTION}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase", color: C.text3 }}>
                Conclusions (Findings)
              </div>
              {!isClosed && !editFindings && (
                <button
                  onClick={() => { setEditFindings(true); setFindingsText(c.findings ?? ""); }}
                  style={{ fontSize: 11, fontFamily: C.mono, color: C.blue, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <Edit3 size={11} /> {c.findings ? "Modifier" : "Ajouter"}
                </button>
              )}
            </div>

            {editFindings ? (
              <div>
                <textarea
                  value={findingsText}
                  onChange={(e) => setFindingsText(e.target.value)}
                  rows={6}
                  placeholder="Décrivez les faits observés, preuves collectées, résultat de l'investigation… (min 20 caractères)"
                  style={{ ...INPUT, resize: "vertical", marginBottom: 10 }}
                />
                {findingsMut.error && (
                  <p style={{ fontSize: 11, color: C.red, fontFamily: C.mono, marginBottom: 8 }}>{findingsMut.error.message}</p>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setEditFindings(false)}
                    style={{ flex: 1, padding: "7px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    disabled={findingsText.length < 20 || findingsMut.isPending}
                    onClick={() => findingsMut.mutate({ id: caseId, findings: findingsText }, {
                      onSuccess: () => setEditFindings(false),
                    })}
                    style={{ flex: 2, padding: "7px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: findingsText.length < 20 ? 0.4 : 1 }}
                  >
                    {findingsMut.isPending ? t.common.loading : "Enregistrer les conclusions"}
                  </button>
                </div>
              </div>
            ) : c.findings ? (
              <pre style={{ margin: 0, fontSize: 12, color: C.text2, fontFamily: "inherit", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{c.findings}</pre>
            ) : (
              <p style={{ fontSize: 12, color: C.text4, fontFamily: C.mono, fontStyle: "italic", margin: 0 }}>
                Aucune conclusion enregistrée.
              </p>
            )}
          </div>

          {/* Decision — supervisor+ */}
          {isSupervisor && !isClosed && (
            <div style={{ ...SECTION, borderColor: `${C.amber}40` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <ShieldAlert size={14} style={{ color: C.amber }} />
                <div style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.amber }}>
                  Décision finale (superviseur)
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={LABEL}>Décision *</label>
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as typeof decision)}
                    style={INPUT}
                  >
                    <option value="CLOSED_NO_ACTION">Fermé — aucune action</option>
                    <option value="ESCALATED">Escaladé</option>
                    <option value="SAR_FILED">SAR déposé</option>
                    <option value="STR_FILED">STR déposé</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={LABEL}>Notes de décision * (min 20 caractères)</label>
                <textarea
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  rows={3}
                  placeholder="Justification de la décision, références réglementaires…"
                  style={{ ...INPUT, resize: "none" }}
                />
              </div>
              {decideMut.error && (
                <p style={{ fontSize: 11, color: C.red, fontFamily: C.mono, marginBottom: 8 }}>{decideMut.error.message}</p>
              )}
              <button
                disabled={decisionNotes.length < 20 || decideMut.isPending}
                onClick={() => decideMut.mutate({ id: caseId, decision, decisionNotes })}
                style={{ width: "100%", padding: "9px 0", fontSize: 12, fontFamily: C.mono, background: `${C.amber}14`, border: `1px solid ${C.amber}40`, borderRadius: 7, color: C.amber, cursor: "pointer", opacity: decisionNotes.length < 20 ? 0.4 : 1 }}
              >
                {decideMut.isPending ? t.common.loading : "Confirmer la décision"}
              </button>
            </div>
          )}

          {/* Decision recap if closed */}
          {isClosed && c.decision !== "PENDING" && (
            <div style={{ ...SECTION, borderColor: `${C.green}40` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <CheckCircle size={14} style={{ color: C.green }} />
                <span style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.green }}>
                  Décision enregistrée — {DECISION_LABELS[c.decision]}
                </span>
              </div>
              {c.decisionNotes && (
                <p style={{ fontSize: 12, color: C.text2, margin: 0, lineHeight: 1.6 }}>{c.decisionNotes}</p>
              )}
              {c.decisionAt && (
                <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, marginTop: 8, marginBottom: 0 }}>
                  {formatDate(c.decisionAt)} — par utilisateur #{c.decisionBy}
                </p>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* Change status */}
          {!isClosed && availableNext.length > 0 && (
            <div style={SECTION}>
              <div style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 12 }}>
                Changer le statut
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={LABEL}>Nouveau statut</label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                  style={INPUT}
                >
                  <option value="">— Sélectionner —</option>
                  {availableNext.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={LABEL}>Note (optionnelle)</label>
                <input
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Motif du changement…"
                  style={INPUT}
                />
              </div>
              {updateStatusMut.error && (
                <p style={{ fontSize: 11, color: C.red, fontFamily: C.mono, marginBottom: 8 }}>{updateStatusMut.error.message}</p>
              )}
              <button
                disabled={!nextStatus || updateStatusMut.isPending}
                onClick={() => updateStatusMut.mutate(
                  { id: caseId, status: nextStatus as Parameters<typeof updateStatusMut.mutate>[0]["status"], ...(statusNote ? { note: statusNote } : {}) },
                  { onSuccess: () => { setNextStatus(""); setStatusNote(""); } }
                )}
                style={{ width: "100%", padding: "7px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: !nextStatus ? 0.4 : 1 }}
              >
                {updateStatusMut.isPending ? t.common.loading : "Mettre à jour"}
              </button>
            </div>
          )}

          {/* Assign — supervisor+ */}
          {isSupervisor && !isClosed && (
            <div style={SECTION}>
              <div style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 12 }}>
                Assignation
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={LABEL}>ID Analyste *</label>
                <input
                  type="number"
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                  placeholder="ex: 3"
                  style={INPUT}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={LABEL}>ID Superviseur (optionnel)</label>
                <input
                  type="number"
                  value={assignSuper}
                  onChange={(e) => setAssignSuper(e.target.value)}
                  placeholder="ex: 2"
                  style={INPUT}
                />
              </div>
              {assignMut.error && (
                <p style={{ fontSize: 11, color: C.red, fontFamily: C.mono, marginBottom: 8 }}>{assignMut.error.message}</p>
              )}
              <button
                disabled={!assignTo || assignMut.isPending}
                onClick={() => assignMut.mutate(
                  { id: caseId, assignedTo: parseInt(assignTo), ...(assignSuper ? { supervisorId: parseInt(assignSuper) } : {}) },
                  { onSuccess: () => { setAssignTo(""); setAssignSuper(""); } }
                )}
                style={{ width: "100%", padding: "7px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: !assignTo ? 0.4 : 1 }}
              >
                {assignMut.isPending ? t.common.loading : "Assigner"}
              </button>
            </div>
          )}

          {/* Timeline */}
          <div style={SECTION}>
            <div style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 14 }}>
              Timeline
            </div>
            {!timeline || timeline.length === 0 ? (
              <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text4, margin: 0 }}>Aucun événement.</p>
            ) : (
              <div style={{ position: "relative" }}>
                {/* Vertical line */}
                <div style={{ position: "absolute", left: 11, top: 0, bottom: 0, width: 1, background: C.border }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {[...timeline].reverse().map((entry) => (
                    <div key={entry.id} style={{ display: "flex", gap: 12, position: "relative" }}>
                      {/* Dot */}
                      <div style={{ width: 23, height: 23, borderRadius: "50%", background: C.hover, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.text3, zIndex: 1 }}>
                        {ACTION_ICONS[entry.action] ?? <AlertTriangle size={10} />}
                      </div>
                      <div style={{ flex: 1, paddingTop: 2 }}>
                        <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text2, marginBottom: 2 }}>
                          {entry.action.replace(/_/g, " ")}
                        </div>
                        {entry.description && (
                          <p style={{ fontSize: 11, color: C.text3, margin: "0 0 2px" }}>{entry.description}</p>
                        )}
                        <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text4 }}>
                          {formatRelative(entry.createdAt)}
                          {entry.performedBy ? ` — #${entry.performedBy}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
