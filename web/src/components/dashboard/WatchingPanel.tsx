"use client";

import React from "react";
import { Card, CardBody, Chip, Tooltip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { fetchFixtures, type WatchedFixture } from "../../lib/agent";

function kickoffLabel(start: number): string {
  const now = Date.now();
  const mins = Math.round((start - now) / 60000);
  if (mins <= 0) return "in play";
  if (mins < 60) return `in ${mins}m`;
  if (mins < 36 * 60) return `in ${Math.round(mins / 60)}h`;
  const d = new Date(start);
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) +
    " UTC"
  );
}

function FixtureRow({ f }: { f: WatchedFixture }) {
  return (
    <div
      className={
        f.live
          ? "flex items-start gap-3 rounded-large border border-success-200 bg-success-50/80 px-3 py-2.5"
          : "flex items-start gap-3 rounded-large border border-primary-100 bg-primary-50/40 px-3 py-2.5"
      }
    >
      <div
        className="mt-0.5 h-8 w-1.5 shrink-0 rounded-full"
        style={{ background: f.live ? "#12A866" : "#50A9FF" }}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {f.flag1 && (
            <img src={f.flag1} alt="" width={18} height={13} className="shrink-0 rounded-[2px]" />
          )}
          <span className="truncate text-small font-medium text-foreground">{f.p1}</span>
          <span className="shrink-0 text-tiny text-primary-400">vs</span>
          {f.flag2 && (
            <img src={f.flag2} alt="" width={18} height={13} className="shrink-0 rounded-[2px]" />
          )}
          <span className="truncate text-small font-medium text-foreground">{f.p2}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {f.live ? (
            <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-success-600">
              ● Live
            </span>
          ) : (
            <span className="text-tiny text-primary-600/80">{kickoffLabel(f.start)}</span>
          )}
          <span className="rounded-full bg-secondary-50 px-1.5 py-0.5 text-[0.6rem] font-medium leading-tight text-secondary-700 ring-1 ring-secondary-100">
            {f.competition || "World Cup"}
          </span>
        </div>
        <Tooltip content="TxLINE fixture ID — same id the agent polls for odds/scores">
          <p className="font-mono text-[0.65rem] leading-4 text-default-400">
            verify · {f.fixtureId}
          </p>
        </Tooltip>
      </div>

      {f.bettable && (
        <Chip
          classNames={{ base: "shrink-0", content: "text-[0.6rem] font-medium px-1" }}
          color="primary"
          radius="sm"
          size="sm"
          variant="flat"
        >
          tradeable
        </Chip>
      )}
    </div>
  );
}

export default function WatchingPanel() {
  const [fixtures, setFixtures] = React.useState<WatchedFixture[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const ctrl = new AbortController();
    let t: number | undefined;

    const load = async () => {
      try {
        const next = await fetchFixtures(ctrl.signal);
        if (ctrl.signal.aborted) return;
        setFixtures(next);
        setLoadError(null);
      } catch {
        if (!ctrl.signal.aborted) {
          setLoadError("Could not refresh fixtures.");
        }
      }
    };

    void load();
    // Live score / kickoff status — poll often enough to feel real-time
    t = window.setInterval(() => void load(), 10_000);

    const onVis = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      ctrl.abort();
      if (t) window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const list = (fixtures ?? [])
    .slice()
    .sort((a, b) => Number(b.live) - Number(a.live) || a.start - b.start)
    .slice(0, 4);

  const liveCount = list.filter((f) => f.live).length;

  return (
    <Card
      id="watching"
      className="scroll-mt-4 border border-primary-100 bg-content1 shadow-sm shadow-primary-100/40 dark:border-default-100"
    >
      <CardBody className="gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex rounded-medium border border-primary-100 bg-primary-50 p-1.5">
              <Icon className="text-primary" icon="solar:eye-bold" width={16} />
            </div>
            <div>
              <h2 className="font-display text-small font-semibold leading-tight text-foreground">
                Watching
              </h2>
              <p className="text-[0.65rem] leading-tight text-primary-600/70">
                Live TxLINE fixtures
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {liveCount > 0 && (
              <Chip color="success" radius="full" size="sm" variant="dot">
                {liveCount} live
              </Chip>
            )}
            <Chip classNames={{ content: "text-[0.6rem] font-medium" }} radius="full" size="sm" variant="flat">
              Verifiable
            </Chip>
          </div>
        </div>

        {fixtures === null ? (
          <div className="flex items-center justify-center gap-2 py-6 text-default-400">
            <Icon className="animate-spin" icon="solar:refresh-linear" width={16} />
            <span className="text-small">Loading fixtures…</span>
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-small text-default-400">
            {loadError ?? "No fixtures in the feed right now. Sign in if you haven’t."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((f) => (
              <FixtureRow key={f.fixtureId} f={f} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
