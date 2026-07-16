"use client";

/**
 * Design ProMax scrolling-banner under hero.
 * Transparent strip on the same atmosphere - no second background panel.
 * @see sources/Application/scrolling-banners (5)__App.tsx
 * @see sources/Marketing/hero-sections scrolling-banner
 */

import React from "react";
import { cn } from "@heroui/react";
import { motion, useReducedMotion } from "framer-motion";
import ScrollingBanner from "../ui/ScrollingBanner";
import { builtOn } from "../../data/landing";
import { SPRING, TIMING } from "../../lib/motion";

const BuiltOnMarquee = React.forwardRef<HTMLElement, { className?: string }>(
  ({ className }, ref) => {
    const reduce = useReducedMotion();

    return (
      <motion.section
        ref={ref}
        aria-label="Built on"
        className={cn(
          // Same hero surface: no bg-content1, no border band, no blur plate
          "z-20 w-full bg-transparent py-8 sm:py-10",
          className,
        )}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduce ? { duration: 0 } : { ...SPRING.soft, delay: TIMING.heroCta + 0.1 }}
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <ScrollingBanner duration={32} gap="2.5rem" showShadow shouldPauseOnHover>
            {builtOn.map((item) => (
              <div
                key={item.name}
                className="flex h-9 shrink-0 items-center gap-2 text-default-600"
              >
                <img
                  alt=""
                  className="h-5 w-5 object-contain opacity-70"
                  height={20}
                  src={item.src}
                  width={20}
                />
                <span className="whitespace-nowrap text-small font-medium tracking-tight text-default-500">
                  {item.name}
                </span>
              </div>
            ))}
          </ScrollingBanner>
        </div>
      </motion.section>
    );
  },
);
BuiltOnMarquee.displayName = "BuiltOnMarquee";

export default BuiltOnMarquee;
