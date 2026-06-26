import type * as React from "react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, ArrowLeftRight, Bell,
  FolderOpen, FileText, LogOut, Shield,
  Settings, BarChart2, Key, Network,
  Sun, Moon, Repeat2, Wallet, Users2, Globe,
  ShieldCheck, FileBarChart, Scale, Gauge, ScrollText, Building2,
  ChevronLeft, ChevronRight, GitMerge, KeyRound,
  Cog, BellRing, Plug, UserCheck, VolumeX,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../hooks/useI18n";
import { useTheme } from "../../context/ThemeContext";
import { useInstitution } from "../../context/InstitutionContext";
import { ROLE_LABELS, hasRole } from "../../lib/auth";
import type { Lang } from "../../lib/i18n";

const LOGO_B64 = "data:image/png;base64,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";

// ─── Types ────────────────────────────────────────────────────────────────────

type InstitutionFlagKey = "wallets" | "agentAccounts" | "bamReports" | "agentNetwork" | "correspondentBanking";

type NavItem = {
  path:    string;
  icon:    React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  labelKey: keyof ReturnType<typeof useI18n>["t"]["nav"];
  minRole: "analyst" | "supervisor" | "compliance_officer" | "admin";
  badge?:  boolean;
  institutionFlag?: InstitutionFlagKey;
};

type NavGroup = {
  labelKey: keyof ReturnType<typeof useI18n>["t"]["nav"];
  items: NavItem[];
  institutionFlag?: InstitutionFlagKey;
};

// ─── Nav groups ───────────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "surveillance",
    items: [
      { path: "/",             icon: LayoutDashboard, labelKey: "dashboard",    minRole: "analyst" },
      { path: "/alerts",       icon: Bell,            labelKey: "alerts",       minRole: "analyst", badge: true },
      { path: "/cases",        icon: FolderOpen,      labelKey: "cases",        minRole: "analyst", badge: true },
      { path: "/transactions", icon: ArrowLeftRight,  labelKey: "transactions", minRole: "analyst" },
      { path: "/customers",    icon: Users,           labelKey: "customers",    minRole: "analyst", badge: true },
    ],
  },
  {
    labelKey: "kycIdentity",
    items: [
      { path: "/screening",   icon: ShieldCheck,  labelKey: "screening",   minRole: "analyst" },
      { path: "/documents",   icon: FileText,     labelKey: "documents",   minRole: "analyst" },
      { path: "/network",     icon: Network,      labelKey: "network",     minRole: "analyst" },
    ],
  },
  {
    labelKey: "amlEngine",
    items: [
      { path: "/aml-rules",   icon: Shield,       labelKey: "amlRules",    minRole: "analyst" },
      { path: "/good-guys",   icon: UserCheck,    labelKey: "goodGuys",    minRole: "analyst" },
      { path: "/silencing",   icon: VolumeX,      labelKey: "silencing",   minRole: "analyst" },
      { path: "/pkyc",        icon: Repeat2,      labelKey: "pkyc",        minRole: "analyst" },
      { path: "/reports",     icon: FileBarChart, labelKey: "reports",     minRole: "analyst" },
      { path: "/approvals",   icon: GitMerge,     labelKey: "approvals",   minRole: "compliance_officer", badge: true },
    ],
  },
  {
    labelKey: "regulatory",
    items: [
      { path: "/amld6",         icon: Scale,      labelKey: "amld6",         minRole: "compliance_officer" },
      { path: "/sla",           icon: Gauge,      labelKey: "sla",           minRole: "analyst" },
      { path: "/travel-rule",   icon: Globe,      labelKey: "travelRule",    minRole: "compliance_officer" },
      { path: "/correspondent", icon: Building2,  labelKey: "correspondent", minRole: "analyst", institutionFlag: "correspondentBanking" },
    ],
  },
  {
    labelKey: "account",
    items: [
      { path: "/mfa",           icon: Key,     labelKey: "mfa",           minRole: "analyst" },
      { path: "/notifications", icon: BellRing, labelKey: "notifications", minRole: "analyst", badge: true },
    ],
  },
  {
    labelKey: "system",
    items: [
      { path: "/audit",      icon: ScrollText, labelKey: "audit",      minRole: "supervisor" },
      { path: "/connectors", icon: Plug,       labelKey: "connectors", minRole: "supervisor" },
      { path: "/config",     icon: Cog,        labelKey: "config",     minRole: "admin" },
      { path: "/admin",      icon: Settings,   labelKey: "admin",      minRole: "admin" },
      { path: "/license",    icon: KeyRound,   labelKey: "license",    minRole: "admin" },
    ],
  },
  {
    labelKey: "mobileInstitution",
    institutionFlag: "wallets",
    items: [
      { path: "/wallets",           icon: Wallet,    labelKey: "wallets",          minRole: "analyst" },
      { path: "/wallet-compliance", icon: Shield,    labelKey: "walletCompliance", minRole: "analyst" },
      { path: "/agents",            icon: Users2,    labelKey: "agents",           minRole: "analyst" },
      { path: "/bam",               icon: BarChart2, labelKey: "bam",              minRole: "compliance_officer" },
    ],
  },
];

// ─── Palette sidebar ──────────────────────────────────────────────────────────

const G = {
  // Teal — nouvelle couleur brand (remplace gold)
  gold:            "#14B8A6",
  goldBright:      "#2DD4C2",
  goldDim:         "rgba(20,184,166,0.35)",

  // Active state — teal
  activeBg:        "rgba(20,184,166,0.13)",
  activeBorder:    "rgba(20,184,166,0.28)",

  // Hover
  hoverBg:         "rgba(255,255,255,0.06)",
  hoverText:       "var(--wr-sidebar-text-2)",

  // Textes
  t1:              "var(--wr-sidebar-text-1)",
  t2:              "var(--wr-sidebar-text-2)",
  t3:              "var(--wr-sidebar-text-3)",

  // Bordures sidebar
  border:          "var(--wr-sidebar-border)",
  border2:         "var(--wr-sidebar-border2)",
};

// ─── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: collapsed ? 32 : 26, height: 26,
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.09)",
        background: "rgba(255,255,255,0.04)",
        cursor: "pointer",
        color: G.t3,
        transition: "all 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.color = G.t1;
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.10)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.18)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.color = G.t3;
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.09)";
      }}
    >
      {isDark ? <Sun size={12} /> : <Moon size={12} />}
    </button>
  );
}

// ─── Language toggle ──────────────────────────────────────────────────────────

function LangToggle() {
  const { lang, setLang, t } = useI18n();
  const next: Lang = lang === "fr" ? "en" : "fr";
  return (
    <button
      onClick={() => setLang(next)}
      title={next === "en" ? t.common.switchToEn : t.common.switchToFr}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 7px", borderRadius: 5,
        border: "1px solid rgba(255,255,255,0.09)",
        background: "rgba(255,255,255,0.04)",
        cursor: "pointer",
        fontSize: 10, fontFamily: "var(--wr-font-mono)",
        letterSpacing: "0.08em",
        color: G.t3,
        transition: "all 0.15s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.color = G.t1;
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.10)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.18)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.color = G.t3;
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.09)";
      }}
    >
      <span style={{ fontWeight: lang === "fr" ? 700 : 400, color: lang === "fr" ? G.t1 : undefined }}>FR</span>
      <span style={{ opacity: 0.25 }}>/</span>
      <span style={{ fontWeight: lang === "en" ? 700 : 400, color: lang === "en" ? G.t1 : undefined }}>EN</span>
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  alertCount?:     number | undefined;
  openCasesCount?: number | undefined;
  pendingKycCount?: number | undefined;
}

export function Sidebar({ alertCount, openCasesCount, pendingKycCount }: SidebarProps) {
  const [location]   = useLocation();
  const { user, logout } = useAuth();
  const { t }        = useI18n();
  const institutionFlags = useInstitution();
  const [collapsed, setCollapsed] = useState(false);

  // Badge map — chemin → compteur métier
  const badgeMap: Record<string, number | undefined> = {
    "/alerts":    alertCount,
    "/cases":     openCasesCount,
    "/customers": pendingKycCount,
  };

  const W = collapsed ? 56 : 236;

  return (
    <aside
      style={{
        width: W,
        minHeight: "100vh",
        background: [
          "radial-gradient(ellipse 80% 30% at 10% 0%, rgba(20,184,166,0.07) 0%, transparent 70%)",
          "radial-gradient(ellipse 100% 40% at 50% 100%, rgba(13,148,136,0.10) 0%, transparent 70%)",
          "linear-gradient(180deg, #07121C 0%, #050E18 35%, #040A12 70%, #030810 100%)",
        ].join(", "),
        borderRight: `1px solid ${G.border}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "relative",
        transition: "width 0.2s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden",
      }}
    >
      {/* Teal top accent line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: "linear-gradient(90deg, rgba(20,184,166,0.80), rgba(20,184,166,0.15), transparent)",
        pointerEvents: "none",
      }} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: collapsed ? "16px 8px 12px" : "16px 14px 12px",
        borderBottom: `1px solid ${G.border}`,
        overflow: "hidden",
      }}>
        {collapsed ? (
          /* Mode compact — logo réduit centré */
          <div style={{ display: "flex", justifyContent: "center" }}>
            <img
              src={LOGO_B64}
              alt="WatchReg"
              style={{ height: 28, width: 28, objectFit: "contain", borderRadius: 4 }}
            />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <img
                src={LOGO_B64}
                alt="WatchReg"
                style={{ height: 34, width: "auto", objectFit: "contain", objectPosition: "left center" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <ThemeToggle collapsed={false} />
                <LangToggle />
              </div>
            </div>
            {/* Platform status pill */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 8px", borderRadius: 5,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "#2DD4A0",
                boxShadow: "0 0 6px rgba(45,212,160,0.55)",
                display: "inline-block", flexShrink: 0,
                animation: "wr-pulse-dot 1.8s ease-in-out infinite",
              }} />
              <span style={{
                fontSize: 8.5, fontFamily: "var(--wr-font-mono)",
                letterSpacing: "0.18em", textTransform: "uppercase",
                color: "rgba(200,220,240,0.35)",
              }}>
                Compliance Platform
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav style={{
        flex: 1,
        padding: collapsed ? "8px 4px" : "8px 8px",
        overflowY: "auto",
        overflowX: "hidden",
      }}>
        {NAV_GROUPS.map((group, groupIdx) => {
          if (group.institutionFlag && !institutionFlags[group.institutionFlag]) return null;
          const visible = group.items.filter(({ minRole, institutionFlag }) =>
            hasRole(user, minRole) &&
            (!institutionFlag || institutionFlags[institutionFlag])
          );
          if (!visible.length) return null;

          return (
            <div key={groupIdx} style={{ marginBottom: collapsed ? 8 : 14 }}>
              {/* Group label — masqué en mode compact */}
              {!collapsed && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 8px 4px" }}>
                  <span style={{
                    fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
                    color: "rgba(140,190,220,0.55)",
                    fontFamily: "var(--wr-font-mono)", fontWeight: 700,
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    {t.nav[group.labelKey]}
                  </span>
                  <div style={{
                    flex: 1, height: 1,
                    background: "linear-gradient(90deg, rgba(255,255,255,0.06), transparent)",
                  }} />
                </div>
              )}

              {visible.map(({ path, icon: Icon, labelKey, badge = false }) => {
                const active  = path === "/" ? location === "/" : location.startsWith(path);
                const count   = badge ? (badgeMap[path] ?? 0) : 0;

                return (
                  <Link key={path} href={path}>
                    <a
                      title={collapsed ? t.nav[labelKey] : undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: collapsed ? 0 : 9,
                        justifyContent: collapsed ? "center" : "flex-start",
                        padding: collapsed ? "9px 0" : "7px 10px",
                        borderRadius: 7,
                        marginBottom: 1,
                        fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        fontFamily: "var(--wr-font-sans)",
                        cursor: "pointer",
                        textDecoration: "none",
                        position: "relative",
                        /* Active — box complet, plus de border-left seul */
                        background: active ? G.activeBg : "transparent",
                        border: active
                          ? `1px solid ${G.activeBorder}`
                          : "1px solid transparent",
                        color: active ? G.goldBright : G.t3,
                        transition: "color 0.15s, background 0.15s, border-color 0.15s",
                      }}
                      onMouseEnter={e => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.color      = G.t2;       /* neutre, pas gold */
                          (e.currentTarget as HTMLElement).style.background = G.hoverBg;  /* 0.06, était 0.025 */
                          (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)";
                        }
                      }}
                      onMouseLeave={e => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.color      = G.t3;
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                          (e.currentTarget as HTMLElement).style.borderColor = "transparent";
                        }
                      }}
                    >
                      <Icon
                        size={14}                         /* ↑ était 12 */
                        style={{
                          flexShrink: 0,
                          color:   active ? G.gold : "currentColor",
                          opacity: active ? 1 : 0.50,
                          transition: "opacity 0.15s, color 0.15s",
                        }}
                      />
                      {!collapsed && (
                        <>
                          <span style={{ flex: 1, letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden" }}>
                            {t.nav[labelKey]}
                          </span>
                          {count > 0 && (
                            <span style={{
                              fontSize: 9,
                              background: "rgba(255,101,112,0.13)",
                              color: "#FF6570",
                              border: "1px solid rgba(255,101,112,0.22)",
                              borderRadius: 10,
                              padding: "1px 6px",
                              fontFamily: "var(--wr-font-mono)",
                              fontWeight: 700,
                              letterSpacing: "0.04em",
                              flexShrink: 0,
                            }}>
                              {count}
                            </span>
                          )}
                        </>
                      )}
                      {/* Mode compact — indicateur badge discret */}
                      {collapsed && count > 0 && (
                        <span style={{
                          position: "absolute", top: 4, right: 4,
                          width: 6, height: 6, borderRadius: "50%",
                          background: "#FF6570",
                          boxShadow: "0 0 4px rgba(255,101,112,0.6)",
                        }} />
                      )}
                    </a>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ── Collapse toggle ─────────────────────────────────────────────────── */}
      <div style={{
        padding: "4px 8px 8px",
        borderTop: `1px solid rgba(255,255,255,0.04)`,
        display: "flex",
        justifyContent: collapsed ? "center" : "flex-end",
      }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Développer le menu" : "Réduire le menu"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 22, borderRadius: 5,
            border: "1px solid rgba(255,255,255,0.07)",
            background: "transparent",
            cursor: "pointer",
            color: G.t3,
            transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = G.t2;
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = G.t3;
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
        </button>
      </div>

      {/* ── Footer: user + logout ───────────────────────────────────────────── */}
      {user && (
        <div style={{ borderTop: `1px solid ${G.border}` }}>
          {!collapsed ? (
            <>
              {/* User info */}
              <div style={{ padding: "10px 12px 6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 600,
                    color: G.t1,
                    fontFamily: "var(--wr-font-sans)",
                  }}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{
                      fontSize: 12, fontWeight: 500, color: G.t1,
                      margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {user.name}
                    </p>
                    <p style={{
                      fontSize: 8.5, color: G.t3,
                      fontFamily: "var(--wr-font-mono)", textTransform: "uppercase",
                      letterSpacing: "0.12em", margin: "1px 0 0",
                    }}>
                      {ROLE_LABELS[user.role]}
                    </p>
                  </div>
                </div>
              </div>

              {/* Logout + version */}
              <div style={{
                padding: "0 8px 10px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <button
                  onClick={logout}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "5px 9px", borderRadius: 6,
                    border: `1px solid rgba(255,255,255,0.08)`,
                    background: "transparent", cursor: "pointer",
                    fontSize: 11, color: G.t3,
                    fontFamily: "var(--wr-font-mono)",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = "#FF6570";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,101,112,0.22)";
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,101,112,0.07)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = G.t3;
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <LogOut size={11} />
                  {t.nav.logout}
                </button>
                <span style={{
                  fontSize: 8.5, fontFamily: "var(--wr-font-mono)",
                  color: "rgba(200,220,240,0.18)", letterSpacing: "0.08em",
                }}>
                  v2.5
                </span>
              </div>
            </>
          ) : (
            /* Mode compact — avatar + logout icône */
            <div style={{ padding: "8px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 600, color: G.t1,
                fontFamily: "var(--wr-font-sans)",
              }}
                title={user.name}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={logout}
                title={t.nav.logout}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 30, height: 26, borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "transparent", cursor: "pointer",
                  color: G.t3, transition: "all 0.15s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.color = "#FF6570";
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,101,112,0.07)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.color = G.t3;
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <LogOut size={11} />
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
