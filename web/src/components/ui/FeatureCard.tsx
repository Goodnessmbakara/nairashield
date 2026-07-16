"use client";

/**
 * Design ProMax action-card pattern.
 * Border + hover lift (transitions-dev t-card-lift).
 * @see sources/Application/cards (20)__action-card.tsx
 */

import type { CardProps } from "@heroui/react";

import React from "react";
import { Card, CardBody, cn } from "@heroui/react";
import { Icon } from "@iconify/react";

export type FeatureCardProps = CardProps & {
  title: string;
  description: string;
  icon: string;
};

const FeatureCard = React.forwardRef<HTMLDivElement, FeatureCardProps>(
  ({ title, description, icon, className, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn(
        "t-card-lift h-full border border-default-200 bg-content1",
        className,
      )}
      shadow="none"
      {...props}
    >
      <CardBody className="flex h-full flex-row items-start gap-3 p-4 sm:p-5">
        <div className="flex shrink-0 items-center rounded-medium border border-default-100 bg-default-50 p-2 text-default-600 transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]">
          <Icon icon={icon} width={22} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-medium font-medium text-foreground">{title}</p>
          <p className="text-small leading-6 text-default-500">{description}</p>
        </div>
      </CardBody>
    </Card>
  ),
);

FeatureCard.displayName = "FeatureCard";

export default FeatureCard;
