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
    <div className="flex min-h-screen" style={{ background: "#07070D" }}>
      <Sidebar alertCount={alertStats?.open ?? undefined} />

      <main className="flex-1 overflow-auto flex flex-col">
        {/* Topbar */}
        <div
          className="flex-shrink-0 px-6 py-3 flex items-center justify-between"
          style={{
            borderBottom: "1px solid rgba(184,142,61,0.08)",
            background: "rgba(10,10,18,0.8)",
            backdropFilter: "blur(8px)",
          }}
        >
          {title ? (
            <h1
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: "#D8D8E8", fontFamily: "Georgia, serif" }}
            >
              {title}
            </h1>
          ) : (
            <div />
          )}

          {/* Indicateur de statut système */}
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "#4ADE80", boxShadow: "0 0 6px rgba(74,222,128,0.6)" }}
            />
            <span
              className="text-[10px] tracking-widest uppercase"
              style={{ color: "rgba(184,142,61,0.4)", fontFamily: "monospace" }}
            >
              Système opérationnel
            </span>
          </div>
        </div>

        {/* Contenu */}
        <div className="flex-1 max-w-screen-xl mx-auto w-full px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
