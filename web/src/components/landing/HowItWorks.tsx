"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { steps } from "../../data/landing";
import ActionCard from "../ui/ActionCard";

const CARDS = {
  stagger: 0.08,
  offsetY: 14,
  spring: { type: "spring" as const, stiffness: 300, damping: 28 },
};

/** Design ProMax action-card grid */
export default function HowItWorks() {
  const reduce = useReducedMotion();

  return (
    <section
      className="mx-auto w-full max-w-6xl px-4 py-20 sm:py-28 md:px-6 lg:px-8"
      id="how-it-works"
    >
      <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center gap-4 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Four steps. No babysitting.
        </h2>
        <p className="text-default-500">
          Most betting money sits still between plays. Here, waiting still earns, and moving is the
          exception.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            initial={reduce ? false : { opacity: 0, y: CARDS.offsetY }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-20px" }}
            transition={
              reduce ? { duration: 0 } : { ...CARDS.spring, delay: i * CARDS.stagger }
            }
          >
            <ActionCard
              color={i === 0 ? "primary" : "default"}
              description={step.body}
              icon={step.icon}
              title={step.title}
            />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
