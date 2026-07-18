"use client";

import React from "react";
import { Card, CardBody, Chip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { fetchFixtures, type WatchedFixture } from "../../lib/agent";

function kickoffLabel(start: number): string {
  const d = new Date(start);
  const now = Date.now();
  const mins = Math.round((start - now) / 60000);
  if (mins > 0 && mins < 60) return `in ${mins}m`;
  if (mins >= 60 && mins < 36 * 60) return `in ${Math.round(mins / 60)}h`;
  return d.toUTCString().replace(":00 GMT", " UTC");
}

/**
 * What the agent is watching right now — straight from the authenticated
 * TxLINE fixtures feed. No fixtures = feed unavailable; nothing invented.
 */
export default function WatchingPanel() {
  const [fixtures, setFixtures] = React.useState<WatchedFixture[] | null>(null);

  React.useEffect(() => {
    const ctrl = new AbortController();
    const load = () => fetchFixtures(ctrl.signal).then(setFixtures).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      ctrl.abort();
      clearInterval(t);
    };
  }, []);

  const list = (fixtures ?? [])
    .slice()
    .sort((a, b) => Number(b.live) - Number(a.live) || a.start - b.start)
    .slice(0, 4);

  return (
    <Card className="border border-transparent bg-content1 dark:border-default-100">
      <CardBody className="gap-2 p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
            <Icon className="text-default-500" icon="solar:eye-linear" width={16} />
          </div>
          <h2 className="font-display text-medium font-semibold text-foreground">
            Watching
          </h2>
          <span className="text-tiny text-default-400">live TxLINE fixtures</span>
        </div>

        {fixtures === null ? (
          <p className="py-4 text-center text-small text-default-400">Loading fixtures…</p>
        ) : list.length === 0 ? (
          <p className="py-4 text-center text-small text-default-400">
            Fixture feed unavailable right now.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((f) => (
              <div
                key={f.fixtureId}
                className="flex items-center justify-between gap-2 rounded-medium border border-default-200 bg-content2 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {f.live ? (
                    <Chip color="success" radius="sm" size="sm" variant="flat">LIVE</Chip>
                  ) : (
                    <Icon className="shrink-0 text-default-400" icon="solar:clock-circle-linear" width={16} />
                  )}
                  <div className="flex min-w-0 items-center gap-1.5">
                    {f.flag1 && (
                      <img src={f.flag1} alt={f.p1} width={20} height={14} className="shrink-0 rounded-sm object-cover" />
                    )}
                    <span className="truncate text-small text-foreground">{f.p1}</span>
                    <span className="text-tiny text-default-400">vs</span>
                    {f.flag2 && (
                      <img src={f.flag2} alt={f.p2} width={20} height={14} className="shrink-0 rounded-sm object-cover" />
                    )}
                    <span className="truncate text-small text-foreground">{f.p2}</span>
                  </div>
                  {f.bettable && (
                    <Chip classNames={{ content: "text-[0.6rem] font-medium" }} radius="sm" size="sm" variant="flat">
                      bettable
                    </Chip>
                  )}
                </div>
                <p className="shrink-0 text-tiny tabular-nums text-default-500">
                  {f.live ? "in play" : kickoffLabel(f.start)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
