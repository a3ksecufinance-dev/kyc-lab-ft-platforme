import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { getStoredUser, setTokens, clearTokens, type AuthUser } from "../lib/auth";
import { trpc } from "../lib/trpc";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContext {
  user:              AuthUser | null;
  isAuthenticated:   boolean;
  login:             (email: string, password: string) => Promise<{ mfaRequired: boolean; userId?: number }>;
  completeMfaLogin:  (userId: number, code: string) => Promise<void>;
  logout:            () => void;
}

const AuthCtx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const queryClient     = useQueryClient();

  const loginMutation       = trpc.auth.login.useMutation();
  const mfaCompleteMutation = trpc.auth.mfaLoginComplete.useMutation();

  const login = useCallback(async (email: string, password: string): Promise<{ mfaRequired: boolean; userId?: number }> => {
    const result = await loginMutation.mutateAsync({ email, password });

    if (result.mfaRequired) {
      return { mfaRequired: true, userId: result.userId };
    }

    const authUser: AuthUser = {
      id:    result.user!.id,
      email: result.user!.email,
      name:  result.user!.name,
      role:  result.user!.role as AuthUser["role"],
    };
    setTokens(result.tokens!.accessToken, result.tokens!.refreshToken, authUser);
    setUser(authUser);
    return { mfaRequired: false };
  }, [loginMutation]);

  const completeMfaLogin = useCallback(async (userId: number, code: string): Promise<void> => {
    const result = await mfaCompleteMutation.mutateAsync({ userId, code });
    const authUser: AuthUser = {
      id:    result.user.id,
      email: result.user.email,
      name:  result.user.name,
      role:  result.user.role as AuthUser["role"],
    };
    setTokens(result.tokens.accessToken, result.tokens.refreshToken, authUser);
    setUser(authUser);
  }, [mfaCompleteMutation]);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthCtx.Provider value={{ user, isAuthenticated: !!user, login, completeMfaLogin, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthContext {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
