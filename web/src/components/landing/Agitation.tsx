"use client";

import React from "react";
import { Card, CardBody } from "@heroui/react";
import { motion, useReducedMotion } from "framer-motion";
import { agitation } from "../../data/landing";
import { ENTER_Y, SPRING, TIMING } from "../../lib/motion";
import FadeIn from "../ui/FadeIn";

export default function Agitation() {
  const reduce = useReducedMotion();

  return (
    <section className="section-pad mx-auto w-full max-w-6xl" id="cost">
      <FadeIn className="mb-8 max-w-2xl">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {agitation.title}
        </h2>
      </FadeIn>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {agitation.points.map((point, i) => (
          <motion.div
            key={point.title}
            initial={reduce ? false : { opacity: 0, y: ENTER_Y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={
              reduce
                ? { duration: 0 }
                : { ...SPRING.card, delay: TIMING.section + i * TIMING.cardStagger }
            }
          >
            <Card className="t-card-lift h-full border border-default-200 bg-content1" shadow="none">
              <CardBody className="gap-2 p-5">
                <p className="font-display text-tiny font-semibold tabular-nums text-default-400">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="text-medium font-medium text-foreground">{point.title}</p>
                <p className="text-small leading-6 text-default-500">{point.body}</p>
              </CardBody>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
