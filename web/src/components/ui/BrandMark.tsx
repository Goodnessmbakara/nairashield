"use client";

import React from "react";
import { cn } from "@heroui/react";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

/**
 * Retegol mark: geometric R monogram (emerald favicon).
 */
const BrandMark = React.forwardRef<HTMLSpanElement, BrandMarkProps>(
  ({ className, size = "sm" }, ref) => {
    const dim =
      size === "lg" ? "h-11 w-11" : size === "md" ? "h-9 w-9" : "h-8 w-8";

    return (
      <span
        ref={ref}
        aria-label="Retegol"
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
          dim,
          className,
        )}
        role="img"
      >
        <img
          alt=""
          className="h-full w-full object-cover"
          decoding="async"
          height={44}
          src="/favicon.svg"
          width={44}
        />
      </span>
    );
  },
);
BrandMark.displayName = "BrandMark";

export default BrandMark;
