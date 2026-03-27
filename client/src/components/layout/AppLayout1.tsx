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
    <div className="flex min-h-screen bg-[#080c10]">
      <Sidebar alertCount={alertStats?.open ?? undefined} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-screen-xl mx-auto px-6 py-6">
          {title && (
            <h1 className="text-lg font-semibold text-[#e6edf3] mb-6 font-mono tracking-tight">
              {title}
            </h1>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
