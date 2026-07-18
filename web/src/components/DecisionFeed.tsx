"use client";

import React from "react";
import { Avatar, Badge, Card, Chip, cn } from "@heroui/react";
import { Icon } from "@iconify/react";
import type { Tick } from "../lib/agent";

const MAX_HISTORY_GROUPS = 10;

function actionLabel(action: string) {
  if (action === "TRADE") return "Take opportunity";
  if (action === "HOLD") return "Keep earning";
  return action;
}

/** Idle HOLD — waiting / no in-play market (collapse across wording variants). */
function isIdleHold(tick: Tick): boolean {
  if (tick.decision.action !== "HOLD") return false;
  const r = tick.decision.reason.toLowerCase();
  return (
    r.includes("no live odds") ||
    r.includes("not in-play") ||
    r.includes("not in play") ||
    r.includes("capital stays in yield") ||
    r.includes("keep capital in kamino") ||
    r.includes("stays in yield") ||
    (!tick.decision.team && typeof tick.decision.spread !== "number")
  );
}

function pickBestReason(ticks: Tick[]): string {
  const withFixture = ticks.find((t) =>
    /next fixture/i.test(t.decision.reason),
  );
  return (withFixture ?? ticks[0]).decision.reason;
}

type DecisionGroup = {
  tick: Tick;
  count: number;
  firstAt: string;
  idle: boolean;
  reason: string;
};

function groupTicks(ticks: Tick[]): DecisionGroup[] {
  const groups: DecisionGroup[] = [];
  for (const tick of ticks) {
    const idle = isIdleHold(tick);
    const last = groups[groups.length - 1];
    const sameIdle = last?.idle && idle;
    const sameExact =
      last &&
      !last.idle &&
      !idle &&
      last.tick.decision.action === tick.decision.action &&
      last.tick.decision.reason === tick.decision.reason;

    if (last && (sameIdle || sameExact)) {
      last.count += 1;
      last.firstAt = tick.receivedAt; // newest-first → oldest end of range
      if (idle && /next fixture/i.test(tick.decision.reason)) {
        last.reason = tick.decision.reason;
        last.tick = tick;
      }
    } else {
      groups.push({
        tick,
        count: 1,
        firstAt: tick.receivedAt,
        idle,
        reason: tick.decision.reason,
      });
    }
  }

  // Prefer fixture-named reason for leading idle group when scanning newest
  if (groups[0]?.idle) {
    const idleRun: Tick[] = [];
    for (const t of ticks) {
      if (!isIdleHold(t)) break;
      idleRun.push(t);
    }
    if (idleRun.length) {
      groups[0].reason = pickBestReason(idleRun);
      groups[0].tick = idleRun[0];
      groups[0].count = idleRun.length;
      groups[0].firstAt = idleRun[idleRun.length - 1].receivedAt;
    }
  }

  return groups;
}

const StatusPanel = ({
  tick,
  count,
  firstAt,
  reason,
}: {
  tick: Tick;
  count: number;
  firstAt: string;
  reason: string;
}) => {
  const isTrade = tick.decision.action === "TRADE";
  return (
    <div className="rounded-medium border border-default-200 bg-content2 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-tiny font-medium uppercase tracking-wide text-default-500">
          Current status
        </p>
        <Chip
          classNames={{ content: "font-medium text-[0.65rem]" }}
          color={isTrade ? "success" : "default"}
          radius="sm"
          size="sm"
          variant="flat"
        >
          {actionLabel(tick.decision.action)}
        </Chip>
        {count > 1 && (
          <Chip
            classNames={{ content: "font-medium text-[0.65rem] tabular-nums" }}
            radius="sm"
            size="sm"
            variant="flat"
          >
            ×{count} checks
          </Chip>
        )}
        <span className="ml-auto text-tiny tabular-nums text-default-400">
          {count > 1 ? `${firstAt} – ${tick.receivedAt}` : tick.receivedAt}
        </span>
      </div>
      <p className="mt-3 text-small leading-6 text-default-700">{reason}</p>
      {(tick.decision.team || typeof tick.decision.spread === "number") && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-default-100 pt-3">
          {tick.decision.team && (
            <Chip color="primary" radius="sm" size="sm" variant="flat">
              {tick.decision.team}
            </Chip>
          )}
          {typeof tick.decision.spread === "number" && (
            <span className="text-tiny text-default-500">
              Odds / spread{" "}
              <span className="font-medium tabular-nums text-default-700">
                {tick.decision.spread}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const DecisionCard = React.forwardRef<
  HTMLDivElement,
  { tick: Tick; count?: number; firstAt?: string; reason?: string; className?: string }
>(({ tick, count = 1, firstAt, reason, className, ...props }, ref) => {
  const executed = tick.status === "Executed";
  const isTrade = tick.decision.action === "TRADE";
  const body = reason ?? tick.decision.reason;

  return (
    <div ref={ref} className={cn("flex gap-3", className)} {...props}>
      <div className="relative flex-none">
        <Badge
          isOneChar
          color={executed ? "success" : "default"}
          content={
            <Icon
              className="text-background"
              icon={executed ? "solar:check-circle-bold" : "solar:pause-circle-bold"}
              width={12}
            />
          }
          placement="bottom-right"
          shape="circle"
        >
          <Avatar
            showFallback
            classNames={{
              base: "border border-default-200 bg-content2",
              name: "text-small font-semibold text-default-600",
            }}
            name="R"
            radius="lg"
            size="md"
          />
        </Badge>
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-small font-medium text-default-700">Agent</span>
          <Chip
            classNames={{ content: "font-medium text-[0.65rem]" }}
            color={isTrade ? "success" : "default"}
            radius="sm"
            size="sm"
            variant="flat"
          >
            {actionLabel(tick.decision.action)}
          </Chip>
          {count > 1 && (
            <Chip
              classNames={{ content: "font-medium text-[0.65rem] tabular-nums" }}
              radius="sm"
              size="sm"
              variant="flat"
            >
              ×{count}
            </Chip>
          )}
          <span className="ml-auto text-tiny tabular-nums text-default-400">
            {count > 1 && firstAt ? `${firstAt} – ${tick.receivedAt}` : tick.receivedAt}
          </span>
        </div>

        <div
          className={cn(
            "relative w-full rounded-medium px-4 py-3 text-default-600",
            executed ? "border border-success-100 bg-success-50/40" : "bg-content2",
          )}
        >
          <p className="text-small leading-6">{body}</p>
          {(tick.decision.team || typeof tick.decision.spread === "number") && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-default-100 pt-3">
              {tick.decision.team && (
                <Chip color="primary" radius="sm" size="sm" variant="flat">
                  {tick.decision.team}
                </Chip>
              )}
              {typeof tick.decision.spread === "number" && (
                <span className="text-tiny text-default-500">
                  Odds / spread{" "}
                  <span className="font-medium tabular-nums text-default-700">
                    {tick.decision.spread}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
DecisionCard.displayName = "DecisionCard";

type FeedProps = {
  ticks: Tick[];
  error: string | null;
  loading: boolean;
  className?: string;
};

const DecisionFeed = React.forwardRef<HTMLDivElement, FeedProps>(
  ({ ticks, error, loading, className }, ref) => {
    const groups = groupTicks(ticks);
    const current = groups[0];
    const history = groups.slice(1, 1 + MAX_HISTORY_GROUPS);
    const collapsedChecks = groups.reduce((n, g) => n + g.count, 0);

    return (
      <Card
        ref={ref}
        className={cn(
          "border border-transparent bg-content1/90 p-5 backdrop-blur-md dark:border-default-100 sm:p-6",
          className,
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-medium font-medium text-default-900">Agent activity</h2>
          {loading && (
            <Chip
              classNames={{ content: "font-medium text-[0.65rem]" }}
              color="primary"
              radius="sm"
              size="sm"
              variant="flat"
            >
              updating
            </Chip>
          )}
          {!loading && ticks.length > 0 && (
            <Chip
              classNames={{ content: "font-medium text-[0.65rem] tabular-nums" }}
              radius="sm"
              size="sm"
              variant="flat"
            >
              {groups.length === 1 && current?.idle
                ? `×${current.count} checks collapsed`
                : `${groups.length} state${groups.length === 1 ? "" : "s"} · ${collapsedChecks} checks`}
            </Chip>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-5">
          {error && (
            <div className="flex items-start gap-3 rounded-medium border border-warning-100 bg-warning-50/50 px-4 py-3">
              <Icon
                className="mt-0.5 flex-none text-warning"
                icon="solar:danger-triangle-linear"
                width={18}
              />
              <div className="min-w-0">
                <p className="text-small font-medium text-default-700">Can’t reach the agent</p>
                <p className="mt-1 text-tiny leading-5 text-default-500">{error}</p>
              </div>
            </div>
          )}

          {!error && ticks.length === 0 && loading && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Icon className="animate-spin text-primary" icon="solar:refresh-linear" width={22} />
              <p className="text-small text-default-500">Loading the latest check…</p>
            </div>
          )}

          {!error && ticks.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-2 rounded-medium bg-content2 py-12 text-center">
              <Icon className="text-default-300" icon="solar:inbox-linear" width={28} />
              <p className="text-small text-default-500">No decisions yet</p>
              <p className="max-w-xs text-tiny text-default-400">
                When the agent runs, its current status shows here — not every idle minute.
              </p>
            </div>
          )}

          {current && (
            <StatusPanel
              count={current.count}
              firstAt={current.firstAt}
              reason={current.reason}
              tick={current.tick}
            />
          )}

          {history.length > 0 && (
            <div className="flex flex-col gap-4">
              <p className="text-tiny font-medium text-default-500">Earlier changes</p>
              {history.map((g) => (
                <DecisionCard
                  key={`${g.tick.id}-${g.firstAt}`}
                  count={g.count}
                  firstAt={g.firstAt}
                  reason={g.reason}
                  tick={g.tick}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    );
  },
);
DecisionFeed.displayName = "DecisionFeed";

export default DecisionFeed;
