"use client";

import React from "react";
import { Avatar, Badge, Card, Chip, cn } from "@heroui/react";
import { Icon } from "@iconify/react";
import type { Tick } from "../lib/agent";
import { dedupeTicksForFeed, isIdleHold } from "../lib/ticks";

const MAX_HISTORY = 8;

function actionLabel(action: string) {
  if (action === "TRADE") return "Take opportunity";
  if (action === "HOLD") return "Keep earning";
  return action;
}

const StatusPanel = ({ tick, flash }: { tick: Tick; flash?: boolean }) => {
  const isTrade = tick.decision.action === "TRADE";
  return (
    <div
      className={cn(
        "rounded-medium border bg-content2 px-4 py-4 transition-[box-shadow,border-color] duration-500",
        flash
          ? "border-success-400 shadow-[0_0_0_1px_rgba(23,201,100,0.35)]"
          : "border-default-200",
      )}
    >
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
        {flash && (
          <Chip
            classNames={{ content: "font-medium text-[0.65rem]" }}
            color="success"
            radius="sm"
            size="sm"
            variant="flat"
          >
            just now
          </Chip>
        )}
        <span className="ml-auto text-tiny tabular-nums text-default-400">
          {tick.receivedAt}
        </span>
      </div>
      <p className="mt-3 text-small leading-6 text-default-700">{tick.decision.reason}</p>
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
  { tick: Tick; className?: string }
>(({ tick, className, ...props }, ref) => {
  const executed = tick.status === "Executed";
  const isTrade = tick.decision.action === "TRADE";

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
          <span className="ml-auto text-tiny tabular-nums text-default-400">
            {tick.receivedAt}
          </span>
        </div>

        <div
          className={cn(
            "relative w-full rounded-medium px-4 py-3 text-default-600",
            executed ? "border border-success-100 bg-success-50/40" : "bg-content2",
          )}
        >
          <p className="text-small leading-6">{tick.decision.reason}</p>
        </div>
      </div>
    </div>
  );
});
DecisionCard.displayName = "DecisionCard";

function syncLabel(lastSyncedAt: number | null): string {
  if (!lastSyncedAt) return "connecting…";
  const sec = Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000));
  if (sec < 3) return "live";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)}m ago`;
}

type FeedProps = {
  ticks: Tick[];
  error: string | null;
  loading: boolean;
  lastSyncedAt?: number | null;
  liveFlashId?: string | null;
  className?: string;
};

const DecisionFeed = React.forwardRef<HTMLDivElement, FeedProps>(
  ({ ticks, error, loading, lastSyncedAt = null, liveFlashId = null, className }, ref) => {
    const feed = React.useMemo(() => dedupeTicksForFeed(ticks), [ticks]);
    const current = feed[0];
    const history = feed.slice(1, 1 + MAX_HISTORY).filter((t) => !isIdleHold(t));
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
      const id = window.setInterval(() => setTick((n) => n + 1), 1000);
      return () => window.clearInterval(id);
    }, []);

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
          <Chip
            classNames={{ content: "font-medium text-[0.65rem]" }}
            color={lastSyncedAt && Date.now() - lastSyncedAt < 8_000 ? "success" : "default"}
            radius="sm"
            size="sm"
            startContent={
              <span
                className={cn(
                  "ml-1 h-1.5 w-1.5 rounded-full",
                  lastSyncedAt && Date.now() - lastSyncedAt < 8_000
                    ? "animate-pulse bg-success"
                    : "bg-default-400",
                )}
              />
            }
            variant="flat"
          >
            {syncLabel(lastSyncedAt)}
          </Chip>
          {loading && (
            <Chip
              classNames={{ content: "font-medium text-[0.65rem]" }}
              color="primary"
              radius="sm"
              size="sm"
              variant="flat"
            >
              running check
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
                Status updates when the market or the decision changes — not every idle minute.
              </p>
            </div>
          )}

          {current && (
            <StatusPanel flash={liveFlashId === current.id} tick={current} />
          )}

          {history.length > 0 && (
            <div className="flex flex-col gap-4">
              <p className="text-tiny font-medium text-default-500">Earlier changes</p>
              {history.map((t) => (
                <DecisionCard
                  key={t.id}
                  className={liveFlashId === t.id ? "opacity-100" : undefined}
                  tick={t}
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
