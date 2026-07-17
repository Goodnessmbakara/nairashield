"use client";

import React from "react";
import { Button, Card, CardBody, cn } from "@heroui/react";
import { Icon } from "@iconify/react";

export type GateTone = "neutral" | "warning" | "danger";

export type GateCardProps = {
  icon: string;
  title: string;
  description?: string;
  tone?: GateTone;
  actionLabel?: string;
  actionIcon?: string;
  isActionLoading?: boolean;
  isActionDisabled?: boolean;
  onAction?: () => void;
  className?: string;
};

/**
 * One gate state = one card + one primary action.
 * Tones follow the action-card colour map; palette comes from the app theme.
 */
const GateCard = React.forwardRef<HTMLDivElement, GateCardProps>(
  (
    {
      icon,
      title,
      description,
      tone = "neutral",
      actionLabel,
      actionIcon,
      isActionLoading,
      isActionDisabled,
      onAction,
      className,
    },
    ref,
  ) => {
    const colors = React.useMemo(() => {
      switch (tone) {
        case "warning":
          return {
            card: "border-warning-500",
            tile: "bg-warning-50 border-warning-100",
            icon: "text-warning-600",
          };
        case "danger":
          return {
            card: "border-danger-300",
            tile: "bg-danger-50 border-danger-100",
            icon: "text-danger",
          };
        default:
          return {
            card: "border-default-200",
            tile: "bg-default-50 border-default-100",
            icon: "text-default-500",
          };
      }
    }, [tone]);

    return (
      <Card ref={ref} className={cn("border-small", colors.card, className)} shadow="sm">
        <CardBody className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className={cn("flex h-fit w-fit rounded-medium border p-2", colors.tile)}>
            <Icon className={colors.icon} icon={icon} width={22} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-medium text-foreground">{title}</p>
            {description ? (
              <p className="text-small leading-5 text-default-400">{description}</p>
            ) : null}
          </div>

          {actionLabel && onAction ? (
            <Button
              className="t-btn-press t-btn-primary w-full shrink-0 bg-default-foreground font-medium text-background sm:w-auto"
              isDisabled={isActionDisabled}
              isLoading={isActionLoading}
              radius="full"
              size="sm"
              startContent={
                !isActionLoading && actionIcon ? <Icon icon={actionIcon} width={16} /> : undefined
              }
              onPress={onAction}
            >
              {actionLabel}
            </Button>
          ) : null}
        </CardBody>
      </Card>
    );
  },
);

GateCard.displayName = "GateCard";

export default GateCard;
