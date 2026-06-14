import { useState, useCallback } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { useI18n } from "../hooks/useI18n";
import { formatDateTime, formatNumber } from "../lib/utils";
import {
  ScrollText, Download, ChevronDown, ChevronRight,
  Filter, RefreshCw, Shield, User, FileText,
  ArrowLeftRight, Bell, FolderOpen, Search, Settings,
  Activity, Database,
} from "lucide-react";

// ─── Action colour coding ─────────────────────────────────────────────────────

type AC = { bg: string; color: string; border: string };

function actionStyle(action: string): AC {
  if (action.includes("FAILED") || action.includes("BLOCKED") || action.includes("REJECTED"))
    return { bg: "rgba(255,101,112,0.10)", color: "#FF6570", border: "rgba(255,101,112,0.22)" };
  if (action.includes("MATCH") || action.includes("FLAGGED") || action.includes("ESCALATED") || action.includes("ALERT"))
    return { bg: "rgba(251,146,60,0.10)", color: "#FB923C", border: "rgba(251,146,60,0.22)" };
  if (action.startsWith("AUTH"))
    return { bg: "rgba(74,158,255,0.10)", color: "#4A9EFF", border: "rgba(74,158,255,0.22)" };
  if (action.includes("CREATED") || action.includes("APPROVED") || action.includes("VERIFIED") || action.includes("SUBMITTED"))
    return { bg: "rgba(45,212,160,0.09)", color: "#2DD4A0", border: "rgba(45,212,160,0.22)" };
  if (action.includes("UPDATED") || action.includes("CHANGED") || action.includes("ASSIGNED") || action.includes("STATUS"))
    return { bg: "rgba(245,158,11,0.10)", color: "#F59E0B", border: "rgba(245,158,11,0.22)" };
  if (action.includes("ML") || action.includes("SYSTEM"))
    return { bg: "rgba(167,139,250,0.10)", color: "#A78BFA", border: "rgba(167,139,250,0.22)" };
  return { bg: "rgba(100,116,139,0.09)", color: "#94A3B8", border: "rgba(100,116,139,0.18)" };
}

// ─── Entity type icons & colours ─────────────────────────────────────────────

const ENTITY_META: Record<string, { icon: React.ComponentType<{ size?: number; color?: string }>; color: string; label: string }> = {
  user:        { icon: User,          color: "#4A9EFF", label: "Utilisateur" },
  customer:    { icon: User,          color: "#2DD4A0", label: "Client"      },
  document:    { icon: FileText,      color: "#A78BFA", label: "Document"    },
  transaction: { icon: ArrowLeftRight,color: "#F59E0B", label: "Transaction" },
  alert:       { icon: Bell,          color: "#FF6570", label: "Alerte"      },
  case:        { icon: FolderOpen,    color: "#FB923C", label: "Dossier"     },
  screening:   { icon: Shield,        color: "#22D3EE", label: "Screening"   },
  report:      { icon: FileText,      color: "#C084FC", label: "Rapport"     },
  aml_rule:    { icon: Activity,      color: "#E8C84A", label: "Règle AML"   },
  system:      { icon: Settings,      color: "#94A3B8", label: "Système"     },
  ubo:         { icon: User,          color: "#4A9EFF", label: "UBO"         },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────


function exportToCsv(rows: AuditRow[]) {
  const hdr = ["ID", "Date", "Utilisateur", "Email", "Action", "Type Entité", "ID Entité", "IP", "Détails"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map(r => [
    r.id,
    new Date(r.createdAt).toISOString(),
    r.userName  ?? "Système",
    r.userEmail ?? "",
    r.action,
    r.entityType,
    r.entityId  ?? "",
    r.ipAddress ?? "",
    r.details   ? JSON.stringify(r.details) : "",
  ].map(v => esc(String(v))).join(","));

  const csv  = [hdr.join(","), ...lines].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditRow = {
  id: number;
  userId:     number | null;
  userName:   string | null;
  userEmail:  string | null;
  action:     string;
  entityType: string;
  entityId:   string | null;
  details:    unknown;
  ipAddress:  string | null;
  createdAt:  Date | string;
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      padding: "10px 18px", borderRadius: 8,
      background: "var(--wr-card)", border: "1px solid var(--wr-border)",
      minWidth: 120,
    }}>
      <span style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--wr-text-3)" }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "var(--wr-font-mono)",
        letterSpacing: "-0.5px", lineHeight: 1 }}>{value}</span>
    </div>
  );
}

// ─── Row detail expander ──────────────────────────────────────────────────────

function RowDetail({ details }: { details: unknown }) {
  const { t } = useI18n();
  if (!details || (typeof details === "object" && Object.keys(details as object).length === 0)) {
    return <span style={{ fontSize: 10, color: "var(--wr-text-4)", fontStyle: "italic" }}>{t.audit.noDetails}</span>;
  }
  const entries = Object.entries(details as Record<string, unknown>);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", padding: "8px 0" }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
          <span style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)",
            letterSpacing: "0.08em", textTransform: "uppercase" }}>{k}</span>
          <span style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-2)" }}>
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function AuditRowItem({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const ac  = actionStyle(row.action);
  const em  = ENTITY_META[row.entityType] ?? { icon: Database, color: "#94A3B8", label: row.entityType };
  const EntityIcon = em.icon;

  return (
    <>
      <tr
        onClick={() => setOpen(o => !o)}
        style={{
          cursor: "pointer",
          borderBottom: "1px solid var(--wr-border)",
          transition: "background 0.12s",
          background: open ? "var(--wr-hover)" : "transparent",
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = "var(--wr-hover)"; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
      >
        {/* Expand toggle */}
        <td style={{ padding: "10px 12px", width: 28 }}>
          {open
            ? <ChevronDown size={12} style={{ color: "var(--wr-text-3)" }} />
            : <ChevronRight size={12} style={{ color: "var(--wr-text-4)" }} />}
        </td>

        {/* Timestamp */}
        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)" }}>
            {formatDateTime(row.createdAt)}
          </span>
        </td>

        {/* User */}
        <td style={{ padding: "10px 12px" }}>
          {row.userName ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-1)",
                fontWeight: 600 }}>{row.userName}</span>
              <span style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)" }}>
                {row.userEmail}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)",
              fontStyle: "italic" }}>Système</span>
          )}
        </td>

        {/* Action */}
        <td style={{ padding: "10px 12px" }}>
          <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "2px 8px", borderRadius: 4,
            fontSize: 9, fontFamily: "var(--wr-font-mono)", fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const,
            background: ac.bg, color: ac.color, border: `1px solid ${ac.border}`,
          }}>
            {row.action.replace(/_/g, " ")}
          </span>
        </td>

        {/* Entity type */}
        <td style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <EntityIcon size={11} color={em.color} />
            <span style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: em.color,
              fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              {em.label}
            </span>
          </div>
        </td>

        {/* Entity ID */}
        <td style={{ padding: "10px 12px" }}>
          {row.entityId ? (
            <span style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)",
              background: "var(--wr-surface)", padding: "1px 6px", borderRadius: 3 }}>
              #{row.entityId}
            </span>
          ) : <span style={{ color: "var(--wr-text-4)", fontSize: 9 }}>—</span>}
        </td>

        {/* IP */}
        <td style={{ padding: "10px 12px" }}>
          <span style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)" }}>
            {row.ipAddress ?? "—"}
          </span>
        </td>
      </tr>

      {/* Expanded details row */}
      {open && (
        <tr style={{ background: "var(--wr-surface)", borderBottom: "1px solid var(--wr-border)" }}>
          <td />
          <td colSpan={6} style={{ padding: "8px 12px 12px" }}>
            <RowDetail details={row.details} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  "user","customer","document","ubo","transaction",
  "alert","case","screening","report","aml_rule","system",
];

export function AuditPage() {
  const { t } = useI18n();
  const ta = t.audit;
  const [page,       setPage]       = useState(1);
  const [entityType, setEntityType] = useState("");
  const [actionQ,    setActionQ]    = useState("");
  const [since,      setSince]      = useState("");
  const [until,      setUntil]      = useState("");

  // Committed filters (applied on search)
  const [filters, setFilters] = useState({ entityType: "", action: "", since: "", until: "" });

  const applyFilters = useCallback(() => {
    setPage(1);
    setFilters({ entityType, action: actionQ, since, until });
  }, [entityType, actionQ, since, until]);

  const resetFilters = useCallback(() => {
    setEntityType(""); setActionQ(""); setSince(""); setUntil("");
    setPage(1);
    setFilters({ entityType: "", action: "", since: "", until: "" });
  }, []);

  const queryInput = {
    page,
    limit: 50,
    entityType: filters.entityType || undefined,
    action:     filters.action     || undefined,
    since:      filters.since      ? new Date(filters.since).toISOString()  : undefined,
    until:      filters.until      ? new Date(filters.until + "T23:59:59").toISOString() : undefined,
  };

  const { data, isLoading, refetch } = trpc.admin.listAuditLogs.useQuery(queryInput, {
    staleTime: 10_000,
  });

  const { data: stats } = trpc.admin.auditStats.useQuery(undefined, {
    staleTime: 30_000,
  });

  const { refetch: fetchExport, isFetching: exporting } = trpc.admin.exportAuditLogs.useQuery(
    {
      entityType: filters.entityType || undefined,
      action:     filters.action     || undefined,
      since:      filters.since      ? new Date(filters.since).toISOString()  : undefined,
      until:      filters.until      ? new Date(filters.until + "T23:59:59").toISOString() : undefined,
    },
    { enabled: false }
  );

  const handleExport = async () => {
    const result = await fetchExport();
    if (result.data) exportToCsv(result.data as AuditRow[]);
  };

  const rows      = data?.data ?? [];
  const total     = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  // Top entity from stats
  const topEntity = stats?.byEntity
    ? Object.entries(stats.byEntity).sort((a, b) => (b[1] as number) - (a[1] as number))[0]
    : null;

  return (
    <AppLayout title={ta.title}>
      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <StatPill label="Total événements"  value={formatNumber(stats?.total  ?? 0)} color="var(--wr-text-1)" />
        <StatPill label="Dernières 24 h"    value={formatNumber(stats?.last24h ?? 0)} color="#4A9EFF" />
        <StatPill label="Derniers 7 jours"  value={formatNumber(stats?.last7d  ?? 0)} color="#2DD4A0" />
        {topEntity && (
          <StatPill
            label="Entité la plus active"
            value={`${ENTITY_META[topEntity[0]]?.label ?? topEntity[0]} · ${formatNumber(topEntity[1] as number)}`}
            color="#E8C84A"
          />
        )}
      </div>

      {/* ── Main card ───────────────────────────────────────────────────────── */}
      <div style={{
        background: "var(--wr-card)", border: "1px solid var(--wr-border)",
        borderRadius: 10, overflow: "hidden",
      }}>
        {/* Card header */}
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--wr-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          flexWrap: "wrap",
          background: "linear-gradient(180deg, var(--wr-panel) 0%, var(--wr-card) 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ScrollText size={14} style={{ color: "var(--wr-gold)" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--wr-text-1)",
              fontFamily: "var(--wr-font-serif)" }}>
              {ta.subtitle}
            </span>
            <span style={{
              fontSize: 9, fontFamily: "var(--wr-font-mono)", fontWeight: 700,
              padding: "1px 7px", borderRadius: 3,
              background: "rgba(201,162,39,0.12)", color: "var(--wr-gold)",
              border: "1px solid rgba(201,162,39,0.22)", letterSpacing: "0.10em",
            }}>
              {formatNumber(total)} ENTRÉES
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => refetch()}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                background: "var(--wr-surface)", border: "1px solid var(--wr-border)",
                fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-2)",
              }}
            >
              <RefreshCw size={10} /> {t.common.refresh}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 6, cursor: exporting ? "wait" : "pointer",
                background: exporting ? "rgba(201,162,39,0.08)" : "rgba(201,162,39,0.12)",
                border: "1px solid rgba(201,162,39,0.28)",
                fontSize: 10, fontFamily: "var(--wr-font-mono)", fontWeight: 700,
                color: "var(--wr-gold)", letterSpacing: "0.05em",
                opacity: exporting ? 0.7 : 1,
              }}
            >
              <Download size={10} /> {exporting ? "Export…" : "Export CSV"}
            </button>
          </div>
        </div>

        {/* ── Filters bar ─────────────────────────────────────────────────── */}
        <div style={{
          padding: "12px 18px", borderBottom: "1px solid var(--wr-border)",
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
          background: "var(--wr-surface)",
        }}>
          {/* Date from */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)",
              letterSpacing: "0.10em", textTransform: "uppercase" }}>{t.common.dateFrom}</label>
            <input
              type="date"
              value={since}
              onChange={e => setSince(e.target.value)}
              style={inputStyle}
            />
          </div>
          {/* Date until */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)",
              letterSpacing: "0.10em", textTransform: "uppercase" }}>{t.common.dateTo}</label>
            <input
              type="date"
              value={until}
              onChange={e => setUntil(e.target.value)}
              style={inputStyle}
            />
          </div>
          {/* Entity type */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)",
              letterSpacing: "0.10em", textTransform: "uppercase" }}>{ta.filterEntity}</label>
            <select
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
              style={{ ...inputStyle, minWidth: 140 }}
            >
              <option value="">{ta.allEntities}</option>
              {ENTITY_TYPES.map(et => (
                <option key={et} value={et}>{ENTITY_META[et]?.label ?? et}</option>
              ))}
            </select>
          </div>
          {/* Action search */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)",
              letterSpacing: "0.10em", textTransform: "uppercase" }}>{ta.filterAction}</label>
            <div style={{ position: "relative" }}>
              <Search size={11} style={{
                position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
                color: "var(--wr-text-4)", pointerEvents: "none",
              }} />
              <input
                type="text"
                placeholder="ex: AUTH_LOGIN, SCREENING…"
                value={actionQ}
                onChange={e => setActionQ(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyFilters()}
                style={{ ...inputStyle, paddingLeft: 28, width: "100%" }}
              />
            </div>
          </div>
          {/* Buttons */}
          <button onClick={applyFilters} style={filterBtnStyle("#4A9EFF")}>
            <Filter size={10} /> {t.common.filter}
          </button>
          <button onClick={resetFilters} style={filterBtnStyle("#94A3B8")}>
            {t.common.reset}
          </button>
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--wr-border)", background: "var(--wr-surface)" }}>
                <th style={thStyle} />
                <th style={thStyle}>{ta.timestamp}</th>
                <th style={thStyle}>{ta.user}</th>
                <th style={thStyle}>{ta.action}</th>
                <th style={thStyle}>{ta.entity}</th>
                <th style={thStyle}>{ta.entityId}</th>
                <th style={thStyle}>{ta.ip}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 40,
                  fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)" }}>
                  {t.common.loading}
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 40 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <ScrollText size={28} style={{ color: "var(--wr-text-4)", opacity: 0.4 }} />
                    <span style={{ fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)" }}>
                      {ta.noEvents}
                    </span>
                  </div>
                </td></tr>
              ) : (
                rows.map(row => <AuditRowItem key={row.id} row={row as AuditRow} />)
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ──────────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div style={{
            padding: "12px 18px", borderTop: "1px solid var(--wr-border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--wr-surface)",
          }}>
            <span style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)" }}>
              {t.common.page} {page} / {totalPages} · {formatNumber(total)} {t.common.rows}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <PagBtn label={`← ${t.common.previous}`} disabled={page <= 1}         onClick={() => setPage(p => p - 1)} />
              <PagBtn label={`${t.common.next} →`}   disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} />
            </div>
          </div>
        )}
      </div>

      {/* ── Entity breakdown ──────────────────────────────────────────────── */}
      {stats?.byEntity && Object.keys(stats.byEntity).length > 0 && (
        <div style={{
          marginTop: 16, padding: "14px 18px",
          background: "var(--wr-card)", border: "1px solid var(--wr-border)", borderRadius: 10,
        }}>
          <div style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)",
            letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 12 }}>
            Répartition par entité
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(stats.byEntity)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .map(([et, cnt]) => {
                const em  = ENTITY_META[et] ?? { color: "#94A3B8", label: et };
                const max = Math.max(...Object.values(stats.byEntity).map(v => v as number));
                const pct = Math.round(((cnt as number) / max) * 100);
                return (
                  <div key={et} style={{
                    flex: "1 1 140px", padding: "10px 12px", borderRadius: 7,
                    background: "var(--wr-surface)", border: "1px solid var(--wr-border)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", color: em.color,
                        fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {em.label}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: "var(--wr-font-mono)", fontWeight: 700,
                        color: "var(--wr-text-1)" }}>
                        {formatNumber(cnt as number)}
                      </span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: "var(--wr-border)" }}>
                      <div style={{ height: 3, borderRadius: 2, width: `${pct}%`,
                        background: em.color, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 6,
  background: "var(--wr-card)", border: "1px solid var(--wr-border)",
  fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-1)",
  outline: "none",
};

function filterBtnStyle(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 5,
    padding: "5px 14px", borderRadius: 6, cursor: "pointer",
    background: `${color}18`, border: `1px solid ${color}40`,
    fontSize: 10, fontFamily: "var(--wr-font-mono)", fontWeight: 700,
    color, letterSpacing: "0.05em", alignSelf: "flex-end",
  };
}

const thStyle: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left",
  fontSize: 9, fontFamily: "var(--wr-font-mono)", fontWeight: 700,
  letterSpacing: "0.12em", textTransform: "uppercase",
  color: "var(--wr-text-4)",
};

function PagBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "4px 12px", borderRadius: 5, cursor: disabled ? "not-allowed" : "pointer",
        background: disabled ? "var(--wr-surface)" : "var(--wr-card)",
        border: "1px solid var(--wr-border)",
        fontSize: 10, fontFamily: "var(--wr-font-mono)", color: disabled ? "var(--wr-text-4)" : "var(--wr-text-2)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
