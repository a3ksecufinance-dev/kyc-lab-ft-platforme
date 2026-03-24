const ACCESS_KEY  = "kyc_access_token";
const REFRESH_KEY = "kyc_refresh_token";
const USER_KEY    = "kyc_user";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "analyst" | "supervisor" | "compliance_officer" | "admin";
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function setTokens(access: string, refresh: string, user: AuthUser) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  try {
    const [, payload] = token.split(".");
    if (!payload) return true;
    const decoded = JSON.parse(atob(payload)) as { exp?: number };
    return decoded.exp ? decoded.exp * 1000 < Date.now() : true;
  } catch {
    return true;
  }
}

export const ROLE_LABELS: Record<AuthUser["role"], string> = {
  analyst:            "Analyste",
  supervisor:         "Superviseur",
  compliance_officer: "Compliance Officer",
  admin:              "Administrateur",
};

export const ROLE_ORDER: Record<AuthUser["role"], number> = {
  analyst: 1, supervisor: 2, compliance_officer: 3, admin: 4,
};

export function hasRole(user: AuthUser | null, minRole: AuthUser["role"]): boolean {
  if (!user) return false;
  return ROLE_ORDER[user.role] >= ROLE_ORDER[minRole];
}
