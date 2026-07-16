"use client";

/* Solution (PAS step 3) - h2 + body + CTA, no eyebrow label */

import React from "react";
import { Button, Link } from "@heroui/react";
import { solution } from "../../data/landing";
import FadeIn from "../ui/FadeIn";

export default function Solution() {
  return (
    <section className="section-pad mx-auto w-full max-w-6xl pt-4 sm:pt-6" id="solution">
      <FadeIn className="border border-default-200 bg-content1 px-6 py-10 sm:px-10 sm:py-12">
        <h2 className="max-w-3xl font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {solution.title}
        </h2>
        <p className="mt-4 max-w-2xl text-small leading-7 text-default-500 sm:text-base">
          {solution.body}
        </p>
        <div className="mt-6">
          <Button
            as={Link}
            className="t-btn-press t-btn-primary bg-default-foreground font-medium text-background"
            href="/login"
            radius="full"
          >
            Get started
          </Button>
        </div>
      </FadeIn>
    </section>
  );
}
