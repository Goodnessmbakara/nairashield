"use client";

/* Problem (PAS step 1) - plain hierarchy: h1 → body → CTAs. No eyebrow label. */

import React from "react";
import { Button, Link } from "@heroui/react";
import { motion, useReducedMotion } from "framer-motion";
import { problem } from "../../data/landing";
import { useAuthCta } from "../../hooks/useAuthCta";
import { ENTER_Y, SPRING, TIMING } from "../../lib/motion";

export default function Hero() {
  const reduce = useReducedMotion();
  const cta = useAuthCta("Get started");
  const enter = (delay: number) => (reduce ? { duration: 0 } : { ...SPRING.soft, delay });

  return (
    <section
      className="flex w-full flex-col items-center px-4 pb-10 pt-16 sm:px-6 sm:pb-12 sm:pt-20 md:pt-24"
      id="hero"
    >
      <div className="z-20 flex w-full max-w-2xl flex-col items-center gap-5 text-center sm:gap-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: ENTER_Y }}
          animate={{ opacity: 1, y: 0 }}
          transition={enter(TIMING.heroTitle - 0.1)}
          className="rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary shadow-sm"
        >
          Autonomous agent · Live TxLINE
        </motion.div>
        
        <motion.h1
          className="font-display text-[clamp(32px,7.5vw,48px)] font-bold leading-[1.15] tracking-tighter text-foreground"
          initial={reduce ? false : { opacity: 0, y: ENTER_Y }}
          animate={{ opacity: 1, y: 0 }}
          transition={enter(TIMING.heroTitle)}
        >
          {problem.title}
        </motion.h1>

        <motion.p
          className="max-w-[440px] text-base leading-7 text-default-600"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={enter(TIMING.heroBody)}
        >
          {problem.body}
        </motion.p>

        <motion.div
          className="flex flex-col items-center gap-3 sm:flex-row"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={enter(TIMING.heroCta)}
        >
          <Button
            as={Link}
            className="t-btn-press t-btn-primary h-11 bg-default-foreground px-8 text-small font-medium text-background"
            href={cta.href}
            radius="full"
          >
            {cta.label}
          </Button>
          <Button
            as={Link}
            className="t-btn-press t-btn-secondary h-11 border border-default-200 bg-content1/80 px-6 text-small font-medium text-foreground"
            href="#how"
            radius="full"
            variant="bordered"
          >
            See how it works
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
