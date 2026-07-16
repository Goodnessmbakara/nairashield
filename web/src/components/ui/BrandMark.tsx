"use client";

import React from "react";
import { cn } from "@heroui/react";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md";
};

/** Logo mark: single letter N. Full name stays in aria-label for a11y. */
const BrandMark = React.forwardRef<HTMLSpanElement, BrandMarkProps>(
  ({ className, size = "sm" }, ref) => (
    <span
      ref={ref}
      aria-label="NairaShield"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-default-foreground font-display font-bold text-background",
        size === "sm" && "h-8 w-8 text-small",
        size === "md" && "h-9 w-9 text-medium",
        className,
      )}
      role="img"
    >
      N
    </span>
  ),
);
BrandMark.displayName = "BrandMark";

export default BrandMark;
