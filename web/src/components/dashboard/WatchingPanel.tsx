"use client";

import React from "react";
import { Card, CardBody, Chip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { fetchFixtures, type WatchedFixture } from "../../lib/agent";

function kickoffLabel(start: number): string {
  const now = Date.now();
  const mins = Math.round((start - now) / 60000);
  if (mins <= 0) return "in play";
  if (mins < 60) return `in ${mins}m`;
  if (mins < 36 * 60) return `in ${Math.round(mins / 60)}h`;
  const d = new Date(start);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " UTC";
}

function FixtureRow({ f }: { f: WatchedFixture }) {
  return (
    <div className="flex items-center gap-3 rounded-large border border-default-100 bg-content2/60 px-3 py-2.5">
      {/* Status indicator */}
      <div className="shrink-0 w-1.5 h-8 rounded-full" style={{ background: f.live ? "#17c964" : "#d4d4d8" }} />

      {/* Matchup */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {f.flag1 && <img src={f.flag1} alt="" width={18} height={13} className="shrink-0 rounded-[2px]" />}
          <span className="text-small font-medium text-foreground truncate">{f.p1}</span>
          <span className="text-tiny text-default-400 shrink-0">vs</span>
          {f.flag2 && <img src={f.flag2} alt="" width={18} height={13} className="shrink-0 rounded-[2px]" />}
          <span className="text-small font-medium text-foreground truncate">{f.p2}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {f.live ? (
            <span className="text-[0.65rem] font-semibold text-success-600 uppercase tracking-wide">● Live</span>
          ) : (
            <span className="text-tiny text-default-400">{kickoffLabel(f.start)}</span>
          )}
          {f.competition && (
            <span className="text-[0.6rem] text-default-400 bg-default-100 px-1.5 py-0.5 rounded-full leading-tight">
              {f.competition}
            </span>
          )}
        </div>
      </div>

      {/* Right badge */}
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

  React.useEffect(() => {
    const ctrl = new AbortController();
    const load = () => fetchFixtures(ctrl.signal).then(setFixtures).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { ctrl.abort(); clearInterval(t); };
  }, []);

  const list = (fixtures ?? [])
    .slice()
    .sort((a, b) => Number(b.live) - Number(a.live) || a.start - b.start)
    .slice(0, 4);

  const liveCount = list.filter(f => f.live).length;

  return (
    <Card className="border border-transparent bg-content1 dark:border-default-100">
      <CardBody className="gap-3 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
              <Icon className="text-default-500" icon="solar:eye-linear" width={16} />
            </div>
            <div>
              <h2 className="font-display text-medium font-semibold text-foreground leading-tight">Watching</h2>
              <p className="text-tiny text-default-400 leading-tight">TxLINE live feed</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {liveCount > 0 && (
              <Chip color="success" radius="full" size="sm" variant="dot">
                {liveCount} live
              </Chip>
            )}
            <Chip classNames={{ content: "text-[0.6rem] font-medium" }} radius="full" size="sm" variant="flat">
              Free tier
            </Chip>
          </div>
        </div>

        {/* Fixture list */}
        {fixtures === null ? (
          <div className="flex items-center justify-center gap-2 py-6 text-default-400">
            <Icon icon="solar:refresh-linear" className="animate-spin" width={16} />
            <span className="text-small">Loading fixtures…</span>
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-small text-default-400">Feed unavailable right now.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((f) => <FixtureRow key={f.fixtureId} f={f} />)}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
