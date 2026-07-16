"use client";

import React from "react";
import { Card, Chip, cn } from "@heroui/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
} from "recharts";

export type ChartPoint = { label: string; value: number };

export type ActivityChartProps = {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "neutral" | "negative";
  data: ChartPoint[];
  className?: string;
  height?: number;
  emptyLabel?: string;
};

/**
 * Design ProMax Charts/Graphs area chart
 * @see sources/Charts/Graphs (2)__App.tsx
 * Note: omit XAxis translateX tilt from Pro sample (it skews labels).
 */
const ActivityChart = React.forwardRef<HTMLDivElement, ActivityChartProps>(
  (
    {
      title,
      value,
      change,
      changeType = "neutral",
      data,
      className,
      height = 280,
      emptyLabel = "Not enough activity yet",
    },
    ref,
  ) => {
    const gradId = React.useId().replace(/:/g, "");
    const color =
      changeType === "positive" ? "success" : changeType === "negative" ? "danger" : "primary";
    const hasData = data.length >= 2;

    return (
      <Card
        ref={ref}
        as="dl"
        className={cn("border border-transparent bg-content1/90 backdrop-blur-md dark:border-default-100", className)}
      >
        <div className="flex flex-col gap-y-2 p-6 pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <dt className="text-small font-medium text-default-500">{title}</dt>
              <dd className="font-display mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground">
                {value}
              </dd>
            </div>
            {change && (
              <Chip
                classNames={{ content: "font-medium" }}
                color={
                  changeType === "positive"
                    ? "success"
                    : changeType === "negative"
                      ? "danger"
                      : "default"
                }
                radius="sm"
                size="sm"
                variant="flat"
              >
                {change}
              </Chip>
            )}
          </div>
        </div>

        <div className="w-full [&_.recharts-surface]:outline-none" style={{ height, minHeight: height }}>
          {hasData ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart
                accessibilityLayer
                data={data}
                margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="10%"
                      stopColor={`hsl(var(--heroui-${color}-500))`}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor={`hsl(var(--heroui-${color}-100))`}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="hsl(var(--heroui-default-200))"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                  tickLine={false}
                />
                <RechartsTooltip
                  content={({ label, payload }) => (
                    <div className="flex h-auto min-w-[120px] items-center gap-x-2 rounded-medium bg-foreground p-2 text-tiny shadow-small">
                      <div className="flex w-full flex-col gap-y-0">
                        <div className="flex w-full items-center gap-x-1 text-small text-background">
                          <span className="font-semibold tabular-nums">
                            {payload?.[0]?.value as number}
                          </span>
                        </div>
                        <span className="text-small font-medium text-default-400">{label}</span>
                      </div>
                    </div>
                  )}
                  cursor={{ strokeWidth: 0 }}
                />
                <Area
                  activeDot={{
                    stroke: `hsl(var(--heroui-${color}))`,
                    strokeWidth: 2,
                    fill: "hsl(var(--heroui-background))",
                    r: 5,
                  }}
                  animationDuration={1000}
                  animationEasing="ease"
                  dataKey="value"
                  fill={`url(#${gradId})`}
                  stroke={`hsl(var(--heroui-${color}))`}
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-small text-default-400">{emptyLabel}</p>
            </div>
          )}
        </div>
      </Card>
    );
  },
);
ActivityChart.displayName = "ActivityChart";

export default ActivityChart;
