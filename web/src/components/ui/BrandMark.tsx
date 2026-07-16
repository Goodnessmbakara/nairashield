"use client";

import React from "react";
import { cn } from "@heroui/react";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

/**
 * NairaShield mark: geometric N logo (generated emerald mark + crisp SVG fallback).
 * Style is monogram-like (similar craft to Astro’s mark) but not Astro colors.
 */
const BrandMark = React.forwardRef<HTMLSpanElement, BrandMarkProps>(
  ({ className, size = "sm" }, ref) => {
    const dim =
      size === "lg" ? "h-11 w-11" : size === "md" ? "h-9 w-9" : "h-8 w-8";

    return (
      <span
        ref={ref}
        aria-label="NairaShield"
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
          src="/brand/n-logo.png"
          width={44}
          onError={(e) => {
            // Prefer SVG if raster fails
            const el = e.currentTarget;
            if (!el.src.endsWith("favicon.svg")) {
              el.src = "/favicon.svg";
            }
          }}
        />
      </span>
    );
  },
);
BrandMark.displayName = "BrandMark";

export default BrandMark;
