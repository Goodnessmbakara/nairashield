"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Button, Card, CardBody, Chip, Spinner, Progress } from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  fetchReplays,
  fetchReplayOdds,
  type ReplayData,
  type ReplayFixture,
  type Tick,
} from "../../lib/agent";
import { displayAgentReason } from "../../lib/ticks";
import { DEMO_CAPITAL_USDC } from "../../lib/chart-from-ticks";

function formatStart(start: number | string): string {
  const n = typeof start === "number" ? start : Date.parse(String(start));
  if (!Number.isFinite(n)) return String(start);
  return new Date(n).toLocaleString();
}

function money(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function decisionChip(tick: Tick): { label: string; color: "success" | "warning" | "default" } {
  const r = tick.decision.reason.toLowerCase();
  if (tick.execution?.aborted || tick.agentStatus === "Aborted" || r.includes("trade aborted")) {
    return { label: "Abort", color: "warning" };
  }
  if (
    tick.agentStatus === "Error" ||
    r.includes("usable odds") ||
    r.includes("txline snapshot") ||
    r.includes("check failed")
  ) {
    return { label: "Feed issue", color: "warning" };
  }
  if (tick.decision.action === "TRADE" && tick.status === "Executed") {
    return { label: "TRADE", color: "success" };
  }
  if (tick.decision.action === "TRADE") return { label: "TRADE", color: "success" };
  return { label: "HOLD", color: "default" };
}

/**
 * Walk agent ticks and derive capital at each step.
 * Uses real yield on ticks when present; otherwise starts from policy capital
 * and applies yield accrual + trade deploy / redeposit from execution.
 */
function capitalPath(ticks: Tick[], startCapital: number, apy: number): number[] {
  let bal = startCapital;
  const tradeSize = 10;
  const out: number[] = [];
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i]!;
    if (typeof t.yield?.balanceUsdc === "number") {
      bal = t.yield.balanceUsdc;
    } else {
      // Idle yield between checks (~1 min)
      bal += (bal * apy) / (365 * 24 * 60);
      if (t.decision.action === "TRADE" && t.status === "Executed") {
        bal = Math.max(0, bal - (typeof t.execution?.withdrewUsdc === "number" ? t.execution.withdrewUsdc : tradeSize));
      }
      if (t.execution?.redeposited && typeof t.execution.withdrewUsdc === "number") {
        bal += t.execution.withdrewUsdc;
      } else if (t.execution?.aborted && t.execution.redeposited) {
        // already in redeposit above
      }
    }
    out.push(Number(bal.toFixed(6)));
  }
  return out;
}

function ReplayPlayer({
  fixture,
  score,
  ticks,
  onClose,
}: {
  fixture: ReplayFixture;
  score?: { home: number; away: number; minute?: number };
  ticks: Tick[];
  onClose: () => void;
}) {
  const timeline = useMemo(() => {
    return [...ticks].sort((a, b) => a.id.localeCompare(b.id));
  }, [ticks]);

  const startCap = useMemo(() => {
    const firstYield = timeline.find((t) => typeof t.yield?.balanceUsdc === "number")?.yield
      ?.balanceUsdc;
    if (typeof firstYield === "number") return firstYield;
    return DEMO_CAPITAL_USDC;
  }, [timeline]);

  const apy = useMemo(() => {
    const y = timeline.find((t) => typeof t.yield?.apy === "number")?.yield?.apy;
    return typeof y === "number" ? y : 0.08;
  }, [timeline]);

  const capitalAt = useMemo(
    () => capitalPath(timeline, startCap, apy),
    [timeline, startCap, apy],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [oddsHistory, setOddsHistory] = useState<
    Array<{ home: number; draw: number; away: number; ts?: number; inRunning?: boolean }>
  >([]);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [oddsError, setOddsError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
  }, [fixture.fixtureId]);

  useEffect(() => {
    const ctrl = new AbortController();
    setOddsLoading(true);
    setOddsError(null);
    setOddsHistory([]);
    // Always pull TxLINE /api/odds/updates via worker
    fetchReplayOdds(fixture.fixtureId, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        const points = data
          .map((d) => {
            const home = Number(d.home ?? d.prices?.[0] ?? NaN);
            const draw = Number(d.draw ?? d.prices?.[1] ?? NaN);
            const away = Number(d.away ?? d.prices?.[2] ?? NaN);
            // Legacy milliodds if someone still sends raw Prices
            const raw = d.Prices ?? d.pricesRaw;
            if ((!Number.isFinite(home) || home <= 1) && Array.isArray(raw) && raw.length >= 3) {
              const h = Number(raw[0]) > 50 ? Number(raw[0]) / 1000 : Number(raw[0]);
              const dr = Number(raw[1]) > 50 ? Number(raw[1]) / 1000 : Number(raw[1]);
              const a = Number(raw[2]) > 50 ? Number(raw[2]) / 1000 : Number(raw[2]);
              if (h > 1 && dr > 1 && a > 1) {
                return { home: h, draw: dr, away: a, ts: d.ts, inRunning: d.inRunning };
              }
            }
            if (home > 1 && draw > 1 && away > 1) {
              return { home, draw, away, ts: d.ts, inRunning: d.inRunning };
            }
            return null;
          })
          .filter((p): p is NonNullable<typeof p> => p != null);

        setOddsHistory(points);
        setOddsLoading(false);
        if (points.length === 0) {
          setOddsError("TxLINE returned no 1X2 odds for this fixture yet.");
        }
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setOddsLoading(false);
        setOddsError("Could not fetch TxLINE odds.");
      });
    return () => ctrl.abort();
  }, [fixture.fixtureId]);

  useEffect(() => {
    let timer: number | undefined;
    if (isPlaying && currentIndex < timeline.length - 1) {
      timer = window.setInterval(() => {
        setCurrentIndex((prev) => prev + 1);
      }, 1200);
    } else if (currentIndex >= timeline.length - 1 && isPlaying) {
      setIsPlaying(false);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [isPlaying, currentIndex, timeline.length]);

  const currentTick = timeline[currentIndex];
  const progress = timeline.length > 1 ? (currentIndex / (timeline.length - 1)) * 100 : 100;
  const chip = currentTick ? decisionChip(currentTick) : null;
  const capitalNow = capitalAt[currentIndex] ?? startCap;
  const capitalStart = capitalAt[0] ?? startCap;
  const capitalDelta = capitalNow - capitalStart;
  const reason = currentTick ? displayAgentReason(currentTick.decision.reason) : "";

  const trades = timeline.filter(
    (t) => t.decision.action === "TRADE" && t.status === "Executed",
  ).length;
  const holds = timeline.filter((t) => t.decision.action === "HOLD").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {fixture.flag1 && (
              <img src={fixture.flag1} alt="" width={20} height={14} className="rounded-[2px]" />
            )}
            <h3 className="truncate text-medium font-semibold text-foreground">
              {fixture.p1} vs {fixture.p2}
            </h3>
            {fixture.flag2 && (
              <img src={fixture.flag2} alt="" width={20} height={14} className="rounded-[2px]" />
            )}
          </div>
          <p className="text-tiny text-default-500">
            {formatStart(fixture.start)}
            {fixture.competition ? ` · ${fixture.competition}` : ""}
          </p>
          <p className="font-mono text-[0.65rem] text-default-400">
            fixture · {fixture.fixtureId}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {score && (
            <Chip color="primary" size="sm" variant="flat">
              Score {score.home}–{score.away}
              {typeof score.minute === "number" ? ` · ${score.minute}'` : ""}
            </Chip>
          )}
          <Button isIconOnly size="sm" variant="light" onPress={onClose}>
            <Icon icon="solar:close-circle-linear" width={20} />
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Agent steps", value: String(timeline.length) },
          { label: "HOLD", value: String(holds) },
          { label: "TRADE", value: String(trades) },
          {
            label: "Capital Δ",
            value: `${capitalDelta >= 0 ? "+" : ""}${money(capitalDelta)}`,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-medium border border-default-100 bg-content2 px-3 py-2"
          >
            <p className="text-[0.65rem] text-default-400">{s.label}</p>
            <p className="font-display text-small font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-medium border border-default-200 bg-content2 p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            color="primary"
            isDisabled={timeline.length === 0}
            size="sm"
            startContent={
              <Icon icon={isPlaying ? "solar:pause-linear" : "solar:play-linear"} width={16} />
            }
            variant={isPlaying ? "flat" : "solid"}
            onPress={() => {
              if (currentIndex >= timeline.length - 1) setCurrentIndex(0);
              setIsPlaying(!isPlaying);
            }}
          >
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <Button
            isDisabled={timeline.length === 0 || currentIndex <= 0}
            isIconOnly
            size="sm"
            variant="flat"
            onPress={() => {
              setIsPlaying(false);
              setCurrentIndex((i) => Math.max(0, i - 1));
            }}
          >
            <Icon icon="solar:skip-previous-linear" width={16} />
          </Button>
          <Button
            isDisabled={timeline.length === 0 || currentIndex >= timeline.length - 1}
            isIconOnly
            size="sm"
            variant="flat"
            onPress={() => {
              setIsPlaying(false);
              setCurrentIndex((i) => Math.min(timeline.length - 1, i + 1));
            }}
          >
            <Icon icon="solar:skip-next-linear" width={16} />
          </Button>
          <div className="min-w-[8rem] flex-1">
            <Progress className="w-full" color="primary" size="sm" value={progress} />
          </div>
          <span className="text-tiny tabular-nums text-default-500">
            {timeline.length === 0 ? "0 / 0" : `${currentIndex + 1} / ${timeline.length}`}
          </span>
        </div>

        {currentTick ? (
          <div className="flex flex-col gap-3">
            {/* Capital at this moment */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-medium bg-background px-3 py-2">
                <p className="text-tiny text-default-500">Capital now</p>
                <p className="font-display text-xl font-semibold tabular-nums">
                  {money(capitalNow)}
                </p>
              </div>
              <div className="rounded-medium bg-background px-3 py-2">
                <p className="text-tiny text-default-500">Since start</p>
                <p
                  className={`font-display text-xl font-semibold tabular-nums ${
                    capitalDelta >= 0 ? "text-success-600" : "text-danger-600"
                  }`}
                >
                  {capitalDelta >= 0 ? "+" : ""}
                  {money(capitalDelta)}
                </p>
              </div>
              <div className="rounded-medium bg-background px-3 py-2 sm:col-span-1 col-span-2">
                <p className="text-tiny text-default-500">Time</p>
                <p className="text-small font-medium tabular-nums">
                  {currentTick.receivedAt}
                  {typeof currentTick.market?.minute === "number"
                    ? ` · ${currentTick.market.minute}'`
                    : ""}
                </p>
              </div>
            </div>

            {/* Mini capital bars */}
            {capitalAt.length > 1 && (
              <div className="rounded-medium bg-background px-3 py-3">
                <p className="mb-2 text-tiny text-default-500">Capital over agent steps</p>
                <div className="flex h-14 items-end gap-0.5">
                  {capitalAt.map((v, i) => {
                    const min = Math.min(...capitalAt);
                    const max = Math.max(...capitalAt);
                    const span = Math.max(0.01, max - min);
                    const h = 12 + ((v - min) / span) * 88;
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-t-sm ${
                          i === currentIndex ? "bg-primary" : "bg-primary/30"
                        }`}
                        style={{ height: `${h}%` }}
                        title={`${money(v)}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-medium bg-background px-3 py-2">
              <p className="mb-2 text-tiny text-default-500">Odds at this step</p>
              {currentTick.market?.odds && Object.keys(currentTick.market.odds).length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(currentTick.market.odds).map(([key, val]) => (
                    <div
                      key={key}
                      className="flex flex-col items-center rounded bg-default-50 p-2"
                    >
                      <span className="text-[0.65rem] uppercase text-default-400">{key}</span>
                      <span className="font-mono text-small font-semibold text-foreground">
                        {Number(val).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-tiny text-default-400">No odds on this step.</p>
              )}
            </div>

            <div
              className={`rounded-medium px-3 py-3 ${
                chip?.color === "success"
                  ? "border border-success-200 bg-success-50"
                  : chip?.color === "warning"
                    ? "border border-warning-200 bg-warning-50/60"
                    : "bg-background"
              }`}
            >
              <p className="text-tiny text-default-500">Agent action</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Chip color={chip?.color ?? "default"} size="sm" variant="flat">
                  {chip?.label ?? currentTick.decision.action}
                </Chip>
                <span className="text-small text-default-700">{reason}</span>
              </div>
              {currentTick.decision.team && (
                <div className="mt-2 text-small font-semibold text-default-700">
                  {currentTick.decision.team}
                  {currentTick.decision.side ? ` · ${currentTick.decision.side}` : ""}
                  {typeof currentTick.decision.spread === "number"
                    ? ` · ${currentTick.decision.spread}`
                    : ""}
                </div>
              )}
              {currentTick.execution?.aborted && (
                <p className="mt-2 text-tiny text-warning-700">
                  {currentTick.execution.abortReason || "Trade path stopped"}
                  {currentTick.execution.redeposited ? " · capital returned to yield" : ""}
                </p>
              )}
              {currentTick.execution?.withdrewUsdc != null && !currentTick.execution.aborted && (
                <p className="mt-2 text-tiny text-default-600">
                  Deployed {money(currentTick.execution.withdrewUsdc)} from yield
                </p>
              )}
            </div>

            {currentTick.movement && currentTick.movement.length > 0 && (
              <div className="rounded-medium bg-background px-3 py-2">
                <p className="mb-1 text-tiny text-default-500">Sharp movement</p>
                {currentTick.movement.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-tiny">
                    <span>{m.outcome}</span>
                    <span
                      className={
                        m.direction === "shortening" ? "text-success" : "text-default-400"
                      }
                    >
                      {m.fromOdds} → {m.toOdds}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {oddsLoading ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <Spinner size="sm" />
                <p className="text-tiny text-default-400">Fetching TxLINE odds…</p>
              </div>
            ) : oddsHistory.length > 0 ? (
              <div className="rounded-medium bg-background px-3 py-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-tiny text-default-500">
                    TxLINE odds timeline · {oddsHistory.length} points
                  </p>
                  <div className="flex gap-2 text-[0.6rem] font-medium">
                    <span className="text-blue-600">● Home</span>
                    <span className="text-default-500">● Draw</span>
                    <span className="text-rose-600">● Away</span>
                  </div>
                </div>
                <div className="flex h-24 items-end gap-[1px] overflow-x-auto pb-1">
                  {oddsHistory.map((odd, i) => {
                    // Decimal odds ~1.2–15 → invert so shorter odds = taller bar
                    const inv = (o: number) => Math.min(100, Math.max(8, (1 / o) * 120));
                    const p1h = inv(odd.home);
                    const drawh = inv(odd.draw);
                    const p2h = inv(odd.away);
                    return (
                      <div
                        key={i}
                        className="flex w-1.5 shrink-0 flex-col justify-end gap-[1px] sm:w-2"
                        title={`${odd.home.toFixed(2)} / ${odd.draw.toFixed(2)} / ${odd.away.toFixed(2)}`}
                      >
                        <div
                          className="w-full rounded-t-sm bg-blue-500/80"
                          style={{ height: `${p1h}%` }}
                        />
                        <div
                          className="w-full rounded-t-sm bg-default-400/60"
                          style={{ height: `${drawh}%` }}
                        />
                        <div
                          className="w-full rounded-t-sm bg-rose-500/80"
                          style={{ height: `${p2h}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[0.6rem] font-semibold uppercase text-default-400">
                  <span>
                    {typeof oddsHistory[0]?.ts === "number"
                      ? new Date(oddsHistory[0].ts).toLocaleString()
                      : "Start"}
                  </span>
                  <span>
                    {typeof oddsHistory[oddsHistory.length - 1]?.ts === "number"
                      ? new Date(oddsHistory[oddsHistory.length - 1]!.ts as number).toLocaleString()
                      : "Latest"}
                  </span>
                </div>
                {/* Latest 1X2 from TxLINE */}
                {(() => {
                  const last = oddsHistory[oddsHistory.length - 1]!;
                  return (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[
                        { k: fixture.p1 || "Home", v: last.home },
                        { k: "Draw", v: last.draw },
                        { k: fixture.p2 || "Away", v: last.away },
                      ].map((x) => (
                        <div
                          key={x.k}
                          className="flex flex-col items-center rounded-medium border border-default-100 bg-content2 px-2 py-1.5"
                        >
                          <span className="truncate text-[0.6rem] uppercase text-default-400">
                            {x.k}
                          </span>
                          <span className="font-mono text-small font-semibold tabular-nums">
                            {x.v.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : oddsError ? (
              <p className="text-center text-tiny text-default-400">{oddsError}</p>
            ) : null}
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-small text-default-400">No agent steps for this match yet.</p>
            <p className="mt-1 text-tiny text-default-400">
              While a match is live, leave the agent running (or hit Run check). Each tick is
              saved and can be replayed here with capital + decisions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReplaysView() {
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await fetchReplays(1000);
      if (!res) {
        setData(null);
        setError("Could not load replays. Sign in and try again.");
      } else {
        setData(res);
        setLastSyncedAt(Date.now());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replays failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Spinner size="md" />
        <p className="mt-4 text-small text-default-400">Loading match replays…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col gap-3 rounded-medium border border-warning-200 bg-warning-50/40 px-4 py-4">
        <p className="text-small text-default-700">{error}</p>
        <Button className="self-start" radius="full" size="sm" variant="flat" onPress={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.fixtures.length === 0) {
    return (
      <Card className="border border-transparent bg-content1 dark:border-default-100">
        <CardBody className="p-8 text-center">
          <Icon
            className="mx-auto mb-3 text-default-300"
            icon="solar:history-2-linear"
            width={32}
          />
          <h3 className="text-medium font-semibold">No matches to replay yet</h3>
          <p className="mx-auto mt-2 max-w-md text-small text-default-400">
            When the agent runs during a fixture, every HOLD / TRADE is stored. Open this tab
            after the match to play it back with odds and capital over time.
          </p>
          <Button className="mt-4" radius="full" size="sm" variant="flat" onPress={() => void load()}>
            Refresh
          </Button>
        </CardBody>
      </Card>
    );
  }

  const selectedFixture = selectedFixtureId
    ? data.fixtures.find((f) => f.fixtureId === selectedFixtureId)
    : null;

  // Prefer fixtures that have agent ticks first
  const sorted = [...data.fixtures].sort((a, b) => {
    const ta = (data.history[a.fixtureId] || []).length;
    const tb = (data.history[b.fixtureId] || []).length;
    if (tb !== ta) return tb - ta;
    const sa = typeof a.start === "number" ? a.start : Date.parse(String(a.start)) || 0;
    const sb = typeof b.start === "number" ? b.start : Date.parse(String(b.start)) || 0;
    return sb - sa;
  });

  return (
    <div className="flex flex-col gap-4">
      {selectedFixture ? (
        <Card className="border border-transparent bg-content1 dark:border-default-100">
          <CardBody className="p-4 sm:p-5">
            <ReplayPlayer
              fixture={selectedFixture}
              score={data.scores[selectedFixture.fixtureId]}
              ticks={data.history[selectedFixture.fixtureId] || []}
              onClose={() => setSelectedFixtureId(null)}
            />
          </CardBody>
        </Card>
      ) : (
        <Card className="border border-transparent bg-content1 dark:border-default-100">
          <CardBody className="gap-3 p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
                  <Icon className="text-default-500" icon="solar:history-2-linear" width={18} />
                </div>
                <div>
                  <h2 className="font-display text-medium font-semibold text-foreground">
                    Match replays
                  </h2>
                  <p className="text-tiny text-default-400">
                    Play back agent steps, odds, and capital for past fixtures
                    {lastSyncedAt
                      ? ` · synced ${Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))}s ago`
                      : ""}
                  </p>
                </div>
              </div>
              <Button
                isIconOnly
                isLoading={loading}
                radius="full"
                size="sm"
                variant="flat"
                onPress={() => void load()}
              >
                <Icon icon="solar:refresh-linear" width={16} />
              </Button>
            </div>

            <ul className="flex flex-col gap-2">
              {sorted.map((f) => {
                const ticks = data.history[f.fixtureId] || [];
                const hasTicks = ticks.length > 0;
                const score = data.scores[f.fixtureId];
                return (
                  <li key={f.fixtureId}>
                    <button
                      className="flex w-full items-center justify-between gap-3 rounded-medium border border-default-100 bg-content2/60 px-3 py-2.5 text-left transition-colors hover:border-default-300 hover:bg-content2"
                      type="button"
                      onClick={() => setSelectedFixtureId(f.fixtureId)}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {f.flag1 && (
                          <img
                            alt=""
                            className="shrink-0 rounded-[2px]"
                            height={13}
                            src={f.flag1}
                            width={18}
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-small font-medium text-foreground">
                            {f.p1} vs {f.p2}
                          </p>
                          <p className="mt-0.5 text-[0.65rem] text-default-400">
                            {formatStart(f.start)}
                            {f.competition ? ` · ${f.competition}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {score && (
                          <span className="font-mono text-small font-semibold">
                            {score.home}–{score.away}
                          </span>
                        )}
                        {hasTicks ? (
                          <Chip color="primary" size="sm" variant="flat">
                            {ticks.length} steps · Play
                          </Chip>
                        ) : (
                          <span className="text-tiny text-default-300">no agent data</span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
