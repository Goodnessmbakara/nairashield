"use client";

/**
 * Design ProMax scrolling-banner
 * Transparent container; only edge fades via ScrollShadow.
 * Two identical halves for seamless -50% loop.
 * @see sources/Application/scrolling-banners (5)__scrolling-banner.tsx
 */

import type { ScrollShadowProps } from "@heroui/react";

import React from "react";
import { ScrollShadow, cn } from "@heroui/react";

interface ScrollingBannerProps extends ScrollShadowProps {
  isReverse?: boolean;
  showShadow?: boolean;
  shouldPauseOnHover?: boolean;
  gap?: string;
  duration?: number;
}

const ScrollingBanner = React.forwardRef<HTMLDivElement, ScrollingBannerProps>(
  (
    {
      className,
      isReverse,
      gap = "2.5rem",
      showShadow = true,
      shouldPauseOnHover = true,
      duration = 32,
      children,
      style,
      ...props
    },
    ref,
  ) => {
    const items = React.Children.toArray(children).filter(React.isValidElement);
    // ProMax seamless loop: two identical tracks, animate -50%
    const track = [...items, ...items];

    return (
      <ScrollShadow
        ref={ref}
        className={cn("flex w-full overflow-x-hidden bg-transparent", className)}
        isEnabled={showShadow}
        offset={-24}
        orientation="horizontal"
        size={80}
        visibility="both"
        {...props}
        style={
          {
            "--gap": gap,
            "--duration": `${duration}s`,
            ...style,
          } as React.CSSProperties
        }
      >
        <div
          className={cn(
            "flex w-max items-center gap-[--gap] animate-scrolling-banner motion-reduce:animate-none",
            {
              "[animation-direction:reverse]": isReverse,
              "hover:[animation-play-state:paused]": shouldPauseOnHover,
            },
          )}
        >
          {track.map((child, i) =>
            React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<{ key?: string }>, {
                  key: `m-${i}`,
                })
              : child,
          )}
        </div>
      </ScrollShadow>
    );
  },
);
ScrollingBanner.displayName = "ScrollingBanner";

export default ScrollingBanner;
