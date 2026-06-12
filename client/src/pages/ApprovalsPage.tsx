/**
 * Dual Control — Principe des 4 yeux (ACPR art.13 / FATF R.20)
 * Page de gestion des demandes d'approbation.
 */

import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { formatDateTime } from "../lib/utils";
import {
  GitMerge, CheckCircle, XCircle, Clock, AlertTriangle,
  FileText, FolderOpen, User, ShieldOff, Wallet, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

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
  updatedAt:     Date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<ApprovalAction, { label: string; color: string; Icon: React.ElementType }> = {
  SAR_TRANSMIT:    { label: "Transmission SAR",        color: C.red,   Icon: FileText    },
  CASE_DECIDE:     { label: "Décision dossier",        color: C.amber, Icon: FolderOpen  },
  CUSTOMER_BLOCK:  { label: "Blocage client",          color: C.red,   Icon: ShieldOff   },
  WALLET_SUSPEND:  { label: "Suspension wallet",       color: C.amber, Icon: Wallet      },
};

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  PENDING:  { label: "En attente",  color: C.amber, bg: `${C.amber}10`, border: `${C.amber}30`, Icon: Clock        },
  APPROVED: { label: "Approuvé",   color: C.green, bg: `${C.green}10`, border: `${C.green}30`, Icon: CheckCircle  },
  REJECTED: { label: "Rejeté",     color: C.red,   bg: `${C.red}10`,   border: `${C.red}30`,   Icon: XCircle      },
  EXPIRED:  { label: "Expiré",     color: C.text4, bg: C.hover,         border: C.border,       Icon: AlertTriangle },
};

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.Icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 10, fontFamily: C.mono, padding: "3px 8px",
      borderRadius: 5, border: `1px solid ${cfg.border}`,
      background: cfg.bg, color: cfg.color,
    }}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function ActionBadge({ action }: { action: ApprovalAction }) {
  const cfg = ACTION_CONFIG[action] ?? { label: action, color: C.text3, Icon: GitMerge };
  const Icon = cfg.Icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: C.mono, color: cfg.color }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

// ─── Carte approbation ────────────────────────────────────────────────────────

function ApprovalCard({
  req, currentUserId, onReviewed,
}: {
  req: ApprovalRequest;
  currentUserId: number;
  onReviewed: () => void;
}) {
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
            {isSelf && isPending && (
              <span style={{ fontSize: 9, fontFamily: C.mono, color: C.blue, background: `${C.blue}12`, border: `1px solid ${C.blue}30`, borderRadius: 4, padding: "2px 6px" }}>
                Votre demande
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
        </div>

        {expanded
          ? <ChevronUp size={14} style={{ color: C.text4, flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ color: C.text4, flexShrink: 0 }} />
        }
      </div>

      {/* Détail expandé */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Notes */}
          {req.requesterNote && (
            <div style={{ background: C.hover, borderRadius: 8, padding: "10px 12px" }}>
              <p style={{ fontSize: 9, fontFamily: C.mono, color: C.text4, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 4px" }}>Note du demandeur</p>
              <p style={{ fontSize: 12, color: C.text2, margin: 0 }}>{req.requesterNote}</p>
            </div>
          )}
          {req.reviewerNote && (
            <div style={{ background: req.status === "APPROVED" ? `${C.green}08` : `${C.red}08`, borderRadius: 8, padding: "10px 12px" }}>
              <p style={{ fontSize: 9, fontFamily: C.mono, color: C.text4, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 4px" }}>Note du réviseur</p>
              <p style={{ fontSize: 12, color: C.text2, margin: 0 }}>{req.reviewerNote}</p>
            </div>
          )}

          {/* Dates review */}
          {req.reviewedAt && (
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text4, margin: 0 }}>
              Révisé le {formatDateTime(req.reviewedAt)}
            </p>
          )}

          {/* Principe 4-yeux expliqué */}
          {isSelf && isPending && (
            <div style={{ background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 8 }}>
              <User size={13} style={{ color: C.blue, flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, fontFamily: C.mono, color: C.blue, margin: 0 }}>
                Principe des 4 yeux — vous avez initié cette demande. Un autre compliance officer ou superviseur doit l'approuver.
              </p>
            </div>
          )}

          {/* Zone d'action (review) */}
          {canReview && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label style={{ display: "block", fontSize: 9, fontFamily: C.mono, color: C.text3, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>
                  Note de révision (optionnel)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Justification de la décision…"
                  style={{
                    width: "100%", background: C.hover, border: `1px solid ${C.border2}`,
                    borderRadius: 7, padding: "8px 10px", fontSize: 12, fontFamily: C.mono,
                    color: C.text1, resize: "vertical", outline: "none", boxSizing: "border-box",
                  }}
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
                      Confirmer la décision : <strong>{confirming === "APPROVED" ? "APPROUVER" : "REJETER"}</strong> cette demande ?
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
                      {reviewMutation.isPending ? "En cours…" : "Confirmer"}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      style={{ padding: "8px 16px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer", background: C.hover, border: `1px solid ${C.border2}`, color: C.text2 }}
                    >
                      Annuler
                    </button>
                  </div>
                  {reviewMutation.error && (
                    <p style={{ fontSize: 11, fontFamily: C.mono, color: C.red, margin: 0 }}>
                      {reviewMutation.error.message}
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setConfirming("APPROVED")}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer", background: `${C.green}14`, border: `1px solid ${C.green}40`, color: C.green }}
                  >
                    <CheckCircle size={12} /> Approuver
                  </button>
                  <button
                    onClick={() => setConfirming("REJECTED")}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 11, fontFamily: C.mono, borderRadius: 7, cursor: "pointer", background: `${C.red}14`, border: `1px solid ${C.red}40`, color: C.red }}
                  >
                    <XCircle size={12} /> Rejeter
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

// ─── Page principale ──────────────────────────────────────────────────────────

export function ApprovalsPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "ALL">("PENDING");
  const [actionFilter, setActionFilter] = useState<ApprovalAction | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const { data, isLoading, refetch } = trpc.approvals.list.useQuery({
    ...(statusFilter !== "ALL" && { status: statusFilter }),
    ...(actionFilter !== "ALL" && { action: actionFilter }),
    page,
    limit: LIMIT,
  }, { refetchInterval: 30_000 });

  const items   = (data?.items ?? []) as ApprovalRequest[];
  const total   = data?.total ?? 0;
  const pending = items.filter(r => r.status === "PENDING").length;

  const STATUSES: { value: ApprovalStatus | "ALL"; label: string }[] = [
    { value: "ALL",      label: "Tous"         },
    { value: "PENDING",  label: "En attente"   },
    { value: "APPROVED", label: "Approuvés"    },
    { value: "REJECTED", label: "Rejetés"      },
    { value: "EXPIRED",  label: "Expirés"      },
  ];

  const ACTIONS: { value: ApprovalAction | "ALL"; label: string }[] = [
    { value: "ALL",             label: "Toutes actions"     },
    { value: "SAR_TRANSMIT",    label: "Transmission SAR"   },
    { value: "CASE_DECIDE",     label: "Décision dossier"   },
    { value: "CUSTOMER_BLOCK",  label: "Blocage client"     },
    { value: "WALLET_SUSPEND",  label: "Suspension wallet"  },
  ];

  const SELECT: React.CSSProperties = {
    background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7,
    padding: "7px 10px", fontSize: 11, fontFamily: C.mono, color: C.text1, outline: "none",
  };

  return (
    <AppLayout>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <GitMerge size={20} style={{ color: C.gold }} />
            <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text1, margin: 0 }}>Dual Control</h1>
            {pending > 0 && (
              <span style={{ fontSize: 10, fontFamily: C.mono, fontWeight: 700, color: "#fff", background: C.amber, borderRadius: 10, padding: "2px 7px" }}>
                {pending} en attente
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            Principe des 4 yeux — ACPR art. 13 / FATF R.20 — toute action critique requiert une seconde signature
          </p>
        </div>
      </div>

      {/* ── KPI bar ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {(["PENDING", "APPROVED", "REJECTED", "EXPIRED"] as const).map((s) => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.Icon;
          const count = (data?.items ?? []).filter(r => r.status === s).length;
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
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{cfg.label}</span>
              </div>
              <p style={{ fontSize: 22, fontWeight: 700, fontFamily: C.mono, color: cfg.color, margin: 0 }}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* ── Filtres ── */}
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
          Actualiser
        </button>
        <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: C.mono, color: C.text4, alignSelf: "center" }}>
          {total} demande{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Liste ── */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text4 }}>Chargement…</p>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", border: `1px dashed ${C.border2}`, borderRadius: 12 }}>
          <GitMerge size={32} style={{ color: C.border2, margin: "0 auto 12px", display: "block" }} />
          <p style={{ fontSize: 13, fontFamily: C.mono, color: C.text3, margin: 0 }}>Aucune demande d'approbation</p>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text4, marginTop: 4 }}>
            Les demandes apparaissent ici quand une action critique est initiée depuis les rapports ou les dossiers
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

      {/* ── Pagination ── */}
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
    </AppLayout>
  );
}
