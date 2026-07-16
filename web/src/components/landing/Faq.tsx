"use client";

import React from "react";
import { Accordion, AccordionItem } from "@heroui/react";
import { faqs } from "../../data/landing";
import FadeIn from "../ui/FadeIn";

export default function Faq() {
  return (
    <section className="section-pad mx-auto w-full max-w-3xl" id="faq">
      <FadeIn className="flex w-full flex-col items-center gap-8">
        <h2 className="font-display text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          FAQ
        </h2>
        <Accordion
          fullWidth
          keepContentMounted
          itemClasses={{
            base: "border-b border-default-100 px-0 last:border-b-0",
            title: "font-medium text-left text-foreground",
            trigger:
              "py-5 flex-row-reverse transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-80",
            content: "pt-0 pb-5 text-small leading-6 text-default-500",
            indicator:
              "text-default-400 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] rotate-0 data-[open=true]:-rotate-45",
          }}
          selectionMode="multiple"
          variant="light"
        >
          {faqs.map((item, i) => (
            <AccordionItem key={i} aria-label={item.title} title={item.title}>
              {item.content}
            </AccordionItem>
          ))}
        </Accordion>
      </FadeIn>
    </section>
  );
}
