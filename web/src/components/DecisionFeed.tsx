"use client";

import React from "react";
import { Avatar, Badge, Card, Chip, cn } from "@heroui/react";
import { Icon } from "@iconify/react";
import type { Tick } from "../lib/agent";

function actionLabel(action: string) {
  if (action === "TRADE") return "Take opportunity";
  if (action === "HOLD") return "Keep earning";
  return action;
}

const DecisionCard = React.forwardRef<HTMLDivElement, { tick: Tick; className?: string }>(
  ({ tick, className, ...props }, ref) => {
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
              name="NS"
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
              executed
                ? "border border-success-100 bg-success-50/40"
                : "bg-content2",
            )}
          >
            <p className="text-small leading-6">{tick.decision.reason}</p>

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
  },
);
DecisionCard.displayName = "DecisionCard";

type FeedProps = {
  ticks: Tick[];
  error: string | null;
  loading: boolean;
  className?: string;
};

const DecisionFeed = React.forwardRef<HTMLDivElement, FeedProps>(
  ({ ticks, error, loading, className }, ref) => (
    <Card
      ref={ref}
      className={cn(
        "border border-transparent bg-content1/90 p-5 backdrop-blur-md dark:border-default-100 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-medium font-medium text-default-900">Recent decisions</h2>
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
            classNames={{ content: "font-medium text-[0.65rem]" }}
            radius="sm"
            size="sm"
            variant="flat"
          >
            {ticks.length} shown
          </Chip>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-6">
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
              When the agent runs, each choice will show up here.
            </p>
          </div>
        )}

        {ticks.map((tick) => (
          <DecisionCard key={tick.id} tick={tick} />
        ))}
      </div>
    </Card>
  ),
);
DecisionFeed.displayName = "DecisionFeed";

export default DecisionFeed;
