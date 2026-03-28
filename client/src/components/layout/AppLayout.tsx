import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { trpc } from "../../lib/trpc";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { data: alertStats } = trpc.alerts.stats.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#111827" }}>
      <Sidebar alertCount={alertStats?.open ?? undefined} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* ── Topbar ────────────────────────────────────────────────────── */}
        <header style={{
          height: 52,
          background: "#172035",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          flexShrink: 0,
        }}>
          {title ? (
            <h1 style={{
              fontSize: 17,
              fontWeight: 400,
              color: "#C8D8EC",
              fontFamily: "'Playfair Display', Georgia, serif",
              letterSpacing: "-0.3px",
              margin: 0,
            }}>
              {title}
            </h1>
          ) : <div />}

          {/* Statut système */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 6, height: 6,
              borderRadius: "50%",
              background: "#34D399",
              boxShadow: "0 0 6px rgba(52,211,153,0.5)",
              display: "inline-block",
            }} />
            <span style={{
              fontSize: 10,
              fontFamily: "monospace",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(212,175,55,0.35)",
            }}>
              Système opérationnel
            </span>
          </div>
        </header>

        {/* ── Contenu ───────────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflow: "auto" }}>
          <div style={{
            maxWidth: 1400,
            margin: "0 auto",
            padding: "24px",
          }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
