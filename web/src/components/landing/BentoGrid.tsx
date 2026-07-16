"use client";

/**
 * How it works (PAS step 4) - numbered steps, Design ProMax action density.
 * No slogan tiles. No "not X, it's Y" copy.
 */

import React from "react";
import { Card, CardBody } from "@heroui/react";
import { motion, useReducedMotion } from "framer-motion";
import { steps } from "../../data/landing";
import { ENTER_Y, SPRING, TIMING } from "../../lib/motion";
import FadeIn from "../ui/FadeIn";

export default function BentoGrid() {
  const reduce = useReducedMotion();

  return (
    <section className="section-pad mx-auto w-full max-w-6xl" id="how">
      <FadeIn className="mb-8 max-w-2xl sm:mb-10">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          How it works
        </h2>
        <p className="mt-3 max-w-xl text-small leading-6 text-default-500">
          Fund once. The agent earns by default, checks live markets, acts when the math clears, and
          returns capital to yield.
        </p>
      </FadeIn>

      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((item, i) => (
          <motion.li
            key={item.step}
            className={i === steps.length - 1 ? "sm:col-span-2 lg:col-span-1" : undefined}
            initial={reduce ? false : { opacity: 0, y: ENTER_Y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={
              reduce
                ? { duration: 0 }
                : { ...SPRING.card, delay: TIMING.section + i * TIMING.cardStagger }
            }
          >
            <Card className="t-card-lift h-full border border-default-200 bg-content1" shadow="none">
              <CardBody className="gap-2 p-5">
                <p className="font-display text-tiny font-semibold tabular-nums text-primary">
                  {item.step}
                </p>
                <p className="text-medium font-medium text-foreground">{item.title}</p>
                <p className="text-small leading-6 text-default-500">{item.body}</p>
              </CardBody>
            </Card>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
