import { StrictMode, useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, createTrpcClient } from "./lib/trpc";
import { getAccessToken, clearTokens, getStoredUser } from "./lib/auth";
import { AuthProvider } from "./hooks/useAuth";
import { I18nProvider, useI18n } from "./hooks/useI18n";
import { ThemeProvider } from "./context/ThemeContext";
import { startSessionTracker } from "./lib/session";
import { App } from "./App";
import "./globals.css";

// ─── Session banners ──────────────────────────────────────────────────────────

function SessionExpiredBanner({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 bg-amber-400/20 border border-amber-400/40 rounded-xl shadow-lg backdrop-blur-sm">
      <span className="text-xs font-mono text-amber-400">{t.session.expired}</span>
      <button onClick={onDismiss} className="text-amber-400/60 hover:text-amber-400 text-xs font-mono">✕</button>
    </div>
  );
}

function SessionWarningBanner({ secondsLeft, onExtend }: { secondsLeft: number; onExtend: () => void }) {
  const { t } = useI18n();
  const min = Math.floor(secondsLeft / 60);
  const msg = t.session.warning.replace("{min}", String(min));
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 bg-[#1f6feb]/20 border border-[#1f6feb]/40 rounded-xl shadow-lg backdrop-blur-sm">
      <span className="text-xs font-mono text-[#58a6ff]">{msg}</span>
      <button onClick={onExtend}
        className="text-xs font-mono bg-[#1f6feb]/30 border border-[#1f6feb]/40 text-[#58a6ff] px-3 py-1 rounded-md hover:bg-[#1f6feb]/50">
        {t.session.extend}
      </button>
    </div>
  );
}

// ─── Root avec session management ─────────────────────────────────────────────

function Root() {
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionWarning, setSessionWarning] = useState<number | null>(null);

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count: number, err: unknown) => {
          if ((err as { data?: { httpStatus?: number } })?.data?.httpStatus === 401) return false;
          return count < 1;
        },
        refetchOnWindowFocus: false,
        staleTime: 10_000,
      },
    },
  }));

  const [trpcClient] = useState(() =>
    createTrpcClient(getAccessToken)
  );

  const handleTimeout = useCallback(() => {
    clearTokens();
    queryClient.clear();
    setSessionExpired(true);
    setSessionWarning(null);
    window.location.href = "/login";
  }, [queryClient]);

  const handleWarn = useCallback((secondsLeft: number) => {
    setSessionWarning(secondsLeft);
  }, []);

  const extendSession = useCallback(() => {
    setSessionWarning(null);
    window.dispatchEvent(new MouseEvent("mousemove"));
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return;
    const cleanup = startSessionTracker(handleTimeout, handleWarn);
    return cleanup;
  }, [handleTimeout, handleWarn]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <>
            {sessionExpired && (
              <SessionExpiredBanner onDismiss={() => setSessionExpired(false)} />
            )}
            {sessionWarning !== null && (
              <SessionWarningBanner
                secondsLeft={sessionWarning}
                onExtend={extendSession}
              />
            )}
            <App />
          </>
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <Root />
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
);
