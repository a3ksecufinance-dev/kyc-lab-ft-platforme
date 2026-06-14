import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useI18n } from "../hooks/useI18n";
import { Sidebar } from "../components/layout/Sidebar";
import {
  BellRing, Check, CheckCheck, AlertTriangle,
  Shield, FileText, Snowflake, Clock, Bell, RefreshCw,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { icon: typeof Bell; color: string }> = {
  ALERT_ASSIGNED:   { icon: AlertTriangle, color: "#F59E0B" },
  CASE_ESCALATED:   { icon: FileText,      color: "#EF4444" },
  SLA_BREACH:       { icon: Clock,         color: "#EF4444" },
  SCREENING_MATCH:  { icon: Shield,        color: "#EF4444" },
  APPROVAL_PENDING: { icon: Check,         color: "#8B5CF6" },
  APPROVAL_DECIDED: { icon: CheckCheck,    color: "#2DD4A0" },
  WALLET_FROZEN:    { icon: Snowflake,     color: "#3B82F6" },
  CBS_DISCREPANCY:  { icon: AlertTriangle, color: "#F59E0B" },
  SYSTEM:           { icon: Bell,          color: "#6B7280" },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export function NotificationsPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const TYPE_LABELS: Record<string, string> = {
    ALERT_ASSIGNED:   t.notifications.typeAlertAssigned,
    CASE_ESCALATED:   t.notifications.typeCaseEscalated,
    SLA_BREACH:       t.notifications.typeSlaBreach,
    SCREENING_MATCH:  t.notifications.typeScreeningMatch,
    APPROVAL_PENDING: t.notifications.typeApprovalPending,
    APPROVAL_DECIDED: t.notifications.typeApprovalDecided,
    WALLET_FROZEN:    t.notifications.typeWalletFrozen,
    CBS_DISCREPANCY:  t.notifications.typeCbsDiscrepancy,
    SYSTEM:           t.notifications.typeSystem,
  };

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t.notifications.justNow;
    if (mins < 60) return t.notifications.minutesAgo.replace("{n}", String(mins));
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t.notifications.hoursAgo.replace("{n}", String(hrs));
    const days = Math.floor(hrs / 24);
    return t.notifications.daysAgo.replace("{n}", String(days));
  }

  const notifs = trpc.notifications.list.useQuery({
    limit: 100,
    unreadOnly: filter === "unread",
  });
  const unread = trpc.notifications.unreadCount.useQuery();
  const markRead = trpc.notifications.markRead.useMutation();
  const markAllRead = trpc.notifications.markAllRead.useMutation();
  const utils = trpc.useUtils();

  const handleMarkRead = async (id: number) => {
    await markRead.mutateAsync({ id });
    utils.notifications.list.invalidate();
    utils.notifications.unreadCount.invalidate();
  };

  const handleMarkAllRead = async () => {
    await markAllRead.mutateAsync();
    utils.notifications.list.invalidate();
    utils.notifications.unreadCount.invalidate();
  };

  const items = notifs.data ?? [];
  const unreadCount = unread.data?.count ?? 0;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--wr-bg)" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "28px 36px", overflow: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BellRing size={22} style={{ color: "var(--wr-accent)" }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--wr-text-1)" }}>
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: "var(--wr-font-mono)",
                background: "rgba(255,101,112,0.13)", color: "#FF6570",
                border: "1px solid rgba(255,101,112,0.22)",
                borderRadius: 10, padding: "2px 8px",
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => notifs.refetch()}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 6,
                border: "1px solid var(--wr-border)",
                background: "var(--wr-card)", cursor: "pointer",
                fontSize: 12, color: "var(--wr-text-2)",
              }}
            >
              <RefreshCw size={12} />
              {t.common.refresh}
            </button>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 6,
                  border: "1px solid rgba(45,212,160,0.25)",
                  background: "rgba(45,212,160,0.08)", cursor: "pointer",
                  fontSize: 12, color: "#2DD4A0",
                }}
              >
                <CheckCheck size={12} />
                {t.notifications.markAllRead}
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["all", "unread"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 12,
                border: filter === f
                  ? "1px solid var(--wr-accent)"
                  : "1px solid var(--wr-border)",
                background: filter === f ? "rgba(201,162,39,0.08)" : "var(--wr-card)",
                color: filter === f ? "var(--wr-accent)" : "var(--wr-text-2)",
                cursor: "pointer", fontWeight: filter === f ? 600 : 400,
              }}
            >
              {f === "all" ? t.notifications.all : `${t.notifications.unread} (${unreadCount})`}
            </button>
          ))}
        </div>

        {/* List */}
        {notifs.isLoading ? (
          <div style={{ color: "var(--wr-text-3)", padding: 40, textAlign: "center" }}>
            {t.common.loading}
          </div>
        ) : items.length === 0 ? (
          <div style={{
            padding: 60, textAlign: "center",
            color: "var(--wr-text-3)", fontSize: 14,
          }}>
            <Bell size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
            <div>{t.notifications.noNotifications}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map(n => {
              const style = TYPE_STYLE[n.type] ?? TYPE_STYLE["SYSTEM"]!;
              const cfg = { ...style, label: TYPE_LABELS[n.type] ?? TYPE_LABELS["SYSTEM"]! };
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "12px 16px", borderRadius: 8,
                    background: n.isRead ? "var(--wr-card)" : "rgba(201,162,39,0.04)",
                    border: n.isRead
                      ? "1px solid var(--wr-border)"
                      : "1px solid rgba(201,162,39,0.15)",
                    cursor: n.isRead ? "default" : "pointer",
                    transition: "all 0.15s",
                  }}
                  onClick={() => !n.isRead && handleMarkRead(n.id)}
                >
                  {/* Icon */}
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: `${cfg.color}11`,
                    border: `1px solid ${cfg.color}33`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={14} style={{ color: cfg.color }} />
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{
                        fontSize: 12, fontWeight: n.isRead ? 400 : 600,
                        color: n.isRead ? "var(--wr-text-2)" : "var(--wr-text-1)",
                      }}>
                        {n.title}
                      </span>
                      <span style={{
                        fontSize: 9, fontFamily: "var(--wr-font-mono)",
                        color: cfg.color, letterSpacing: "0.06em",
                        background: `${cfg.color}11`, border: `1px solid ${cfg.color}33`,
                        borderRadius: 4, padding: "1px 5px",
                      }}>
                        {cfg.label}
                      </span>
                    </div>
                    {n.message && (
                      <div style={{
                        fontSize: 11, color: "var(--wr-text-3)",
                        lineHeight: 1.4, marginBottom: 4,
                      }}>
                        {n.message}
                      </div>
                    )}
                    <div style={{
                      fontSize: 10, color: "var(--wr-text-3)",
                      fontFamily: "var(--wr-font-mono)", opacity: 0.7,
                    }}>
                      {timeAgo(n.createdAt as unknown as string)}
                      {n.entityType && n.entityId && (
                        <span style={{ marginLeft: 8, opacity: 0.5 }}>
                          {n.entityType}#{n.entityId}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Unread dot */}
                  {!n.isRead && (
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: "var(--wr-accent)",
                      boxShadow: "0 0 6px rgba(201,162,39,0.4)",
                      flexShrink: 0, marginTop: 4,
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
