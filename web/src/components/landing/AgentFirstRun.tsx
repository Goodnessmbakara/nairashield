"use client";

/**
 * First agent interaction walkthrough — what a user sees across the loop.
 * Illustrative product chrome only; no invented balances, odds, or fills.
 */

import React from "react";
import { Button, Chip, Link } from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { steps, type Step } from "../../data/landing";
import { ENTER_Y, SPRING, TIMING } from "../../lib/motion";
import FadeIn from "../ui/FadeIn";

function StagePanel({ step }: { step: Step }) {
  switch (step.panel) {
    case "deposit":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-tiny text-default-500">Portfolio · deposit</p>
          <div className="rounded-medium border border-dashed border-default-300 bg-default-50 px-3 py-3">
            <p className="text-tiny text-default-500">Your Solana USDC address</p>
            <p className="mt-1 font-mono text-small tracking-wide text-default-600">
              ···· ···· ···· (shown after you connect)
            </p>
          </div>
          <p className="text-tiny text-default-500">Send USDC on Solana — credited when confirmed.</p>
        </div>
      );
    case "yield":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-tiny text-default-500">Overview · kept earning</p>
          <div className="flex items-end justify-between gap-3 rounded-medium border border-default-200 bg-default-50 px-3 py-3">
            <div>
              <p className="text-tiny text-default-500">Idle capital</p>
              <p className="font-display text-xl font-semibold text-foreground">In Kamino</p>
            </div>
            <Chip radius="sm" size="sm" variant="flat">
              Live APY
            </Chip>
          </div>
          <p className="text-tiny text-default-500">Waiting still earns. Trading is the exception.</p>
        </div>
      );
    case "watching":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-tiny text-default-500">Watching · TxLINE fixtures</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-medium border border-default-200 bg-default-50 px-3 py-2.5">
              <span className="text-small text-foreground">Upcoming match</span>
              <Chip color="warning" radius="sm" size="sm" variant="flat">
                Scheduled
              </Chip>
            </div>
            <div className="flex items-center justify-between rounded-medium border border-default-200 bg-default-50 px-3 py-2.5">
              <span className="text-small text-foreground">In-play window</span>
              <Chip radius="sm" size="sm" variant="flat">
                Agent checks
              </Chip>
            </div>
          </div>
        </div>
      );
    case "decision":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-tiny text-default-500">Agent activity · current status</p>
          <div className="rounded-medium border border-default-200 bg-default-50 px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip radius="sm" size="sm" variant="flat">
                Keep earning
              </Chip>
              <span className="text-tiny text-default-400">or</span>
              <Chip color="success" radius="sm" size="sm" variant="flat">
                Take opportunity
              </Chip>
            </div>
            <p className="mt-2 text-tiny leading-5 text-default-500">
              One status for idle checks — not a spam log of every minute.
            </p>
          </div>
        </div>
      );
    case "settle":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-tiny text-default-500">After the play</p>
          <div className="flex items-center gap-3 rounded-medium border border-default-200 bg-default-50 px-3 py-3">
            <Icon className="text-default-500" icon="solar:restart-linear" width={20} />
            <div>
              <p className="text-small font-medium text-foreground">Back to yield</p>
              <p className="text-tiny text-default-500">Settled capital returns to Kamino.</p>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export default function AgentFirstRun() {
  const reduce = useReducedMotion();
  const [active, setActive] = React.useState(0);
  const step = steps[active] ?? steps[0];

  return (
    <section className="section-pad mx-auto w-full max-w-6xl" id="how">
      <FadeIn className="mb-8 max-w-2xl sm:mb-10">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Your first agent run
        </h2>
        <p className="mt-3 max-w-xl text-small leading-6 text-default-500">
          Fund once. Capital earns by default. The agent watches live markets, holds unless the math
          clears, then returns funds to yield.
        </p>
      </FadeIn>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:gap-8">
        <ol className="flex flex-col gap-1 lg:col-span-2">
          {steps.map((item, i) => {
            const selected = i === active;
            return (
              <li key={item.step}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-medium px-3 py-3 text-left transition-colors ${
                    selected
                      ? "bg-content1 text-foreground"
                      : "text-default-500 hover:bg-content1/60 hover:text-foreground"
                  }`}
                  onClick={() => setActive(i)}
                >
                  <span
                    className={`font-display mt-0.5 text-tiny font-semibold tabular-nums ${
                      selected ? "text-primary" : "text-default-400"
                    }`}
                  >
                    {item.step}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-small font-medium">{item.title}</span>
                    {selected && (
                      <span className="mt-1 block text-tiny leading-5 text-default-500">
                        {item.body}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <motion.div
          className="flex flex-col gap-4 border border-default-200 bg-content1 p-5 sm:p-6 lg:col-span-3"
          initial={reduce ? false : { opacity: 0, y: ENTER_Y }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={reduce ? { duration: 0 } : { ...SPRING.card, delay: TIMING.section }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={step.step}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={reduce ? { duration: 0 } : SPRING.snappy}
              className="flex flex-col gap-4"
            >
              <div>
                <p className="font-display text-tiny font-semibold tabular-nums text-primary">
                  {step.step}
                </p>
                <h3 className="mt-1 text-medium font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-small leading-6 text-default-500">{step.uiCaption}</p>
              </div>
              <StagePanel step={step} />
            </motion.div>
          </AnimatePresence>

          <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-default-100 pt-4">
            <Button
              className="t-btn-press"
              isDisabled={active === 0}
              radius="full"
              size="sm"
              variant="flat"
              onPress={() => setActive((i) => Math.max(0, i - 1))}
            >
              Back
            </Button>
            {active < steps.length - 1 ? (
              <Button
                className="t-btn-press t-btn-primary bg-default-foreground text-background"
                radius="full"
                size="sm"
                onPress={() => setActive((i) => Math.min(steps.length - 1, i + 1))}
              >
                Next step
              </Button>
            ) : (
              <Button
                as={Link}
                className="t-btn-press t-btn-primary bg-default-foreground text-background"
                href="/login"
                radius="full"
                size="sm"
              >
                Get started
              </Button>
            )}
            <p className="text-tiny text-default-400">
              {active + 1} / {steps.length}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
