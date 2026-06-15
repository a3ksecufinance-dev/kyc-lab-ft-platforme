import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

let refreshPromise: Promise<void> | null = null;

async function ensureFreshToken(getToken: () => string | null) {
  const token = getToken();
  if (!token) return;

  // Import dynamically to avoid circular deps
  const { getTokenExpiryMs, getRefreshToken, setTokens, getStoredUser, clearTokens } = await import("./auth");

  const expiryMs = getTokenExpiryMs(token);
  const nowMs = Date.now();

  // If token expires in more than 60s, no refresh needed
  if (expiryMs - nowMs > 60_000) return;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return;

  // Deduplicate concurrent refresh attempts
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch("/trpc/auth.refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "0": { json: { refreshToken } } }),
        });
        if (!res.ok) throw new Error("refresh failed");
        const json = await res.json();
        const result = json?.[0]?.result?.data?.json;
        if (result?.accessToken && result?.refreshToken) {
          const user = getStoredUser();
          if (user) {
            setTokens(result.accessToken, result.refreshToken, user);
          }
        }
      } catch {
        // Refresh failed — clear tokens and redirect
        clearTokens();
        window.location.href = "/login";
      } finally {
        refreshPromise = null;
      }
    })();
  }

  await refreshPromise;
}

export function createTrpcClient(getToken: () => string | null) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/trpc",
        transformer: superjson,
        async headers() {
          await ensureFreshToken(getToken);
          const token = getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
