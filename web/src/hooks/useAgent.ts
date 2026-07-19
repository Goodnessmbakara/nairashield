"use client";

import React from "react";
import {
  failureSimulationTick,
  fetchAgentHistory,
  fetchAgentStatus,
  fetchTick,
  isConfigured,
  normalizeTick,
  type AgentStatusPayload,
  type Tick,
} from "../lib/agent";
import { getToken } from "../lib/auth";
import { dedupeTicksForFeed, isIdleHold } from "../lib/ticks";

/** How often we pull cron ticks while the tab is visible (read-only). 
 * Increased to 60s to prevent exhausting the free tier, since cron only runs every minute. */
const LIVE_POLL_MS = 60_000;
const HIDDEN_POLL_MS = 120_000;

/** Shared live agent poller - real ticks only, never fabricates metrics. */
export function useAgent(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [ticks, setTicks] = React.useState<Tick[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [needsAuth, setNeedsAuth] = React.useState(false);
  const [lastSyncedAt, setLastSyncedAt] = React.useState<number | null>(null);
  const [liveFlashId, setLiveFlashId] = React.useState<string | null>(null);
  const [liveReason, setLiveReason] = React.useState<{ action: string; reason: string; at: string } | null>(null);
  const [agentStatus, setAgentStatus] = React.useState<AgentStatusPayload | null>(null);
  const inFlight = React.useRef(false);
  const historyInFlight = React.useRef(false);
  const statusInFlight = React.useRef(false);
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

  const refreshStatus = React.useCallback(async (signal?: AbortSignal) => {
    if (statusInFlight.current) return;
    if (!isConfigured() || !getToken()) return;
    statusInFlight.current = true;
    try {
      const status = await fetchAgentStatus(signal);
      if (!mounted.current || signal?.aborted) return;
      if (!status) return;
      setAgentStatus(status);
      if (status.currentStatus) setLiveReason(status.currentStatus);
      // Merge lastTick from status so overview has market/odds even before history poll
      if (status.lastTick?.id && status.lastTick.decision) {
        const lt = normalizeTick({
          id: status.lastTick.id,
          at: status.lastTick.at,
          status: status.lastTick.status,
          decision: status.lastTick.decision,
          market: status.lastTick.market,
          yield: status.lastTick.yield,
          execution: status.lastTick.execution,
          movement: status.lastTick.movement,
          verification: status.lastTick.verification,
        });
        setTicks((prev) => {
          if (prev.some((t) => t.id === lt.id)) return prev;
          knownIds.current.add(lt.id);
          return dedupeTicksForFeed([lt, ...prev]).slice(0, 40);
        });
        setLastSyncedAt(Date.now());
      }
    } catch {
      /* quiet */
    } finally {
      statusInFlight.current = false;
    }
  }, []);

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
      } else {
        // Simulate the agent’s failure action in the app: HOLD, no trade, capital stays in yield.
        // Does not invent odds, balances, or fills — only an honest failure narrative.
        setNeedsAuth(false);
        const fail = failureSimulationTick(
          msg.includes("Cannot reach")
            ? "can’t reach the agent right now"
            : msg || "check failed",
        );
        setError(null);
        setLastSyncedAt(Date.now());
        lastReason.current = fail.decision.reason;
        knownIds.current.add(fail.id);
        setLiveFlashId(fail.id);
        window.setTimeout(() => {
          if (mounted.current) setLiveFlashId((id) => (id === fail.id ? null : id));
        }, 2500);
        setTicks((prev) => dedupeTicksForFeed([fail, ...prev]).slice(0, 40));
        setLiveReason({
          action: fail.decision.action,
          reason: fail.decision.reason,
          at: new Date().toISOString(),
        });
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
        void refreshStatus(ctrl.signal);
      }, ms);
    };

    void refreshHistory(ctrl.signal);
    void refreshStatus(ctrl.signal);
    schedule();

    const onVis = () => {
      schedule();
      if (!document.hidden) {
        void refreshHistory(ctrl.signal);
        void refreshStatus(ctrl.signal);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      ctrl.abort();
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, refreshHistory, refreshStatus]);

  return {
    ticks,
    error,
    loading,
    lastSyncedAt,
    liveFlashId,
    liveReason,
    agentStatus,
    poll: () => {
      void poll();
      void refreshStatus();
    },
    configured: isConfigured(),
    needsAuth,
  };
}
