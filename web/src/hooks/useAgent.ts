"use client";

import React from "react";
import { fetchTick, isConfigured, type Tick } from "../lib/agent";
import { getToken } from "../lib/auth";

const POLL_MS = 60_000;

/** Shared live agent poller - real ticks only, never fabricates metrics. */
export function useAgent(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [ticks, setTicks] = React.useState<Tick[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [needsAuth, setNeedsAuth] = React.useState(false);

  const poll = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const tick = await fetchTick(signal);
      setError(null);
      setNeedsAuth(false);
      setTicks((prev) => [tick, ...prev].slice(0, 40));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const msg = (e as Error).message;
      const code = (e as { code?: string }).code;
      if (code === "unauthorized" || msg.toLowerCase().includes("sign in")) {
        setNeedsAuth(true);
        setError("Sign in with Google to run live checks.");
      } else if (msg.includes("PUBLIC_AGENT_URL") || msg.includes("not set")) {
        setNeedsAuth(false);
        setError("Agent isn’t connected yet. Live numbers will appear when it is.");
      } else if (msg.includes("Cannot reach")) {
        setNeedsAuth(false);
        setError("Can’t reach the agent right now. Try again in a moment.");
      } else {
        setNeedsAuth(false);
        setError("Something went wrong loading the latest check.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    if (!isConfigured()) {
      setError("Agent isn’t connected yet. Live numbers will appear when it is.");
      return;
    }
    if (!getToken()) {
      setNeedsAuth(true);
      setError("Sign in with Google to run live checks.");
      return;
    }
    poll(ctrl.signal);
    const id = setInterval(() => poll(ctrl.signal), POLL_MS);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, [poll, enabled]);

  return {
    ticks,
    error,
    loading,
    poll,
    configured: isConfigured(),
    needsAuth,
  };
}
