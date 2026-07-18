"use client";

import React from "react";
import { fetchAgentHistory, fetchTick, isConfigured, type Tick } from "../lib/agent";
import { getToken } from "../lib/auth";

const POLL_MS = 60_000;

/** Shared live agent poller - real ticks only, never fabricates metrics. */
export function useAgent(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [ticks, setTicks] = React.useState<Tick[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [needsAuth, setNeedsAuth] = React.useState(false);
  const inFlight = React.useRef(false);
  const mounted = React.useRef(true);
  const lastReason = React.useRef<string | null>(null);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const poll = React.useCallback(async (signal?: AbortSignal) => {
    // Hard lock: stress-clicks / overlapping intervals cannot stack
    if (inFlight.current) return;
    if (!isConfigured()) {
      setError("Agent isn’t connected yet. Live numbers will appear when it is.");
      return;
    }
    if (!getToken()) {
      setNeedsAuth(true);
      setError("Sign in with Google to run live checks.");
      return;
    }

    inFlight.current = true;
    if (mounted.current) setLoading(true);

    try {
      const tick = await fetchTick(signal);
      if (!mounted.current || signal?.aborted) return;

      setError(null);
      setNeedsAuth(false);

      // Avoid recursive list growth when the agent keeps returning the same HOLD,
      // but always add the first tick so stat cards show something immediately.
      const reason = tick.decision?.reason ?? "";
      const sameAsLast =
        lastReason.current === reason &&
        tick.decision?.action === "HOLD" &&
        reason.length > 0;

      lastReason.current = reason;
      setTicks((prev) => {
        if (prev[0]?.id === tick.id) return prev;
        // First tick always shows; subsequent same-HOLD duplicates are dropped
        if (sameAsLast && prev.length > 0) return prev;
        return [tick, ...prev].slice(0, 40);
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (!mounted.current) return;

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
        setError(msg || "Something went wrong loading the latest check.");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!isConfigured()) {
      setError("Agent isn’t connected yet. Live numbers will appear when it is.");
      return;
    }
    if (!getToken()) {
      setNeedsAuth(true);
      setError("Sign in with Google to run live checks.");
      return;
    }

    const ctrl = new AbortController();
    // Background refresh is READ-ONLY: it merges the agent's persisted
    // history (the cron's real ticks). Only the explicit "Run check" button
    // triggers a new tick — an open dashboard tab must not multiply checks.
    const refreshHistory = () =>
      fetchAgentHistory(40, ctrl.signal)
        .then((history) => {
          if (!mounted.current || ctrl.signal.aborted || history.length === 0) return;
          setTicks((prev) => {
            const seen = new Set(prev.map((t) => t.id));
            const merged = [...prev, ...history.filter((t) => !seen.has(t.id))];
            merged.sort((a, b) => (a.id < b.id ? 1 : -1)); // tick ids are time-ordered
            return merged.slice(0, 40);
          });
        })
        .catch(() => {});

    void refreshHistory();
    const id = window.setInterval(() => {
      void refreshHistory();
    }, POLL_MS);

    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [poll, enabled]);

  return {
    ticks,
    error,
    loading,
    poll: () => {
      // Manual run always uses a fresh controller (ignore prior abort)
      void poll();
    },
    configured: isConfigured(),
    needsAuth,
  };
}
