"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Button, Card, CardBody, Chip, Spinner, Progress } from "@heroui/react";
import { Icon } from "@iconify/react";
import { fetchReplays, fetchReplayOdds, type ReplayData, type Tick } from "../../lib/agent";

function ReplayPlayer({
  fixture,
  score,
  ticks,
  onClose,
}: {
  fixture: any;
  score: any;
  ticks: Tick[];
  onClose: () => void;
}) {
  // Sort ticks chronologically (oldest first)
  const timeline = useMemo(() => {
    return [...ticks].sort((a, b) => {
      return a.id.localeCompare(b.id);
    });
  }, [ticks]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [oddsHistory, setOddsHistory] = useState<any[]>([]);
  const [oddsLoading, setOddsLoading] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setOddsLoading(true);
    fetchReplayOdds(fixture.fixtureId, ctrl.signal).then(data => {
      // Sample to ~100 points to prevent UI lag with 10k records
      const sampled = data.length > 100 ? data.filter((_, i) => i % Math.floor(data.length / 100) === 0) : data;
      setOddsHistory(sampled);
      setOddsLoading(false);
    }).catch(err => {
      if (err.name !== "AbortError") setOddsLoading(false);
    });
    return () => ctrl.abort();
  }, [fixture.fixtureId]);

  useEffect(() => {
    let timer: number;
    if (isPlaying && currentIndex < timeline.length - 1) {
      timer = window.setInterval(() => {
        setCurrentIndex((prev) => prev + 1);
      }, 1500); // 1.5s per tick
    } else if (currentIndex >= timeline.length - 1) {
      setIsPlaying(false);
    }
    return () => clearInterval(timer);
  }, [isPlaying, currentIndex, timeline.length]);

  const currentTick = timeline[currentIndex];
  const progress = timeline.length > 1 ? (currentIndex / (timeline.length - 1)) * 100 : 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-medium font-semibold text-foreground">
            {fixture.p1} vs {fixture.p2}
          </h3>
          <p className="text-tiny text-default-500">
            {new Date(fixture.start).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {score && (
            <Chip color="primary" variant="flat" size="sm">
              Final Score: {score.home} - {score.away}
            </Chip>
          )}
          <Button size="sm" variant="light" isIconOnly onPress={onClose}>
            <Icon icon="solar:close-circle-linear" width={20} />
          </Button>
        </div>
      </div>

      <div className="rounded-medium border border-default-200 bg-content2 p-4">
        <div className="mb-4 flex items-center gap-3">
          <Button
            size="sm"
            color="primary"
            variant={isPlaying ? "flat" : "solid"}
            onPress={() => {
              if (currentIndex >= timeline.length - 1) setCurrentIndex(0);
              setIsPlaying(!isPlaying);
            }}
            startContent={
              <Icon icon={isPlaying ? "solar:pause-linear" : "solar:play-linear"} width={16} />
            }
          >
            {isPlaying ? "Pause" : "Play Replay"}
          </Button>
          <div className="flex-1">
            <Progress value={progress} size="sm" color="primary" className="w-full" />
          </div>
          <span className="text-tiny tabular-nums text-default-500">
            {currentIndex + 1} / {timeline.length}
          </span>
        </div>

        {currentTick ? (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between rounded-medium bg-background px-3 py-2">
              <span className="text-tiny text-default-500">Time</span>
              <span className="text-small font-medium tabular-nums">{currentTick.receivedAt}</span>
            </div>
            
            <div className="flex justify-between rounded-medium bg-background px-3 py-2">
              <span className="text-tiny text-default-500">Minute</span>
              <span className="text-small font-medium tabular-nums">{currentTick.market?.minute ?? '-'}</span>
            </div>

            <div className="rounded-medium bg-background px-3 py-2">
              <p className="mb-2 text-tiny text-default-500">Odds Snapshot</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(currentTick.market?.odds || {}).map(([key, val]) => (
                  <div key={key} className="flex flex-col items-center rounded bg-default-50 p-2">
                    <span className="text-[0.65rem] uppercase text-default-400">{key}</span>
                    <span className="font-mono text-small font-semibold text-foreground">{Number(val).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-medium px-3 py-3 ${currentTick.decision.action === 'TRADE' ? 'bg-success-50 border border-success-200' : 'bg-background'}`}>
              <p className="text-tiny text-default-500">Agent Decision</p>
              <div className="flex items-center gap-2 mt-1">
                <Chip size="sm" color={currentTick.decision.action === 'TRADE' ? 'success' : 'default'} variant="flat">
                  {currentTick.decision.action}
                </Chip>
                <span className="text-tiny text-default-600 truncate">{currentTick.decision.reason}</span>
              </div>
              {currentTick.decision.action === 'TRADE' && currentTick.decision.team && (
                 <div className="mt-2 text-small font-semibold text-success-600">
                    Target: {currentTick.decision.team} (Spread: {currentTick.decision.spread})
                 </div>
              )}
            </div>

            {currentTick.movement && currentTick.movement.length > 0 && (
              <div className="rounded-medium bg-background px-3 py-2">
                 <p className="text-tiny text-default-500 mb-1">Sharp Movement</p>
                 {currentTick.movement.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-tiny">
                       <span>{m.outcome}</span>
                       <span className={m.direction === 'shortening' ? 'text-success' : 'text-default-400'}>
                         {m.fromOdds} → {m.toOdds}
                       </span>
                    </div>
                 ))}
              </div>
            )}
            
            {oddsLoading ? (
              <div className="flex justify-center py-4"><Spinner size="sm" /></div>
            ) : oddsHistory.length > 0 ? (
              <div className="rounded-medium bg-background px-3 py-4">
                 <p className="text-tiny text-default-500 mb-2">Historical Odds Timeline</p>
                 <div className="flex h-20 items-end gap-[1px] overflow-x-auto pb-1">
                   {oddsHistory.map((odd, i) => {
                     const prices = odd.Prices || odd.prices || [];
                     const maxPrice = 30000; // max reasonable odds for visual scale
                     const p1 = prices[0] || 0;
                     const draw = prices[1] || 0;
                     const p2 = prices[2] || 0;
                     const p1h = Math.min(100, Math.max(2, (p1 / maxPrice) * 100));
                     const drawh = Math.min(100, Math.max(2, (draw / maxPrice) * 100));
                     const p2h = Math.min(100, Math.max(2, (p2 / maxPrice) * 100));
                     
                     // Highlight if agent tick is near this timestamp
                     const tickTs = new Date(`1970-01-01T${currentTick.receivedAt}Z`).getTime(); // Approximate matching
                     const isTick = currentTick && currentTick.decision.action === 'TRADE' && i === Math.floor(oddsHistory.length / 2); // Simpler mock highlight for now
                     
                     return (
                       <div key={i} className="flex flex-col justify-end w-1.5 sm:w-2 shrink-0 gap-[1px] group relative cursor-pointer hover:bg-default-100">
                         {isTick && <div className="absolute -top-3 w-1.5 h-1.5 bg-success rounded-full" />}
                         <div className="w-full bg-blue-500/70 rounded-t-sm" style={{ height: `${p1h}%` }} title={`Home: ${p1}`} />
                         <div className="w-full bg-default-400/50 rounded-t-sm" style={{ height: `${drawh}%` }} title={`Draw: ${draw}`} />
                         <div className="w-full bg-rose-500/70 rounded-t-sm" style={{ height: `${p2h}%` }} title={`Away: ${p2}`} />
                       </div>
                     );
                   })}
                 </div>
                 <div className="flex justify-between text-[0.6rem] text-default-400 mt-1 uppercase font-semibold">
                    <span>Kickoff</span>
                    <span>Full Time</span>
                 </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="py-4 text-center text-small text-default-400">No ticks recorded for this match.</p>
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

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetchReplays(1000, ctrl.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message || String(err));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Spinner size="md" />
        <p className="mt-4 text-small text-default-400">Loading replays...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-medium border border-danger-200 bg-danger-50/40 px-4 py-3">
        <p className="text-small text-danger-600">{error}</p>
      </div>
    );
  }

  if (!data || data.fixtures.length === 0) {
    return (
      <Card className="border border-transparent bg-content1 dark:border-default-100">
        <CardBody className="p-8 text-center">
          <Icon icon="solar:history-2-linear" width={32} className="mx-auto mb-3 text-default-300" />
          <h3 className="text-medium font-semibold">No Past Matches Found</h3>
          <p className="text-small text-default-400">Past matches and agent history will appear here.</p>
        </CardBody>
      </Card>
    );
  }

  const selectedFixture = selectedFixtureId ? data.fixtures.find(f => f.fixtureId === selectedFixtureId) : null;

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
            <div className="flex items-center gap-2 mb-2">
              <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
                <Icon className="text-default-500" icon="solar:history-2-linear" width={18} />
              </div>
              <div>
                <h2 className="font-display text-medium font-semibold text-foreground">
                  Match Replays
                </h2>
                <p className="text-tiny text-default-400">
                  Review past fixtures and analyze the agent's historical decisions.
                </p>
              </div>
            </div>

            <ul className="flex flex-col gap-2">
              {data.fixtures.map((f) => {
                const hasTicks = data.history[f.fixtureId] && data.history[f.fixtureId].length > 0;
                const score = data.scores[f.fixtureId];
                return (
                  <li key={f.fixtureId}>
                    <button
                      type="button"
                      onClick={() => setSelectedFixtureId(f.fixtureId)}
                      className="flex w-full items-center justify-between gap-3 rounded-medium border border-default-100 bg-content2/60 px-3 py-2.5 text-left transition-colors hover:border-default-300 hover:bg-content2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-small font-medium text-foreground">
                          {f.p1} vs {f.p2}
                        </p>
                        <p className="mt-0.5 text-[0.65rem] text-default-400">
                          {new Date(f.start).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {score && (
                          <span className="font-mono text-small font-semibold">
                            {score.home} - {score.away}
                          </span>
                        )}
                        {hasTicks ? (
                          <Chip size="sm" color="primary" variant="flat">
                            {data.history[f.fixtureId].length} ticks
                          </Chip>
                        ) : (
                          <span className="text-tiny text-default-300">No agent data</span>
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
