"use client";

import React from "react";
import {
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
 * Agent-first live loop — no human Run check.
 * - Status/history: every few seconds (read worker cron + last tick)
 * - Tick: every 60s while tab is visible (same path as worker cron)
 * Transient network blips do NOT invent "Feed issue" rows — silent retry.
 */
const LIVE_POLL_MS = 5_000;
const HIDDEN_POLL_MS = 30_000;
const TICK_INTERVAL_MS = 60_000;
const FLASH_MS = 3_500;
const TICK_TIMEOUT_MS = 55_000;

function isClientNoiseTick(t: Tick): boolean {
  return t.id.startsWith("fail_") || t.agentStatus === "Error";
}

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
  const knownIds = React.useRef<Set<string>>(new Set());
  const lastFlashAt = React.useRef(0);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setLivePulse((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  const flashTick = React.useCallback((id: string) => {
    if (!mounted.current || !id || isClientNoiseTick({ id } as Tick)) return;
    const now = Date.now();
    if (now - lastFlashAt.current < 400) return;
    lastFlashAt.current = now;
    setLiveFlashId(id);
    window.setTimeout(() => {
      if (mounted.current) setLiveFlashId((cur) => (cur === id ? null : cur));
    }, FLASH_MS);
  }, []);

  const upsertTick = React.useCallback(
    (tick: Tick, opts?: { flash?: boolean }) => {
      if (!mounted.current || isClientNoiseTick(tick)) return;
      const isNew = !knownIds.current.has(tick.id);
      knownIds.current.add(tick.id);
      setTicks((prev) => {
        const cleaned = prev.filter((t) => !isClientNoiseTick(t) && t.id !== tick.id);
        return dedupeTicksForFeed([tick, ...cleaned]).slice(0, 40);
      });
      setLastSyncedAt(Date.now());
      setError(null);
      if (opts?.flash !== false && (isNew || !isIdleHold(tick) || tick.execution?.simulated)) {
        flashTick(tick.id);
      }
    },
    [flashTick],
  );

  const mergeHistory = React.useCallback(
    (history: Tick[]) => {
      if (!mounted.current || history.length === 0) return;
      const real = history.filter((t) => !isClientNoiseTick(t));
      setTicks((prev) => {
        const seen = new Set(prev.filter((t) => !isClientNoiseTick(t)).map((t) => t.id));
        const incoming = real.filter((t) => !seen.has(t.id));
        for (const t of incoming) {
          if (!knownIds.current.has(t.id) && (t === incoming[0] || !isIdleHold(t))) {
            flashTick(t.id);
          }
          knownIds.current.add(t.id);
        }
        const merged = [...prev.filter((t) => !isClientNoiseTick(t)), ...incoming];
        merged.sort((a, b) => (a.id < b.id ? 1 : -1));
        return dedupeTicksForFeed(merged).slice(0, 40);
      });
      setLastSyncedAt(Date.now());
      setError(null);
      setNeedsAuth(false);
    },
    [flashTick],
  );

  // Stable refs so the interval effect does not re-bind and abort in-flight work
  const refreshHistoryRef = React.useRef(async (_signal?: AbortSignal) => {});
  const refreshStatusRef = React.useRef(async (_signal?: AbortSignal) => {});
  const runTickRef = React.useRef(async () => {});

  refreshHistoryRef.current = async (signal?: AbortSignal) => {
    if (historyInFlight.current) return;
    if (!isConfigured() || !getToken()) return;
    historyInFlight.current = true;
    try {
      const history = await fetchAgentHistory(40, signal);
      if (!mounted.current || signal?.aborted) return;
      mergeHistory(history);
    } catch {
      /* quiet retry */
    } finally {
      historyInFlight.current = false;
    }
  };

  refreshStatusRef.current = async (signal?: AbortSignal) => {
    if (statusInFlight.current) return;
    if (!isConfigured() || !getToken()) return;
    statusInFlight.current = true;
    try {
      const status = await fetchAgentStatus(signal);
      if (!mounted.current || signal?.aborted) return;
      if (!status) return;
      setAgentStatus(status);
      if (status.currentStatus) setLiveReason(status.currentStatus);
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
      /* quiet retry */
    } finally {
      statusInFlight.current = false;
    }
  };

  runTickRef.current = async () => {
    if (inFlight.current) return;
    if (!isConfigured() || !getToken() || document.hidden) return;

    inFlight.current = true;
    if (mounted.current) setLoading(true);

    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), TICK_TIMEOUT_MS);

    try {
      const tick = await fetchTick(ctrl.signal);
      if (!mounted.current) return;
      setError(null);
      setNeedsAuth(false);
      upsertTick(tick, { flash: true });
      setLiveReason({
        action: tick.decision.action,
        reason: tick.decision.reason,
        at: new Date().toISOString(),
      });
      void refreshStatusRef.current();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (!mounted.current) return;
      const msg = (e as Error).message || "";
      const code = (e as { code?: string }).code;
      if (code === "unauthorized" || msg.toLowerCase().includes("sign in")) {
        setNeedsAuth(true);
        setError("Sign in to open the live agent.");
      } else if (msg.includes("PUBLIC_AGENT_URL") || msg.includes("not set")) {
        setError("Agent isn’t connected yet.");
      }
      // Network / transient errors: silent — status poll still shows last real tick.
      // Do NOT inject fake "Feed issue" rows into the agent feed.
    } finally {
      window.clearTimeout(timer);
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  React.useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!isConfigured()) {
      setError("Agent isn’t connected yet.");
      return;
    }
    if (!getToken()) {
      setNeedsAuth(true);
      setError("Sign in to open the live agent.");
      return;
    }

    setNeedsAuth(false);
    setError(null);

    let pollTimer: number | undefined;
    let tickTimer: number | undefined;
    let firstTickTimer: number | undefined;
    let cancelled = false;

    const schedulePoll = () => {
      if (pollTimer) window.clearInterval(pollTimer);
      const ms = document.hidden ? HIDDEN_POLL_MS : LIVE_POLL_MS;
      pollTimer = window.setInterval(() => {
        if (cancelled) return;
        void refreshHistoryRef.current();
        void refreshStatusRef.current();
      }, ms);
    };

    const scheduleTicks = () => {
      if (tickTimer) window.clearInterval(tickTimer);
      if (firstTickTimer) window.clearTimeout(firstTickTimer);
      if (document.hidden) return;
      firstTickTimer = window.setTimeout(() => {
        if (!cancelled && !document.hidden) void runTickRef.current();
      }, 800);
      tickTimer = window.setInterval(() => {
        if (!cancelled && !document.hidden) void runTickRef.current();
      }, TICK_INTERVAL_MS);
    };

    void refreshHistoryRef.current();
    void refreshStatusRef.current();
    schedulePoll();
    scheduleTicks();

    const onVis = () => {
      schedulePoll();
      if (!document.hidden) {
        void refreshHistoryRef.current();
        void refreshStatusRef.current();
        scheduleTicks();
      } else {
        if (tickTimer) window.clearInterval(tickTimer);
        if (firstTickTimer) window.clearTimeout(firstTickTimer);
        tickTimer = undefined;
        firstTickTimer = undefined;
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (pollTimer) window.clearInterval(pollTimer);
      if (tickTimer) window.clearInterval(tickTimer);
      if (firstTickTimer) window.clearTimeout(firstTickTimer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled]);

  return {
    ticks,
    error,
    loading,
    lastSyncedAt,
    liveFlashId,
    liveReason,
    agentStatus,
    livePulse,
    poll: () => {
      void runTickRef.current();
    },
    configured: isConfigured(),
    needsAuth,
  };
}
