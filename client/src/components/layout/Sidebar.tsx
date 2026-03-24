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
  { path: "/",            icon: LayoutDashboard, label: "Dashboard",    minRole: "analyst"  as const },
  { path: "/customers",   icon: Users,           label: "Clients",      minRole: "analyst"  as const },
  { path: "/transactions",icon: ArrowLeftRight,  label: "Transactions", minRole: "analyst"  as const },
  { path: "/alerts",      icon: Bell,            label: "Alertes",      minRole: "analyst"  as const },
  { path: "/cases",       icon: FolderOpen,      label: "Dossiers",     minRole: "analyst"  as const },
  { path: "/screening",   icon: Search,          label: "Screening",    minRole: "analyst"  as const },
  { path: "/reports",     icon: FileText,        label: "Rapports",      minRole: "analyst"    as const },
  { path: "/documents",  icon: FileText,  label: "Documents KYC", minRole: "analyst"             as const },
  { path: "/network",    icon: Network,   label: "Analyse réseau", minRole: "analyst"            as const },
  { path: "/aml-rules",  icon: Shield,    label: "Règles AML",    minRole: "supervisor"          as const },
  { path: "/amld6",      icon: BarChart2,  label: "AMLD6",         minRole: "compliance_officer"  as const },
  { path: "/mfa",        icon: Key,        label: "MFA",           minRole: "analyst"             as const },
  { path: "/admin",      icon: Settings,   label: "Administration", minRole: "admin"               as const },
];

interface SidebarProps {
  alertCount?: number | undefined;
}

export function Sidebar({ alertCount }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <aside className="w-56 min-h-screen bg-[#0d1117] border-r border-[#21262d] flex flex-col">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[#21262d]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[#58a6ff]/10 border border-[#58a6ff]/20 flex items-center justify-center">
            <Shield size={14} className="text-[#58a6ff]" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#e6edf3] leading-none">LabFT</p>
            <p className="text-[10px] font-mono text-[#7d8590] mt-0.5">KYC / AML</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.filter(({ minRole }) => hasRole(user, minRole)).map(({ path, icon: Icon, label, minRole }) => {
          const active = path === "/" ? location === "/" : location.startsWith(path);
          const isAdmin = minRole === "admin";
          return (
            <div key={path}>
              {isAdmin && <div className="my-2 border-t border-[#21262d]" />}
              <Link href={path}>
                <a className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors group",
                  active
                    ? isAdmin
                      ? "bg-red-400/10 text-red-400 border border-red-400/20"
                      : "bg-[#1f6feb]/20 text-[#58a6ff] border border-[#1f6feb]/30"
                    : "text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#161b22]"
                )}>
                  <Icon size={14} className="flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {label === "Alertes" && alertCount && alertCount > 0 && (
                    <span className="text-[10px] font-mono bg-red-400/15 text-red-400 border border-red-400/20 rounded px-1.5 py-0.5">
                      {alertCount}
                    </span>
                  )}
                  {active && <ChevronRight size={12} className="opacity-60" />}
                </a>
              </Link>
            </div>
          );
        })}
      </nav>

      {/* User */}
      {user && (
        <div className="border-t border-[#21262d] p-3">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-full bg-[#1f6feb]/20 border border-[#1f6feb]/30 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-mono text-[#58a6ff]">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-[#e6edf3] truncate">{user.name}</p>
              <p className="text-[10px] font-mono text-[#7d8590] truncate">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-[#7d8590] hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <LogOut size={12} />
            Déconnexion
          </button>
        </div>
      )}
    </aside>
  );
}
