"use client";

import React from "react";
import { Chip, cn } from "@heroui/react";
import { motion, useReducedMotion } from "framer-motion";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  align?: "center" | "left";
};

/** Hierarchy: eyebrow chip → display title → body. Spring entrance. */
const SectionHeading = React.forwardRef<HTMLDivElement, SectionHeadingProps>(
  ({ eyebrow, title, description, className, align = "center" }, ref) => {
    const reduce = useReducedMotion();

    return (
      <motion.div
        ref={ref}
        className={cn(
          "flex max-w-2xl flex-col gap-3",
          align === "center" && "mx-auto items-center text-center",
          align === "left" && "items-start text-left",
          className,
        )}
        initial={reduce ? false : { opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
      >
        {eyebrow && (
          <Chip color="primary" radius="sm" size="sm" variant="flat">
            {eyebrow}
          </Chip>
        )}
        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {title}
        </h2>
        {description && (
          <p className="max-w-xl text-base leading-7 text-default-500">{description}</p>
        )}
      </motion.div>
    );
  },
);
SectionHeading.displayName = "SectionHeading";

export default SectionHeading;
