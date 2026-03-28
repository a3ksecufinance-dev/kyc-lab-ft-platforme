import type * as React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, ArrowLeftRight, Bell,
  FolderOpen, Search, FileText, LogOut, Shield,
  ChevronRight, Settings, BarChart2, Key, Network,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_LABELS, hasRole } from "../../lib/auth";

const LOGO_B64 = "data:image/png;base64,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";

type NavItem = {
  path:    string;
  icon:    React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  label:   string;
  minRole: "analyst" | "supervisor" | "compliance_officer" | "admin";
  badge?:  boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Surveillance",
    items: [
      { path: "/",             icon: LayoutDashboard, label: "Dashboard",      minRole: "analyst"            as const },
      { path: "/customers",    icon: Users,            label: "Clients",        minRole: "analyst"            as const },
      { path: "/transactions", icon: ArrowLeftRight,   label: "Transactions",   minRole: "analyst"            as const },
      { path: "/alerts",       icon: Bell,             label: "Alertes",        minRole: "analyst"            as const, badge: true },
      { path: "/cases",        icon: FolderOpen,       label: "Dossiers",       minRole: "analyst"            as const },
    ],
  },
  {
    label: "Conformité",
    items: [
      { path: "/screening",    icon: Search,           label: "Screening",      minRole: "analyst"            as const },
      { path: "/reports",      icon: FileText,         label: "Rapports",       minRole: "analyst"            as const },
      { path: "/documents",    icon: FileText,         label: "Documents KYC",  minRole: "analyst"            as const },
      { path: "/network",      icon: Network,          label: "Analyse réseau", minRole: "analyst"            as const },
    ],
  },
  {
    label: "Moteur AML",
    items: [
      { path: "/aml-rules",    icon: Shield,           label: "Règles AML",     minRole: "supervisor"         as const },
      { path: "/amld6",        icon: BarChart2,        label: "AMLD6",          minRole: "compliance_officer" as const },
    ],
  },
  {
    label: "Système",
    items: [
      { path: "/mfa",          icon: Key,              label: "MFA",            minRole: "analyst"            as const },
      { path: "/admin",        icon: Settings,         label: "Administration", minRole: "admin"              as const },
    ],
  },
];

interface SidebarProps { alertCount?: number | undefined; }

export function Sidebar({ alertCount }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <aside
      style={{
        width: 230,
        minHeight: "100vh",
        background: "#172035",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: "16px 16px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <img
          src={LOGO_B64}
          alt="WatchReg"
          style={{ height: 40, width: "auto", objectFit: "contain", objectPosition: "left center" }}
        />
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: "8px 8px", overflowY: "auto" }}>
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter(({ minRole }) => hasRole(user, minRole));
          if (!visible.length) return null;
          return (
            <div key={group.label} style={{ marginBottom: 4 }}>
              <p style={{
                fontSize: 9.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(212,175,55,0.35)",
                padding: "12px 10px 5px",
                fontFamily: "monospace",
                margin: 0,
              }}>
                {group.label}
              </p>
              {visible.map(({ path, icon: Icon, label, badge = false }) => {
                const active = path === "/" ? location === "/" : location.startsWith(path);
                return (
                  <Link key={path} href={path}>
                    <a
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        padding: "7.5px 10px",
                        borderRadius: 8,
                        marginBottom: 1,
                        fontSize: 12.5,
                        fontWeight: active ? 500 : 400,
                        cursor: "pointer",
                        textDecoration: "none",
                        borderLeft: active ? "2px solid rgba(212,175,55,0.65)" : "2px solid transparent",
                        background: active ? "linear-gradient(90deg,rgba(212,175,55,0.1),rgba(212,175,55,0.02))" : "transparent",
                        color: active ? "#D4AF37" : "#526070",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "#9AAABB"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}}
                      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "#526070"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}}
                    >
                      <Icon size={13} style={{ flexShrink: 0, opacity: active ? 1 : 0.65 }} />
                      <span style={{ flex: 1 }}>{label}</span>
                      {badge && alertCount && alertCount > 0 && (
                        <span style={{
                          fontSize: 9,
                          background: "rgba(248,113,113,0.15)",
                          color: "#F87171",
                          border: "1px solid rgba(248,113,113,0.25)",
                          borderRadius: 10,
                          padding: "1px 6px",
                          fontFamily: "monospace",
                          fontWeight: 600,
                        }}>
                          {alertCount}
                        </span>
                      )}
                      {active && <ChevronRight size={11} style={{ opacity: 0.4 }} />}
                    </a>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ── Utilisateur ───────────────────────────────────────────────────── */}
      {user && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
            <div style={{
              width: 30, height: 30,
              borderRadius: "50%",
              background: "linear-gradient(135deg,rgba(212,175,55,0.2),rgba(212,175,55,0.06))",
              border: "1.5px solid rgba(212,175,55,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 600, color: "#D4AF37", flexShrink: 0,
            }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: "#B8C8D8", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.name}
              </p>
              <p style={{ fontSize: 9, color: "rgba(212,175,55,0.4)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", margin: "1px 0 0" }}>
                {ROLE_LABELS[user.role]}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "6px 8px", borderRadius: 6, border: "none",
              background: "transparent", cursor: "pointer",
              fontSize: 12, color: "#3A5068", transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#F87171"; (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#3A5068"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <LogOut size={12} />
            Déconnexion
          </button>
        </div>
      )}
    </aside>
  );
}
