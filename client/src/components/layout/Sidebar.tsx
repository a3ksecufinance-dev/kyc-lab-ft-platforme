import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, ArrowLeftRight, Bell, FolderOpen,
  Search, FileText, LogOut, Shield, ChevronRight, Settings,
  BarChart2, Key, Network,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_LABELS, hasRole } from "../../lib/auth";

const NAV = [
  { path: "/",             icon: LayoutDashboard, label: "Dashboard",      minRole: "analyst"           as const },
  { path: "/customers",    icon: Users,            label: "Clients",        minRole: "analyst"           as const },
  { path: "/transactions", icon: ArrowLeftRight,   label: "Transactions",   minRole: "analyst"           as const },
  { path: "/alerts",       icon: Bell,             label: "Alertes",        minRole: "analyst"           as const },
  { path: "/cases",        icon: FolderOpen,       label: "Dossiers",       minRole: "analyst"           as const },
  { path: "/screening",    icon: Search,           label: "Screening",      minRole: "analyst"           as const },
  { path: "/reports",      icon: FileText,         label: "Rapports",       minRole: "analyst"           as const },
  { path: "/documents",    icon: FileText,         label: "Documents KYC",  minRole: "analyst"           as const },
  { path: "/network",      icon: Network,          label: "Analyse réseau", minRole: "analyst"           as const },
  { path: "/aml-rules",    icon: Shield,           label: "Règles AML",     minRole: "supervisor"        as const },
  { path: "/amld6",        icon: BarChart2,        label: "AMLD6",          minRole: "compliance_officer" as const },
  { path: "/mfa",          icon: Key,              label: "MFA",            minRole: "analyst"           as const },
  { path: "/admin",        icon: Settings,         label: "Administration", minRole: "admin"             as const },
];

// Groupes de navigation
const NAV_GROUPS = [
  { label: "Surveillance",  paths: ["/", "/customers", "/transactions", "/alerts", "/cases"] },
  { label: "Conformité",    paths: ["/screening", "/reports", "/documents", "/network"] },
  { label: "Moteur AML",    paths: ["/aml-rules", "/amld6"] },
  { label: "Système",       paths: ["/mfa", "/admin"] },
];

interface SidebarProps {
  alertCount?: number | undefined;
}

export function Sidebar({ alertCount }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const visibleNav = NAV.filter(({ minRole }) => hasRole(user, minRole));

  return (
    <aside
      className="w-60 min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(180deg, #0A0A0F 0%, #0D0D15 60%, #0A0A0F 100%)",
        borderRight: "1px solid rgba(184,142,61,0.15)",
      }}
    >
      {/* ── Logo WatchReg ─────────────────────────────────────────────────── */}
      <div
        className="px-5 py-5 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(184,142,61,0.12)" }}
      >
        <div className="flex items-center gap-3">
          {/* Bouclier SVG inspiré du logo */}
          <div
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg"
            style={{
              background: "linear-gradient(135deg, rgba(184,142,61,0.25) 0%, rgba(212,175,55,0.15) 100%)",
              border: "1px solid rgba(184,142,61,0.4)",
              boxShadow: "0 0 12px rgba(184,142,61,0.15)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 1.5L2.5 4.5V10C2.5 14 6 17.5 10 18.5C14 17.5 17.5 14 17.5 10V4.5L10 1.5Z"
                fill="url(#shieldGrad)"
                stroke="rgba(212,175,55,0.6)"
                strokeWidth="0.5"
              />
              <path
                d="M7 10.5L9 12.5L13 8.5"
                stroke="rgba(212,175,55,0.9)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="shieldGrad" x1="2.5" y1="1.5" x2="17.5" y2="18.5" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(184,142,61,0.4)" />
                  <stop offset="100%" stopColor="rgba(212,175,55,0.2)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <div className="flex items-baseline gap-0.5">
              <span
                className="text-[15px] font-bold leading-none tracking-tight"
                style={{ color: "#E8E8F0", fontFamily: "'Georgia', serif" }}
              >
                Watch
              </span>
              <span
                className="text-[15px] font-bold leading-none tracking-tight"
                style={{
                  background: "linear-gradient(135deg, #D4AF37 0%, #B8953D 50%, #D4AF37 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  fontFamily: "'Georgia', serif",
                }}
              >
                Reg
              </span>
            </div>
            <p
              className="text-[9px] tracking-[0.15em] uppercase mt-0.5"
              style={{ color: "rgba(184,142,61,0.7)", fontFamily: "monospace" }}
            >
              AML / KYC Solutions
            </p>
          </div>
        </div>
      </div>

      {/* ── Navigation groupée ────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {NAV_GROUPS.map((group) => {
          const items = visibleNav.filter(n => group.paths.includes(n.path));
          if (!items.length) return null;

          return (
            <div key={group.label}>
              <p
                className="px-3 mb-1.5 text-[9px] tracking-[0.2em] uppercase font-medium"
                style={{ color: "rgba(184,142,61,0.45)", fontFamily: "monospace" }}
              >
                {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map(({ path, icon: Icon, label }) => {
                  const active = path === "/" ? location === "/" : location.startsWith(path);
                  return (
                    <Link key={path} href={path}>
                      <a
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-[12.5px] transition-all duration-200 group relative",
                          active
                            ? "text-[#D4AF37]"
                            : "text-[#6E6E8A] hover:text-[#C8C8D8]"
                        )}
                        style={active ? {
                          background: "linear-gradient(90deg, rgba(184,142,61,0.12) 0%, rgba(184,142,61,0.04) 100%)",
                          borderLeft: "2px solid rgba(212,175,55,0.7)",
                        } : {
                          borderLeft: "2px solid transparent",
                        }}
                      >
                        <Icon
                          size={13}
                          className="flex-shrink-0 transition-colors"
                          style={{ color: active ? "#D4AF37" : undefined }}
                        />
                        <span className="flex-1 font-medium tracking-wide">{label}</span>

                        {/* Badge alertes */}
                        {label === "Alertes" && alertCount && alertCount > 0 && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono"
                            style={{
                              background: "rgba(239,68,68,0.15)",
                              color: "#F87171",
                              border: "1px solid rgba(239,68,68,0.25)",
                            }}
                          >
                            {alertCount}
                          </span>
                        )}

                        {active && (
                          <ChevronRight size={11} style={{ color: "rgba(212,175,55,0.5)" }} />
                        )}
                      </a>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── User card ────────────────────────────────────────────────────── */}
      {user && (
        <div
          className="p-3 flex-shrink-0"
          style={{ borderTop: "1px solid rgba(184,142,61,0.12)" }}
        >
          <div
            className="rounded-lg p-2.5 mb-2"
            style={{ background: "rgba(184,142,61,0.06)", border: "1px solid rgba(184,142,61,0.12)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                style={{
                  background: "linear-gradient(135deg, rgba(184,142,61,0.3), rgba(212,175,55,0.15))",
                  border: "1px solid rgba(184,142,61,0.4)",
                  color: "#D4AF37",
                  fontFamily: "Georgia, serif",
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold truncate" style={{ color: "#D8D8E8" }}>
                  {user.name}
                </p>
                <p className="text-[9px] tracking-wider uppercase truncate" style={{ color: "rgba(184,142,61,0.6)", fontFamily: "monospace" }}>
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11.5px] font-medium transition-all duration-200 group"
            style={{ color: "#4A4A6A" }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = "#F87171";
              (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = "#4A4A6A";
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <LogOut size={12} />
            Déconnexion
          </button>
        </div>
      )}
    </aside>
  );
}
