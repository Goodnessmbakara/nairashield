"use client";

import React from "react";
import {
  type AuthUser,
  clearSession,
  fetchMe,
  getStoredUser,
  getToken,
  isAgentConfigured,
  logout as apiLogout,
} from "../lib/auth";

export function useAuth() {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      // optimistic from storage
      const stored = getStoredUser();
      if (stored && getToken()) setUser(stored);

      if (!isAgentConfigured()) {
        setUser(null);
        setError("Agent isn’t connected yet.");
        return;
      }

      if (!getToken() && !stored) {
        setUser(null);
        return;
      }

      const me = await fetchMe(signal);
      setUser(me);
      if (!me) clearSession();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError("Couldn’t verify your session.");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const ctrl = new AbortController();
    refresh(ctrl.signal);
    return () => ctrl.abort();
  }, [refresh]);

  const logout = React.useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated: Boolean(user),
    configured: isAgentConfigured(),
    refresh,
    logout,
    setUser,
  };
}
