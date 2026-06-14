/**
 * Dual Control — Principe des 4 yeux (ACPR art.13 / FATF R.20)
 *
 * Phase F — Multi-level approval chains :
 *   - Indicateur de progression multi-niveaux (step dots)
 *   - Configuration des chaînes (admin)
 *   - Gestion des délégations
 *   - Affichage escalade
 */

import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { hasRole } from "../lib/auth";
import { formatDateTime, formatDate } from "../lib/utils";
import {
  GitMerge, CheckCircle, XCircle, Clock, AlertTriangle,
  FileText, FolderOpen, ShieldOff, Wallet, ChevronDown, ChevronUp,
  User, Link2, Settings, ArrowUpCircle, Plus, X, Trash2,
} from "lucide-react";

// ─── Design tokens ──────────────────────────────────────────────────────────

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
  hover:   "var(--wr-hover)",
};

const INPUT: React.CSSProperties = {
  width: "100%", background: C.hover, border: `1px solid ${C.border2}`,
  borderRadius: 6, padding: "7px 10px", fontSize: 12, fontFamily: C.mono,
  color: C.text1, outline: "none", boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em",
  textTransform: "uppercase", color: C.text3, marginBottom: 5, display: "block",
};

// ─── Types ──────────────────────────────────────────────────────────────────

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
type ApprovalAction = "SAR_TRANSMIT" | "CASE_DECIDE" | "CUSTOMER_BLOCK" | "WALLET_SUSPEND";

type ApprovalRequest = {
  id: number;
  action:        ApprovalAction;
  entityType:    string;
  entityId:      number;
  status:        ApprovalStatus;
  requestedBy:   number;
  reviewedBy:    number | null;
  requesterNote: string | null;
  reviewerNote:  string | null;
  payload:       unknown;
  expiresAt:     Date | null;
  reviewedAt:    Date | null;
  createdAt:     Date;
  chainId:       number | null;
  currentLevel:  number;
  totalLevels:   number;
  escalatedAt:   Date | null;
  escalatedTo:   number | null;
};

type Tab = "requests" | "chains" | "delegations";

// ─── Helpers ────────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<ApprovalAction, { color: string; Icon: React.ElementType }> = {
  SAR_TRANSMIT:    { color: C.red,   Icon: FileText    },
  CASE_DECIDE:     { color: C.amber, Icon: FolderOpen  },
  CUSTOMER_BLOCK:  { color: C.red,   Icon: ShieldOff   },
  WALLET_SUSPEND:  { color: C.amber, Icon: Wallet      },
};

const STATUS_CONFIG: Record<ApprovalStatus, { color: string; bg: string; border: string; Icon: React.ElementType }> = {
  PENDING:  { color: C.amber, bg: `${C.amber}10`, border: `${C.amber}30`, Icon: Clock        },
  APPROVED: { color: C.green, bg: `${C.green}10`, border: `${C.green}30`, Icon: CheckCircle  },
  REJECTED: { color: C.red,   bg: `${C.red}10`,   border: `${C.red}30`,   Icon: XCircle      },
  EXPIRED:  { color: C.text4, bg: C.hover,         border: C.border,       Icon: AlertTriangle },
};

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const { t } = useI18n();
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.Icon;
  const labels: Record<ApprovalStatus, string> = { PENDING: t.approvals.pending, APPROVED: t.approvals.approved, REJECTED: t.approvals.rejected, EXPIRED: t.approvals.expired };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 10, fontFamily: C.mono, padding: "3px 8px",
      borderRadius: 5, border: `1px solid ${cfg.border}`,
      background: cfg.bg, color: cfg.color,
    }}>
      <Icon size={10} /> {labels[status]}
    </span>
  );
}

function ActionBadge({ action }: { action: ApprovalAction }) {
  const { t } = useI18n();
  const cfg = ACTION_CONFIG[action] ?? { color: C.text3, Icon: GitMerge };
  const Icon = cfg.Icon;
  const labels: Record<string, string> = { SAR_TRANSMIT: "SAR", CASE_DECIDE: t.cases.closeCase, CUSTOMER_BLOCK: t.common.actions, WALLET_SUSPEND: "Wallet" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: C.mono, color: cfg.color }}>
      <Icon size={11} /> {labels[action] ?? action}
    </span>
  );
}

// ─── Step Progress Dots ─────────────────────────────────────────────────────

function StepProgress({ currentLevel, totalLevels, status }: {
  currentLevel: number; totalLevels: number; status: ApprovalStatus;
}) {
  if (totalLevels <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 4 }}>
      {Array.from({ length: totalLevels }, (_, i) => {
        const level = i + 1;
        const done = status === "APPROVED" || (status === "PENDING" && level < currentLevel);
        const active = status === "PENDING" && level === currentLevel;
        const rejected = status === "REJECTED" && level === currentLevel;
        const color = done ? C.green : active ? C.amber : rejected ? C.red : C.border2;
        return (
          <div key={level} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: done || active || rejected ? color : "transparent",
              border: `2px solid ${color}`,
              transition: "all 0.2s",
            }} title={`${level}`} />
            {level < totalLevels && (
              <div style={{ width: 12, height: 1, background: done ? C.green : C.border2 }} />
            )}
          </div>
        );
      })}
      <span style={{ fontSize: 9, fontFamily: C.mono, color: C.text4, marginLeft: 4 }}>
        {status === "APPROVED" ? `${totalLevels}/${totalLevels}` : status === "REJECTED" ? "✗" : `${currentLevel}/${totalLevels}`}
      </span>
    </div>
  );
}

// ─── Approval Card ──────────────────────────────────────────────────────────

function ApprovalCard({
  req, currentUserId, onReviewed,
}: {
  req: ApprovalRequest;
  currentUserId: number;
  onReviewed: () => void;
}) {
  const { t } = useI18n();
  const ta = t.approvals;
  const [expanded, setExpanded]   = useState(false);
  const [note, setNote]           = useState("");
  const [confirming, setConfirming] = useState<"APPROVED" | "REJECTED" | null>(null);

  const reviewMutation = trpc.approvals.review.useMutation({
    onSuccess: () => { setConfirming(null); setNote(""); onReviewed(); },
  });

  const isSelf      = req.requestedBy === currentUserId;
  const isPending   = req.status === "PENDING";
  const isExpired   = req.expiresAt && new Date(req.expiresAt) < new Date();
  const canReview   = isPending && !isSelf && !isExpired;
  const isMultiLevel = req.totalLevels > 1;

  function doReview(decision: "APPROVED" | "REJECTED") {
    reviewMutation.mutate({ approvalId: req.id, decision, reviewerNote: note || undefined });
  }

  return (
    <div style={{
      background: C.surface, border: `1px solid ${req.status === "PENDING" ? `${C.amber}40` : C.border}`,
      borderRadius: 10, overflow: "hidden",
      boxShadow: req.status === "PENDING" ? `0 0 0 1px ${C.amber}10` : "none",
    }}>
      {/* En-tête */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: `${ACTION_CONFIG[req.action]?.color ?? C.text3}15`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <GitMerge size={16} style={{ color: ACTION_CONFIG[req.action]?.color ?? C.text3 }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <ActionBadge action={req.action} />
            <StatusBadge status={req.status} />
            {isMultiLevel && (
              <span style={{ fontSize: 9, fontFamily: C.mono, color: C.blue, background: `${C.blue}12`, border: `1px solid ${C.blue}30`, borderRadius: 4, padding: "2px 6px" }}>
                Multi-niveau
              </span>
            )}
            {isSelf && isPending && (
              <span style={{ fontSize: 9, fontFamily: C.mono, color: C.blue, background: `${C.blue}12`, border: `1px solid ${C.blue}30`, borderRadius: 4, padding: "2px 6px" }}>
                Votre demande
              </span>
            )}
            {req.escalatedAt && (
              <span style={{ fontSize: 9, fontFamily: C.mono, color: C.red, background: `${C.red}12`, border: `1px solid ${C.red}30`, borderRadius: 4, padding: "2px 6px", display: "inline-flex", alignItems: "center", gap: 3 }}>
                <ArrowUpCircle size={9} /> Escaladé
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 4 }}>
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
              {req.entityType} #{req.entityId}
            </span>
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4 }}>
              {formatDateTime(req.createdAt)}
            </span>
            {req.expiresAt && isPending && (
              <span style={{ fontSize: 10, fontFamily: C.mono, color: isExpired ? C.red : C.amber }}>
                Expire : {formatDateTime(req.expiresAt)}
              </span>
            )}
          </div>
          <StepProgress currentLevel={req.currentLevel} totalLevels={req.totalLevels} status={req.status} />
        </div>

        {expanded
          ? <ChevronUp size={14} style={{ color: C.text4, flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ color: C.text4, flexShrink: 0 }} />
        }
      </div>

      {/* Détail expandé */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {req.requesterNote && (
            <div style={{ background: C.hover, borderRadius: 8, padding: "10px 12px" }}>
              <p style={LABEL}>Note du demandeur</p>
              <p style={{ fontSize: 12, color: C.text2, margin: 0 }}>{req.requesterNote}</p>
            </div>
          )}
          {req.reviewerNote && (
            <div style={{ background: req.status === "APPROVED" ? `${C.green}08` : `${C.red}08`, borderRadius: 8, padding: "10px 12px" }}>
              <p style={LABEL}>Note du réviseur</p>
              <p style={{ fontSize: 12, color: C.text2, margin: 0 }}>{req.reviewerNote}</p>
            </div>
          )}

          {req.reviewedAt && (
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text4, margin: 0 }}>
              Révisé le {formatDateTime(req.reviewedAt)}
            </p>
          )}

          {isSelf && isPending && (
            <div style={{ background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 8 }}>
              <User size={13} style={{ color: C.blue, flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, fontFamily: C.mono, color: C.blue, margin: 0 }}>
                Principe des 4 yeux — vous avez initié cette demande. Un autre compliance officer ou superviseur doit l'approuver.
              </p>
            </div>
          )}

          {canReview && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {isMultiLevel && (
                <p style={{ fontSize: 11, fontFamily: C.mono, color: C.amber, margin: 0 }}>
                  Niveau {req.currentLevel} sur {req.totalLevels} — votre approbation {req.currentLevel < req.totalLevels ? "fera avancer au niveau suivant" : "finalisera la demande"}
                </p>
              )}
              <div>
                <label style={LABEL}>Note de révision (optionnel)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Justification de la décision…"
                  style={{ ...INPUT, resize: "vertical" }}
                />
              </div>

              {confirming ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{
                    background: confirming === "APPROVED" ? `${C.green}0a` : `${C.red}0a`,
                    border: `1px solid ${confirming === "APPROVED" ? `${C.green}30` : `${C.red}30`}`,
                    borderRadius: 8, padding: "10px 12px",
                  }}>
                    <p style={{ fontSize: 12, fontFamily: C.mono, color: confirming === "APPROVED" ? C.green : C.red, margin: 0 }}>
                      {confirming === "APPROVED" ? ta.confirmApprove : ta.confirmReject}
                      {confirming === "REJECTED" && isMultiLevel && " (rejet immédiat de toute la chaîne)"}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      disabled={reviewMutation.isPending}
                      onClick={() => doReview(confirming)}
                      style={{
                        padding: "8px 16px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer",
                        background: confirming === "APPROVED" ? `${C.green}20` : `${C.red}20`,
                        border: `1px solid ${confirming === "APPROVED" ? `${C.green}50` : `${C.red}50`}`,
                        color: confirming === "APPROVED" ? C.green : C.red,
                        opacity: reviewMutation.isPending ? 0.6 : 1,
                      }}
                    >
                      {reviewMutation.isPending ? ta.inProgress : t.common.confirm}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      style={{ padding: "8px 16px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer", background: C.hover, border: `1px solid ${C.border2}`, color: C.text2 }}
                    >
                      {t.common.cancel}
                    </button>
                  </div>
                  {reviewMutation.error && (
                    <p style={{ fontSize: 11, fontFamily: C.mono, color: C.red, margin: 0 }}>{reviewMutation.error.message}</p>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setConfirming("APPROVED")}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer", background: `${C.green}14`, border: `1px solid ${C.green}40`, color: C.green }}
                  >
                    <CheckCircle size={12} /> {ta.approve}
                  </button>
                  <button
                    onClick={() => setConfirming("REJECTED")}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer", background: `${C.red}14`, border: `1px solid ${C.red}40`, color: C.red }}
                  >
                    <XCircle size={12} /> {ta.reject}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Chains Tab ─────────────────────────────────────────────────────────────

function ChainsTab() {
  const { t } = useI18n();
  const ta = t.approvals;
  const { data: chains, refetch } = trpc.approvals.listChains.useQuery();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    action: "SAR_TRANSMIT" as ApprovalAction,
    name: "",
    description: "",
    levels: [{ level: 1, minRole: "supervisor", label: "" }] as { level: number; minRole: string; label: string }[],
  });

  const createMut = trpc.approvals.createChain.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); setForm({ action: "SAR_TRANSMIT", name: "", description: "", levels: [{ level: 1, minRole: "supervisor", label: "" }] }); },
  });
  const deactivateMut = trpc.approvals.deactivateChain.useMutation({ onSuccess: () => refetch() });

  const addLevel = () => {
    setForm(f => ({
      ...f,
      levels: [...f.levels, { level: f.levels.length + 1, minRole: "compliance_officer", label: "" }],
    }));
  };
  const removeLevel = (idx: number) => {
    setForm(f => ({
      ...f,
      levels: f.levels.filter((_, i) => i !== idx).map((l, i) => ({ ...l, level: i + 1 })),
    }));
  };
  const updateLevel = (idx: number, field: string, value: string) => {
    setForm(f => ({
      ...f,
      levels: f.levels.map((l, i) => i === idx ? { ...l, [field]: value } : l),
    }));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
          Configuration des chaînes d'approbation multi-niveaux par type d'action
        </p>
        <button
          onClick={() => setShowCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, color: C.blue }}
        >
          <Plus size={12} /> {ta.createChain}
        </button>
      </div>

      {/* Existing chains */}
      {!chains || chains.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", border: `1px dashed ${C.border2}`, borderRadius: 10 }}>
          <Link2 size={24} style={{ color: C.border2, margin: "0 auto 8px", display: "block" }} />
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: 0 }}>{ta.noChains}</p>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text4, marginTop: 4 }}>
            Mode par défaut : approbation simple (1 niveau)
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {chains.map(chain => {
            const levels = chain.levels as { level: number; minRole: string; label: string }[];
            return (
              <div key={chain.id} style={{ background: C.surface, border: `1px solid ${chain.isActive ? `${C.green}30` : C.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ActionBadge action={chain.action as ApprovalAction} />
                    <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text1 }}>{chain.name}</span>
                    {chain.isActive
                      ? <span style={{ fontSize: 9, fontFamily: C.mono, color: C.green, background: `${C.green}12`, border: `1px solid ${C.green}30`, borderRadius: 4, padding: "2px 6px" }}>ACTIVE</span>
                      : <span style={{ fontSize: 9, fontFamily: C.mono, color: C.text4, background: C.hover, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 6px" }}>INACTIVE</span>
                    }
                  </div>
                  {chain.isActive && (
                    <button
                      onClick={() => deactivateMut.mutate({ chainId: chain.id })}
                      style={{ fontSize: 10, fontFamily: C.mono, color: C.red, background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      {ta.deactivate}
                    </button>
                  )}
                </div>
                {chain.description && (
                  <p style={{ fontSize: 11, color: C.text3, margin: "0 0 8px" }}>{chain.description}</p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {levels.map((l, i) => (
                    <div key={l.level} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ background: C.hover, borderRadius: 6, padding: "4px 8px" }}>
                        <p style={{ fontSize: 9, fontFamily: C.mono, color: C.text4, margin: "0 0 2px" }}>Niveau {l.level}</p>
                        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text2, margin: 0 }}>
                          {(t.admin.roles as Record<string, string>)[l.minRole] ?? l.minRole}
                        </p>
                        {l.label && <p style={{ fontSize: 9, color: C.text3, margin: "2px 0 0" }}>{l.label}</p>}
                      </div>
                      {i < levels.length - 1 && <span style={{ color: C.text4, fontSize: 10 }}>→</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div role="dialog" aria-modal="true" aria-label={ta.createChain} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 500 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 6 }}>
              <Link2 size={14} style={{ color: C.blue }} /> {ta.createChain}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LABEL}>Action</label>
                  <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value as ApprovalAction }))} style={{ ...INPUT, cursor: "pointer" }}>
                    <option value="SAR_TRANSMIT">Transmission SAR</option>
                    <option value="CASE_DECIDE">Décision dossier</option>
                    <option value="CUSTOMER_BLOCK">Blocage client</option>
                    <option value="WALLET_SUSPEND">Suspension wallet</option>
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Nom</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Chaîne SAR 3 niveaux" style={INPUT} />
                </div>
              </div>
              <div>
                <label style={LABEL}>Description (optionnel)</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Chaîne pour…" style={INPUT} />
              </div>

              {/* Levels */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={{ ...LABEL, marginBottom: 0 }}>Niveaux ({form.levels.length})</label>
                  {form.levels.length < 5 && (
                    <button onClick={addLevel} style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                      <Plus size={10} /> Ajouter
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {form.levels.map((l, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", background: C.hover, borderRadius: 6, padding: "8px 10px" }}>
                      <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, width: 20, flexShrink: 0 }}>{l.level}.</span>
                      <select
                        value={l.minRole}
                        onChange={e => updateLevel(i, "minRole", e.target.value)}
                        style={{ ...INPUT, flex: 1, width: "auto" }}
                      >
                        <option value="analyst">Analyste</option>
                        <option value="supervisor">Superviseur</option>
                        <option value="compliance_officer">Compliance Officer</option>
                        <option value="admin">Administrateur</option>
                      </select>
                      <input
                        value={l.label}
                        onChange={e => updateLevel(i, "label", e.target.value)}
                        placeholder="Label (ex: Validation DG)"
                        style={{ ...INPUT, flex: 2, width: "auto" }}
                      />
                      {form.levels.length > 1 && (
                        <button onClick={() => removeLevel(i)} aria-label={t.common.delete} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: 2 }}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {createMut.error && (
              <p style={{ marginTop: 10, fontSize: 11, fontFamily: C.mono, color: C.red }}>{createMut.error.message}</p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}>
                Annuler
              </button>
              <button
                disabled={!form.name || form.levels.some(l => !l.label) || createMut.isPending}
                onClick={() => createMut.mutate({
                  action: form.action,
                  name: form.name,
                  ...(form.description ? { description: form.description } : {}),
                  levels: form.levels,
                })}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: (!form.name || form.levels.some(l => !l.label) || createMut.isPending) ? 0.4 : 1 }}
              >
                {createMut.isPending ? ta.inProgress : ta.createChain}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Delegations Tab ────────────────────────────────────────────────────────

function DelegationsTab() {
  const { user } = useAuth();
  const { t } = useI18n();
  const ta = t.approvals;
  const { data: delegations, refetch } = trpc.approvals.listDelegations.useQuery({ activeOnly: false });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    delegateId: "",
    action: "" as ApprovalAction | "",
    validFrom: new Date().toISOString().slice(0, 16),
    validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16),
    reason: "",
  });

  const createMut = trpc.approvals.createDelegation.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); },
  });
  const revokeMut = trpc.approvals.revokeDelegation.useMutation({ onSuccess: () => refetch() });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
          Délégation du pouvoir d'approbation (congés, absences)
        </p>
        <button
          onClick={() => setShowCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, color: C.blue }}
        >
          <Plus size={12} /> {ta.createDelegation}
        </button>
      </div>

      {!delegations || delegations.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", border: `1px dashed ${C.border2}`, borderRadius: 10 }}>
          <User size={24} style={{ color: C.border2, margin: "0 auto 8px", display: "block" }} />
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: 0 }}>{ta.noDelegations}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {delegations.map(d => {
            const isActive = d.isActive && new Date(d.validUntil) > new Date() && new Date(d.validFrom) <= new Date();
            const isMine = d.delegatorId === user?.id;
            return (
              <div key={d.id} style={{ background: C.surface, border: `1px solid ${isActive ? `${C.green}30` : C.border}`, borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text2 }}>
                      Utilisateur #{d.delegatorId} → #{d.delegateId}
                    </span>
                    {d.action && <ActionBadge action={d.action as ApprovalAction} />}
                    {!d.action && <span style={{ fontSize: 9, fontFamily: C.mono, color: C.amber }}>Toutes actions</span>}
                    {isActive
                      ? <span style={{ fontSize: 9, fontFamily: C.mono, color: C.green, background: `${C.green}12`, border: `1px solid ${C.green}30`, borderRadius: 4, padding: "2px 6px" }}>ACTIVE</span>
                      : <span style={{ fontSize: 9, fontFamily: C.mono, color: C.text4, background: C.hover, borderRadius: 4, padding: "2px 6px" }}>EXPIRÉE</span>
                    }
                  </div>
                  <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, margin: 0 }}>
                    {formatDate(d.validFrom)} → {formatDate(d.validUntil)}
                    {d.reason && ` — ${d.reason}`}
                  </p>
                </div>
                {isMine && d.isActive && (
                  <button
                    onClick={() => revokeMut.mutate({ delegationId: d.id })}
                    style={{ fontSize: 10, fontFamily: C.mono, color: C.red, background: `${C.red}10`, border: `1px solid ${C.red}30`, borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}
                  >
                    {ta.revoke}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div role="dialog" aria-modal="true" aria-label={ta.createDelegation} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 440 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: 0 }}>{ta.createDelegation}</h3>
              <button onClick={() => setShowCreate(false)} aria-label={t.common.close} style={{ background: "none", border: "none", color: C.text3, cursor: "pointer" }}><X size={16} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={LABEL}>ID du délégataire</label>
                <input type="number" value={form.delegateId} onChange={e => setForm(f => ({ ...f, delegateId: e.target.value }))} placeholder="ID utilisateur" style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Action (vide = toutes)</label>
                <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value as ApprovalAction | "" }))} style={{ ...INPUT, cursor: "pointer" }}>
                  <option value="">Toutes les actions</option>
                  <option value="SAR_TRANSMIT">Transmission SAR</option>
                  <option value="CASE_DECIDE">Décision dossier</option>
                  <option value="CUSTOMER_BLOCK">Blocage client</option>
                  <option value="WALLET_SUSPEND">Suspension wallet</option>
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LABEL}>Début</label>
                  <input type="datetime-local" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} style={INPUT} />
                </div>
                <div>
                  <label style={LABEL}>Fin</label>
                  <input type="datetime-local" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} style={INPUT} />
                </div>
              </div>
              <div>
                <label style={LABEL}>Motif (optionnel)</label>
                <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Congés, formation…" style={INPUT} />
              </div>
            </div>
            {createMut.error && (
              <p style={{ marginTop: 10, fontSize: 11, fontFamily: C.mono, color: C.red }}>{createMut.error.message}</p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, background: "transparent", cursor: "pointer" }}>
                Annuler
              </button>
              <button
                disabled={!form.delegateId || createMut.isPending}
                onClick={() => createMut.mutate({
                  delegateId: Number(form.delegateId),
                  ...(form.action ? { action: form.action } : {}),
                  validFrom: new Date(form.validFrom).toISOString(),
                  validUntil: new Date(form.validUntil).toISOString(),
                  ...(form.reason ? { reason: form.reason } : {}),
                })}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: (!form.delegateId || createMut.isPending) ? 0.4 : 1 }}
              >
                {createMut.isPending ? ta.inProgress : ta.createDelegation}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function ApprovalsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const ta = t.approvals;
  const isAdmin = hasRole(user, "admin");
  const isSupervisor = hasRole(user, "supervisor");
  const [tab, setTab] = useState<Tab>("requests");
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "ALL">("PENDING");
  const [actionFilter, setActionFilter] = useState<ApprovalAction | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const { data, isLoading, refetch } = trpc.approvals.list.useQuery({
    ...(statusFilter !== "ALL" && { status: statusFilter }),
    ...(actionFilter !== "ALL" && { action: actionFilter }),
    page,
    limit: LIMIT,
  }, { refetchInterval: 30_000, enabled: tab === "requests" });

  const items   = (data?.items ?? []) as ApprovalRequest[];
  const total   = data?.total ?? 0;
  const pending = items.filter(r => r.status === "PENDING").length;

  const STATUSES: { value: ApprovalStatus | "ALL"; label: string }[] = [
    { value: "ALL",      label: t.common.all       },
    { value: "PENDING",  label: ta.pending         },
    { value: "APPROVED", label: ta.approved        },
    { value: "REJECTED", label: ta.rejected        },
    { value: "EXPIRED",  label: ta.expired         },
  ];

  const ACTIONS: { value: ApprovalAction | "ALL"; label: string }[] = [
    { value: "ALL",             label: t.common.all         },
    { value: "SAR_TRANSMIT",    label: "SAR"                },
    { value: "CASE_DECIDE",     label: t.cases.closeCase    },
    { value: "CUSTOMER_BLOCK",  label: t.common.actions     },
    { value: "WALLET_SUSPEND",  label: "Wallet"             },
  ];

  const SELECT: React.CSSProperties = {
    background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7,
    padding: "7px 10px", fontSize: 11, fontFamily: C.mono, color: C.text1, outline: "none",
  };

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px", fontSize: 11, fontFamily: C.mono, cursor: "pointer",
    background: active ? `${C.blue}14` : "transparent",
    border: active ? `1px solid ${C.blue}40` : `1px solid ${C.border2}`,
    borderRadius: 7, color: active ? C.blue : C.text3,
    display: "flex", alignItems: "center", gap: 6,
  });

  return (
    <AppLayout>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <GitMerge size={20} style={{ color: C.gold }} />
            <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text1, margin: 0 }}>{ta.title}</h1>
            {pending > 0 && (
              <span style={{ fontSize: 10, fontFamily: C.mono, fontWeight: 700, color: "#fff", background: C.amber, borderRadius: 10, padding: "2px 7px" }}>
                {pending} {ta.pending.toLowerCase()}
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {ta.subtitle}
          </p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setTab("requests")} style={TAB_STYLE(tab === "requests")}>
          <GitMerge size={12} /> {ta.requests}
        </button>
        {isAdmin && (
          <button onClick={() => setTab("chains")} style={TAB_STYLE(tab === "chains")}>
            <Settings size={12} /> {ta.chains}
          </button>
        )}
        {isSupervisor && (
          <button onClick={() => setTab("delegations")} style={TAB_STYLE(tab === "delegations")}>
            <User size={12} /> {ta.delegations}
          </button>
        )}
      </div>

      {/* ── Requests Tab ── */}
      {tab === "requests" && (
        <>
          {/* KPI bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {(["PENDING", "APPROVED", "REJECTED", "EXPIRED"] as const).map((s) => {
              const cfg = STATUS_CONFIG[s];
              const Icon = cfg.Icon;
              const cnt = (data?.items ?? []).filter(r => r.status === s).length;
              const statusLabels: Record<ApprovalStatus, string> = { PENDING: ta.pending, APPROVED: ta.approved, REJECTED: ta.rejected, EXPIRED: ta.expired };
              return (
                <div key={s}
                  onClick={() => { setStatusFilter(s === statusFilter ? "ALL" : s); setPage(1); }}
                  style={{
                    background: C.surface, border: `1px solid ${statusFilter === s ? cfg.border : C.border}`,
                    borderRadius: 10, padding: "14px 16px", cursor: "pointer",
                    boxShadow: statusFilter === s ? `0 0 0 1px ${cfg.border}` : "none",
                    transition: "all 0.15s",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Icon size={14} style={{ color: cfg.color }} />
                    <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{statusLabels[s]}</span>
                  </div>
                  <p style={{ fontSize: 22, fontWeight: 700, fontFamily: C.mono, color: cfg.color, margin: 0 }}>{cnt}</p>
                </div>
              );
            })}
          </div>

          {/* Filtres */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as ApprovalStatus | "ALL"); setPage(1); }} style={SELECT}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value as ApprovalAction | "ALL"); setPage(1); }} style={SELECT}>
              {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <button
              onClick={() => refetch()}
              style={{ padding: "7px 14px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer", background: C.hover, border: `1px solid ${C.border2}`, color: C.text2 }}
            >
              {t.common.refresh}
            </button>
            <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: C.mono, color: C.text4, alignSelf: "center" }}>
              {total} demande{total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Liste */}
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text4 }}>{t.common.loading}</p>
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", border: `1px dashed ${C.border2}`, borderRadius: 12 }}>
              <GitMerge size={32} style={{ color: C.border2, margin: "0 auto 12px", display: "block" }} />
              <p style={{ fontSize: 13, fontFamily: C.mono, color: C.text3, margin: 0 }}>{ta.noRequests}</p>
              <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text4, marginTop: 4 }}>
                {ta.emptyHint}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map(req => (
                <ApprovalCard
                  key={req.id}
                  req={req}
                  currentUserId={user?.id ?? -1}
                  onReviewed={() => refetch()}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > LIMIT && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                style={{ padding: "6px 14px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: page === 1 ? "not-allowed" : "pointer", background: C.hover, border: `1px solid ${C.border2}`, color: page === 1 ? C.text4 : C.text1, opacity: page === 1 ? 0.5 : 1 }}
              >
                Précédent
              </button>
              <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text3 }}>
                Page {page} / {Math.ceil(total / LIMIT)}
              </span>
              <button
                disabled={page * LIMIT >= total}
                onClick={() => setPage(p => p + 1)}
                style={{ padding: "6px 14px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: page * LIMIT >= total ? "not-allowed" : "pointer", background: C.hover, border: `1px solid ${C.border2}`, color: page * LIMIT >= total ? C.text4 : C.text1, opacity: page * LIMIT >= total ? 0.5 : 1 }}
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Chains Tab ── */}
      {tab === "chains" && <ChainsTab />}

      {/* ── Delegations Tab ── */}
      {tab === "delegations" && <DelegationsTab />}
    </AppLayout>
  );
}
