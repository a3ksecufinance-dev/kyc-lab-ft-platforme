import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { trpc } from "../../lib/trpc";
import { useI18n } from "../../hooks/useI18n";
import { useAuth } from "../../hooks/useAuth";
import { Bell } from "lucide-react";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  breadcrumbs?: Breadcrumb[];
}

function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  const { lang } = useI18n();
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  const ss = String(time.getSeconds()).padStart(2, "0");
  const locale = lang === "en" ? "en-US" : "fr-FR";
  const dd = time.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <span style={{
        fontSize: 12, fontFamily: "var(--wr-font-mono)",
        color: "var(--wr-text-2)", letterSpacing: "0.08em",
        lineHeight: 1,
      }}>
        {hh}<span style={{ opacity: 0.5, animation: "pulse 1s step-end infinite" }}>:</span>{mm}
        <span style={{ opacity: 0.4 }}>:{ss}</span>
      </span>
      <span style={{
        fontSize: 9, fontFamily: "var(--wr-font-mono)",
        color: "var(--wr-text-4)", letterSpacing: "0.06em",
        marginTop: 1,
      }}>
        {dd}
      </span>
    </div>
  );
}

export function AppLayout({ children, title, breadcrumbs }: AppLayoutProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: alertStats } = trpc.alerts.stats.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const { data: caseStats } = trpc.cases.stats.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const { data: customerStats } = trpc.customers.stats.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  const openAlerts     = alertStats?.open ?? 0;
  const criticalAlerts = (alertStats?.byPriority?.["CRITICAL"] as number | undefined) ?? 0;
  const openCasesCount   = (caseStats?.byStatus?.["OPEN"] as number | undefined) ?? 0;
  const pendingKycCount  = (customerStats?.byStatus?.["PENDING"] as number | undefined) ?? 0;

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      /* Fond premium : grille de points + dégradés directionnel */
      background: [
        "radial-gradient(circle,rgba(255,255,255,0.022) 1px,transparent 1px)",
        "radial-gradient(ellipse 70% 50% at 80% 0%,rgba(20,50,100,0.18) 0%,transparent 60%)",
        "radial-gradient(ellipse 50% 60% at 10% 100%,rgba(10,30,70,0.20) 0%,transparent 70%)",
        "var(--wr-bg)",
      ].join(", "),
      backgroundSize: "28px 28px, 100% 100%, 100% 100%, 100% 100%",
    }}>
      <Sidebar
        alertCount={openAlerts > 0 ? openAlerts : undefined}
        openCasesCount={openCasesCount > 0 ? openCasesCount : undefined}
        pendingKycCount={pendingKycCount > 0 ? pendingKycCount : undefined}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* ── Topbar ──────────────────────────────────────────────────────── */}
        <header style={{
          height: 54,
          background: "var(--wr-topbar-bg)",
          borderBottom: "1px solid var(--wr-topbar-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          flexShrink: 0,
          boxShadow: "var(--wr-shadow-xs)",
          position: "relative",
        }}>
          {/* Subtle bottom gradient line */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(20,184,166,0.12), transparent)",
            pointerEvents: "none",
          }} />

          {/* Left: title + breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {(title || (breadcrumbs && breadcrumbs.length > 0)) ? (
              <>
                <div style={{
                  width: 3, height: 18, borderRadius: 2,
                  background: "linear-gradient(180deg, var(--wr-gold-bright), var(--wr-gold))",
                  flexShrink: 0,
                }} />
                <div>
                  {breadcrumbs && breadcrumbs.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                      {breadcrumbs.map((crumb, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {i > 0 && <span style={{ fontSize: 9, color: "var(--wr-text-4)", opacity: 0.5 }}>/</span>}
                          {crumb.href ? (
                            <a href={crumb.href} style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-4)", textDecoration: "none", letterSpacing: "0.04em" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "var(--wr-text-2)")}
                              onMouseLeave={e => (e.currentTarget.style.color = "var(--wr-text-4)")}
                            >
                              {crumb.label}
                            </a>
                          ) : (
                            <span style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)", letterSpacing: "0.04em" }}>{crumb.label}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  {title && (
                    <h1 style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: "var(--wr-text-1)",
                      fontFamily: "var(--wr-font-serif)",
                      letterSpacing: "-0.25px",
                      margin: 0,
                    }}>
                      {title}
                    </h1>
                  )}
                </div>
              </>
            ) : <div />}
          </div>

          {/* Right: status cluster */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>

            {/* Alert badge */}
            {openAlerts > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 6,
                background: criticalAlerts > 0
                  ? "rgba(255,101,112,0.09)"
                  : "rgba(245,158,11,0.09)",
                border: `1px solid ${criticalAlerts > 0
                  ? "rgba(255,101,112,0.20)"
                  : "rgba(245,158,11,0.20)"}`,
              }}>
                <Bell size={10} style={{
                  color: criticalAlerts > 0 ? "#FF6570" : "#F59E0B",
                }} />
                <span style={{
                  fontSize: 10, fontFamily: "var(--wr-font-mono)", fontWeight: 700,
                  color: criticalAlerts > 0 ? "#FF6570" : "#F59E0B",
                  letterSpacing: "0.05em",
                }}>
                  {openAlerts} {criticalAlerts > 0 ? `· ${criticalAlerts} ${t.common.critical}${criticalAlerts > 1 ? t.common.pluralS : ""}` : ""}
                </span>
              </div>
            )}

            {/* Live clock */}
            <LiveClock />

            {/* Vertical divider */}
            <div style={{ width: 1, height: 20, background: "var(--wr-border)" }} />

            {/* System status */}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#2DD4A0",
                boxShadow: "0 0 8px rgba(45,212,160,0.55)",
                display: "inline-block",
              }} />
              <span style={{
                fontSize: 9.5,
                fontFamily: "var(--wr-font-mono)",
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                color: "var(--wr-text-3)",
              }}>
                {t.common.operational}
              </span>
            </div>

            {/* User chip */}
            {user && (
              <div style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "4px 10px 4px 7px", borderRadius: 6,
                background: "var(--wr-hover)", border: "1px solid var(--wr-border)",
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: "rgba(20,184,166,0.14)",
                  border: "1px solid rgba(20,184,166,0.20)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9.5, fontWeight: 700,
                  color: "var(--wr-gold)",
                  fontFamily: "var(--wr-font-serif)",
                  flexShrink: 0,
                }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span style={{
                  fontSize: 11, fontFamily: "var(--wr-font-mono)",
                  color: "var(--wr-text-2)",
                  maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {user.name}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflow: "auto", position: "relative" }}>
          <div style={{
            maxWidth: 1440,
            margin: "0 auto",
            padding: "26px 24px",
          }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
