"use client";

import React from "react";
import { Card, CardBody, Chip, cn } from "@heroui/react";
import LazyActivityChart from "../ui/LazyActivityChart";
import BuiltOnMarquee from "./BuiltOnMarquee";
import { useAgent } from "../../hooks/useAgent";
import { checksSeriesFromTicks, heldSeriesFromTicks } from "../../lib/chart-from-ticks";

function actionLabel(action: string) {
  if (action === "TRADE") return "Take opportunity";
  if (action === "HOLD") return "Keep earning";
  return action;
}

/** Live product surface only - no mock metrics. */
const HeroPreview = React.forwardRef<HTMLDivElement, { className?: string }>(
  ({ className }, ref) => {
    const { ticks, error, loading } = useAgent();
    const checks = ticks.length;
    const held = ticks.filter((t) => t.decision.action === "HOLD").length;
    const chartData = heldSeriesFromTicks(ticks);
    const checkSeries = checksSeriesFromTicks(ticks);
    const series = chartData.length >= 2 ? chartData : checkSeries;
    const latest = ticks[0];

    return (
      <div ref={ref} className={cn("flex w-full flex-col gap-4", className)}>
        <div className="grid gap-4 lg:grid-cols-5">
          <LazyActivityChart
            change={series.length >= 2 ? "this session" : undefined}
            changeType="positive"
            className="lg:col-span-3"
            data={series}
            emptyLabel={
              loading
                ? "Loading live activity…"
                : error
                  ? "Sign in and connect the agent for live graphs"
                  : "Run a few checks to plot activity"
            }
            height={300}
            title="Kept earning over time"
            value={checks > 0 ? String(held) : "-"}
          />

          <Card className="border border-transparent bg-content1/90 backdrop-blur-md dark:border-default-100 lg:col-span-2">
            <CardBody className="gap-4 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-medium font-medium text-foreground">Recent decisions</h3>
                <Chip
                  classNames={{ content: "font-medium text-[0.65rem]" }}
                  color={error ? "warning" : checks > 0 ? "success" : "default"}
                  radius="sm"
                  size="sm"
                  variant="flat"
                >
                  {error ? "offline" : loading && checks === 0 ? "loading" : "live"}
                </Chip>
              </div>

              {error && (
                <p className="rounded-medium bg-warning-50 px-3 py-2 text-tiny text-default-600">
                  {error}
                </p>
              )}

              {!error && ticks.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
                  <p className="text-small text-default-500">No live decisions yet</p>
                  <p className="text-tiny text-default-400">
                    Sign in and run checks. Numbers only come from the real agent.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {ticks.slice(0, 4).map((tick) => (
                  <div key={tick.id} className="rounded-medium bg-content2 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Chip
                        classNames={{ content: "font-medium text-[0.65rem]" }}
                        color={tick.decision.action === "TRADE" ? "success" : "default"}
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
                    <p className="mt-1.5 text-tiny leading-5 text-default-600">
                      {tick.decision.reason}
                    </p>
                    {(tick.decision.team || typeof tick.decision.spread === "number") && (
                      <div className="mt-2 flex flex-wrap gap-2 text-tiny">
                        {tick.decision.team && (
                          <span className="font-medium text-primary">{tick.decision.team}</span>
                        )}
                        {typeof tick.decision.spread === "number" && (
                          <span className="tabular-nums text-default-500">
                            Odds / spread{" "}
                            <span className="font-medium text-default-700">
                              {tick.decision.spread}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {latest && (
                <p className="text-tiny text-default-400">
                  Session checks:{" "}
                  <span className="font-medium tabular-nums text-default-600">{checks}</span>
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Foundation base - stack marquee, not partners / “works with” */}
        <BuiltOnMarquee className="rounded-large shadow-small" />
      </div>
    );
  },
);
HeroPreview.displayName = "HeroPreview";

export default HeroPreview;
