"use client";

import React from "react";
import { fetchAgentHistory, fetchTick, isConfigured, type Tick } from "../lib/agent";
import { getToken } from "../lib/auth";
import { dedupeTicksForFeed, isIdleHold } from "../lib/ticks";

/** How often we pull cron ticks while the tab is visible (read-only). */
const LIVE_POLL_MS = 4_000;
const HIDDEN_POLL_MS = 30_000;

/** Shared live agent poller - real ticks only, never fabricates metrics. */
export function useAgent(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [ticks, setTicks] = React.useState<Tick[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [needsAuth, setNeedsAuth] = React.useState(false);
  const [lastSyncedAt, setLastSyncedAt] = React.useState<number | null>(null);
  const [liveFlashId, setLiveFlashId] = React.useState<string | null>(null);
  const inFlight = React.useRef(false);
  const historyInFlight = React.useRef(false);
  const mounted = React.useRef(true);
  const lastReason = React.useRef<string | null>(null);
  const knownIds = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mergeHistory = React.useCallback((history: Tick[]) => {
    if (!mounted.current || history.length === 0) return;
    setTicks((prev) => {
      const seen = new Set(prev.map((t) => t.id));
      const incoming = history.filter((t) => !seen.has(t.id));
      // Flash when a brand-new tick id appears (cron or another client)
      for (const t of incoming) {
        if (!knownIds.current.has(t.id) && !isIdleHold(t)) {
          setLiveFlashId(t.id);
          window.setTimeout(() => {
            if (mounted.current) setLiveFlashId((id) => (id === t.id ? null : id));
          }, 2500);
        }
        knownIds.current.add(t.id);
      }
      for (const t of prev) knownIds.current.add(t.id);

      const merged = [...prev, ...incoming];
      merged.sort((a, b) => (a.id < b.id ? 1 : -1));
      const next = dedupeTicksForFeed(merged).slice(0, 40);
      if (next[0]) lastReason.current = next[0].decision.reason ?? null;
      return next;
    });
    setLastSyncedAt(Date.now());
    setError(null);
    setNeedsAuth(false);
  }, []);

  const refreshHistory = React.useCallback(async (signal?: AbortSignal) => {
    if (historyInFlight.current) return;
    if (!isConfigured() || !getToken()) return;
    historyInFlight.current = true;
    try {
      const history = await fetchAgentHistory(40, signal);
      if (!mounted.current || signal?.aborted) return;
      mergeHistory(history);
    } catch {
      /* quiet — next poll retries */
    } finally {
      historyInFlight.current = false;
    }
  }, [mergeHistory]);

  const poll = React.useCallback(async (signal?: AbortSignal) => {
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
      setLastSyncedAt(Date.now());
      knownIds.current.add(tick.id);

      const reason = tick.decision?.reason ?? "";
      const prevIdle =
        lastReason.current !== null &&
        isIdleHold({
          id: "",
          receivedAt: "",
          status: "Skipped",
          decision: { action: "HOLD", reason: lastReason.current },
        });
      const sameAsLast =
        tick.decision?.action === "HOLD" &&
        reason.length > 0 &&
        (lastReason.current === reason || (isIdleHold(tick) && prevIdle));

      lastReason.current = reason;
      setTicks((prev) => {
        if (prev[0]?.id === tick.id) return prev;
        if (sameAsLast && prev.length > 0) {
          return [tick, ...prev.slice(1)].slice(0, 40);
        }
        if (!isIdleHold(tick)) setLiveFlashId(tick.id);
        return dedupeTicksForFeed([tick, ...prev]).slice(0, 40);
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
    let timer: number | undefined;

    const schedule = () => {
      if (timer) window.clearInterval(timer);
      const ms = document.hidden ? HIDDEN_POLL_MS : LIVE_POLL_MS;
      timer = window.setInterval(() => {
        void refreshHistory(ctrl.signal);
      }, ms);
    };

    void refreshHistory(ctrl.signal);
    schedule();

    const onVis = () => {
      schedule();
      if (!document.hidden) void refreshHistory(ctrl.signal);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      ctrl.abort();
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, refreshHistory]);

  return {
    ticks,
    error,
    loading,
    lastSyncedAt,
    liveFlashId,
    poll: () => {
      void poll();
    },
    configured: isConfigured(),
    needsAuth,
  };
}
