"use client";

import React from "react";
import { Button, Link } from "@heroui/react";
import { motion, useReducedMotion } from "framer-motion";
import { ENTER_Y, SPRING } from "../../lib/motion";

/** Support strip - panel-style entrance (transitions + framer). */
export default function NeedHelp() {
  const reduce = useReducedMotion();

  return (
    <section className="section-pad mx-auto w-full max-w-6xl pb-20 pt-4 sm:pb-24" id="help">
      <motion.div
        className="flex flex-col items-start justify-between gap-6 border border-default-200 bg-content1 px-6 py-8 sm:flex-row sm:items-center sm:px-8"
        initial={reduce ? false : { opacity: 0, y: ENTER_Y + 8, filter: "blur(2px)" }}
        whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        viewport={{ once: true, amount: 0.25 }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 260, damping: 28, mass: 0.9 }
        }
      >
        <div className="max-w-md">
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Need help?
          </h2>
          <p className="mt-2 text-small leading-6 text-default-500">
            Questions about funding, markets, or how the agent decides. Sign in and we will pick it
            up from there.
          </p>
        </div>
        <Button
          as={Link}
          className="t-btn-press t-btn-primary shrink-0 bg-default-foreground font-medium text-background"
          href="/login"
          radius="full"
        >
          Get support
        </Button>
      </motion.div>
    </section>
  );
}
