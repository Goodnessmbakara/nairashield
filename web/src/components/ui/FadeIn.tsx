"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ENTER_Y, SPRING } from "../../lib/motion";

type FadeInProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
  amount?: number;
};

/** Shared section/card entrance - transform + opacity only. */
export default function FadeIn({
  children,
  className,
  delay = 0,
  y = ENTER_Y,
  once = true,
  amount = 0.2,
}: FadeInProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount }}
      transition={reduce ? { duration: 0 } : { ...SPRING.card, delay }}
    >
      {children}
    </motion.div>
  );
}
