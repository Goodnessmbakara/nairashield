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

/**
 * Agent-first live loop (no human "Run check" required):
 * - Status/history poll: surface cron ticks within seconds
 * - Tick interval: while the dashboard is open, fire the same autonomous
 *   decision cycle the worker cron uses (worker also runs * * * * *)
 */
const LIVE_POLL_MS = 5_000;
const HIDDEN_POLL_MS = 30_000;
/** Align with worker cron — autonomous tick while operator is watching */
const TICK_INTERVAL_MS = 60_000;
const FLASH_MS = 3_500;

/** Shared live agent poller — real ticks only, never fabricates metrics. */
export function useAgent(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [ticks, setTicks] = React.useState<Tick[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [needsAuth, setNeedsAuth] = React.useState(false);
  const [lastSyncedAt, setLastSyncedAt] = React.useState<number | null>(null);
  const [liveFlashId, setLiveFlashId] = React.useState<string | null>(null);
  const [liveReason, setLiveReason] = React.useState<{
    action: string;
    reason: string;
    at: string;
  } | null>(null);
  const [agentStatus, setAgentStatus] = React.useState<AgentStatusPayload | null>(null);
  const [livePulse, setLivePulse] = React.useState(0);
  const inFlight = React.useRef(false);
  const historyInFlight = React.useRef(false);
  const statusInFlight = React.useRef(false);
  const mounted = React.useRef(true);
  const lastReason = React.useRef<string | null>(null);
  const knownIds = React.useRef<Set<string>>(new Set());
  const lastFlashAt = React.useRef(0);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 1s clock for "Xs ago" and bob animation phase
  React.useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setLivePulse((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  const flashTick = React.useCallback((id: string) => {
    if (!mounted.current || !id) return;
    // Avoid thrashing if many updates in the same second
    const now = Date.now();
    if (now - lastFlashAt.current < 400 && liveFlashId === id) return;
    lastFlashAt.current = now;
    setLiveFlashId(id);
    window.setTimeout(() => {
      if (mounted.current) setLiveFlashId((cur) => (cur === id ? null : cur));
    }, FLASH_MS);
  }, [liveFlashId]);

  const upsertTick = React.useCallback(
    (tick: Tick, opts?: { flash?: boolean }) => {
      if (!mounted.current) return;
      const isNew = !knownIds.current.has(tick.id);
      knownIds.current.add(tick.id);
      setTicks((prev) => {
        const without = prev.filter((t) => t.id !== tick.id);
        const next = dedupeTicksForFeed([tick, ...without]).slice(0, 40);
        return next;
      });
      lastReason.current = tick.decision?.reason ?? lastReason.current;
      setLastSyncedAt(Date.now());
      if (opts?.flash !== false && (isNew || !isIdleHold(tick) || tick.execution?.simulated)) {
        flashTick(tick.id);
      }
    },
    [flashTick],
  );

  const mergeHistory = React.useCallback(
    (history: Tick[]) => {
      if (!mounted.current || history.length === 0) return;
      setTicks((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const incoming = history.filter((t) => !seen.has(t.id));
        for (const t of incoming) {
          if (!knownIds.current.has(t.id)) {
            // Flash newest incoming first
            if (t === incoming[0] || !isIdleHold(t) || t.execution?.simulated) {
              flashTick(t.id);
            }
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
    },
    [flashTick],
  );

  const refreshHistory = React.useCallback(
    async (signal?: AbortSignal) => {
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
    },
    [mergeHistory],
  );

  const refreshStatus = React.useCallback(
    async (signal?: AbortSignal) => {
      if (statusInFlight.current) return;
      if (!isConfigured() || !getToken()) return;
      statusInFlight.current = true;
      try {
        const status = await fetchAgentStatus(signal);
        if (!mounted.current || signal?.aborted) return;
        if (!status) return;
        setAgentStatus(status);
        if (status.currentStatus) setLiveReason(status.currentStatus);

        // Merge lastTick so cron actions appear in real time without Run check
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
            projection: status.lastTick.projection,
          });
          upsertTick(lt, { flash: true });
          setLiveReason({
            action: lt.decision.action,
            reason: lt.decision.reason,
            at: status.lastTick.at || new Date().toISOString(),
          });
        }
      } catch {
        /* quiet */
      } finally {
        statusInFlight.current = false;
      }
    },
    [upsertTick],
  );

  const poll = React.useCallback(
    async (signal?: AbortSignal) => {
      if (inFlight.current) return;
      if (!isConfigured()) {
        setError("Agent isn’t connected yet. Live numbers will appear when it is.");
        return;
      }
      if (!getToken()) {
        setNeedsAuth(true);
        setError("Sign in with Google to open the live agent.");
        return;
      }

      inFlight.current = true;
      if (mounted.current) setLoading(true);

      try {
        const tick = await fetchTick(signal);
        if (!mounted.current || signal?.aborted) return;

        setError(null);
        setNeedsAuth(false);
        upsertTick(tick, { flash: true });
        setLiveReason({
          action: tick.decision.action,
          reason: tick.decision.reason,
          at: new Date().toISOString(),
        });
        // Pull status right after a manual tick so capital/sim bankroll stays fresh
        void refreshStatus(signal);
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
          setNeedsAuth(false);
          const fail = failureSimulationTick(
            msg.includes("Cannot reach")
              ? "can’t reach the agent right now"
              : msg || "check failed",
          );
          setError(null);
          upsertTick(fail, { flash: true });
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
    },
    [upsertTick, refreshStatus],
  );

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
      setError("Sign in with Google to open the live agent.");
      return;
    }

    const ctrl = new AbortController();
    let pollTimer: number | undefined;
    let tickTimer: number | undefined;

    const schedulePoll = () => {
      if (pollTimer) window.clearInterval(pollTimer);
      const ms = document.hidden ? HIDDEN_POLL_MS : LIVE_POLL_MS;
      pollTimer = window.setInterval(() => {
        void refreshHistory(ctrl.signal);
        void refreshStatus(ctrl.signal);
      }, ms);
    };

    const scheduleTicks = () => {
      if (tickTimer) window.clearInterval(tickTimer);
      if (document.hidden) return;
      // First autonomous tick shortly after open, then every minute
      window.setTimeout(() => {
        if (!ctrl.signal.aborted && !document.hidden) void poll(ctrl.signal);
      }, 1_500);
      tickTimer = window.setInterval(() => {
        if (!document.hidden) void poll(ctrl.signal);
      }, TICK_INTERVAL_MS);
    };

    void refreshHistory(ctrl.signal);
    void refreshStatus(ctrl.signal);
    schedulePoll();
    scheduleTicks();

    const onVis = () => {
      schedulePoll();
      if (!document.hidden) {
        void refreshHistory(ctrl.signal);
        void refreshStatus(ctrl.signal);
        scheduleTicks();
      } else if (tickTimer) {
        window.clearInterval(tickTimer);
        tickTimer = undefined;
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      ctrl.abort();
      if (pollTimer) window.clearInterval(pollTimer);
      if (tickTimer) window.clearInterval(tickTimer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, refreshHistory, refreshStatus, poll]);

  return {
    ticks,
    error,
    loading,
    lastSyncedAt,
    liveFlashId,
    liveReason,
    agentStatus,
    /** increments every second — use to re-render relative times */
    livePulse,
    /** Optional: only for error recovery — not the primary control surface */
    poll: () => {
      void poll();
    },
    configured: isConfigured(),
    needsAuth,
  };
}
