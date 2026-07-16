"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@heroui/react";

const WORD = {
  stagger: 0.05,
  offsetY: 10,
  spring: { type: "spring" as const, stiffness: 360, damping: 30 },
};

type AnimatedTitleProps = {
  lines: string[];
  className?: string;
  as?: "h1" | "h2";
};

/**
 * Word cascade typography - framer-motion spring on Y only.
 * Opacity stays at 1 so SSR / slow JS never hides a line.
 */
const AnimatedTitle = React.forwardRef<HTMLHeadingElement, AnimatedTitleProps>(
  ({ lines, className, as: Tag = "h1" }, ref) => {
    const reduce = useReducedMotion();
    let wordIndex = 0;
    const fullText = lines.join(" ");

    return (
      <Tag
        ref={ref}
        aria-label={fullText}
        className={cn("font-display font-bold tracking-tighter text-foreground", className)}
      >
        {lines.map((line, lineIdx) => {
          const words = line.split(" ");
          return (
            <span key={lineIdx} className="block">
              {words.map((word, i) => {
                const index = wordIndex++;
                return (
                  <React.Fragment key={`${lineIdx}-${i}-${word}`}>
                    <motion.span
                      className="inline-block"
                      initial={reduce ? false : { y: WORD.offsetY }}
                      animate={{ y: 0 }}
                      transition={
                        reduce
                          ? { duration: 0 }
                          : { ...WORD.spring, delay: 0.05 + index * WORD.stagger }
                      }
                    >
                      {word}
                    </motion.span>
                    {i < words.length - 1 ? " " : null}
                  </React.Fragment>
                );
              })}
            </span>
          );
        })}
      </Tag>
    );
  },
);
AnimatedTitle.displayName = "AnimatedTitle";

export default AnimatedTitle;
