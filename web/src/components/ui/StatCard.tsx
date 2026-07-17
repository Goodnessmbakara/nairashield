"use client";

import React from "react";
import { Card, Chip, cn } from "@heroui/react";
import { Icon } from "@iconify/react";

export type StatCardProps = {
  title: string;
  value: string;
  hint: string;
  icon: string;
  /** Real share of total checks, 0–1. Omit when there is nothing real to show. */
  share?: number;
  className?: string;
};

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ title, value, hint, icon, share, className }, ref) => (
    <Card
      ref={ref}
      className={cn(
        "border border-transparent bg-content1 dark:border-default-100",
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex rounded-medium border border-default-100 bg-default-50 p-2">
          <Icon className="text-default-500" icon={icon} width={20} />
        </div>

        <div className="flex min-w-0 flex-col gap-y-1">
          <dt className="text-small font-medium text-default-500">{title}</dt>
          <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
            {value}
          </dd>
          <p className="text-tiny text-default-400">{hint}</p>
        </div>

        {typeof share === "number" ? (
          <Chip
            className="absolute right-4 top-4"
            classNames={{ content: "font-medium text-[0.65rem] tabular-nums" }}
            radius="sm"
            size="sm"
            variant="flat"
          >
            {Math.round(share * 100)}%
          </Chip>
        ) : null}
      </div>
    </Card>
  ),
);

StatCard.displayName = "StatCard";

export default StatCard;
