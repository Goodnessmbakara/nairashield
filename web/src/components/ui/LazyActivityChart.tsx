"use client";

import React, { Suspense } from "react";
import { Card, Skeleton } from "@heroui/react";
import type { ActivityChartProps } from "./ActivityChart";

const ActivityChart = React.lazy(() => import("./ActivityChart"));

function ChartSkeleton({ height = 220, className }: { height?: number; className?: string }) {
  return (
    <Card
      className={`border border-transparent bg-content1/90 backdrop-blur-md dark:border-default-100 ${className ?? ""}`}
    >
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-4 w-28 rounded-lg" />
        <Skeleton className="h-8 w-16 rounded-lg" />
        <Skeleton className="w-full rounded-lg" style={{ height: height - 40 }} />
      </div>
    </Card>
  );
}

/** Code-split recharts so the landing JS payload stays lighter. */
export default function LazyActivityChart(props: ActivityChartProps) {
  return (
    <Suspense fallback={<ChartSkeleton className={props.className} height={props.height} />}>
      <ActivityChart {...props} />
    </Suspense>
  );
}
