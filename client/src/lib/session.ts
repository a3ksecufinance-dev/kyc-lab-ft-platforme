/**
 * Gestion de session — timeout inactivité + refresh silencieux
 *
 * Logique :
 *   1. Refresh automatique : si le access token expire dans < 2min, le renouveler
 *      silencieusement via le refresh token (intercepteur tRPC 401)
 *   2. Timeout inactivité : si aucune action pendant INACTIVITY_MS, déconnecter
 *      et afficher un message "Session expirée"
 *   3. L'activité est trackée sur : mousemove, keydown, click, scroll, touchstart
 */


const INACTIVITY_MS = 30 * 60 * 1000;  // 30 minutes
const WARN_BEFORE_MS = 2 * 60 * 1000;  // avertir 2 min avant

let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let warnTimer:       ReturnType<typeof setTimeout> | null = null;
let onTimeoutCb:     (() => void) | null                  = null;
let onWarnCb:        ((secondsLeft: number) => void) | null = null;

// ─── Démarrage du tracker ─────────────────────────────────────────────────────

export function startSessionTracker(
  onTimeout: () => void,
  onWarn?: (secondsLeft: number) => void,
) {
  onTimeoutCb = onTimeout;
  onWarnCb    = onWarn ?? null;

  const EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"];
  const reset  = () => resetInactivityTimer();

  EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));
  resetInactivityTimer();

  return () => {
    EVENTS.forEach(e => window.removeEventListener(e, reset));
    clearTimers();
  };
}

function clearTimers() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (warnTimer)       clearTimeout(warnTimer);
  inactivityTimer = null;
  warnTimer       = null;
}

function resetInactivityTimer() {
  clearTimers();

  // Avertir 2 min avant expiration
  warnTimer = setTimeout(() => {
    onWarnCb?.(Math.round(WARN_BEFORE_MS / 1000));
  }, INACTIVITY_MS - WARN_BEFORE_MS);

  // Déconnecter après inactivité
  inactivityTimer = setTimeout(() => {
    onTimeoutCb?.();
  }, INACTIVITY_MS);
}

export function stopSessionTracker() {
  clearTimers();
  onTimeoutCb = null;
  onWarnCb    = null;
}

// ─── Refresh silencieux du token ──────────────────────────────────────────────

export async function silentRefresh(
  refreshFn: (token: string) => Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>,
  getRefreshToken: () => string | null,
  onSuccess: (tokens: { accessToken: string; refreshToken: string }) => void,
  onFailure: () => void,
): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) { onFailure(); return; }

  try {
    const tokens = await refreshFn(refreshToken);
    onSuccess(tokens);
  } catch {
    onFailure();
  }
}

// ─── Hook utilitaire — vérifier si le token va expirer bientôt ───────────────

export function tokenExpiresInMs(token: string): number {
  try {
    const [, payload] = token.split(".");
    if (!payload) return 0;
    const decoded = JSON.parse(atob(payload)) as { exp?: number };
    if (!decoded.exp) return 0;
    return decoded.exp * 1000 - Date.now();
  } catch {
    return 0;
  }
}

export function shouldRefresh(token: string): boolean {
  const msLeft = tokenExpiresInMs(token);
  return msLeft > 0 && msLeft < 2 * 60 * 1000; // < 2 minutes restantes
}
