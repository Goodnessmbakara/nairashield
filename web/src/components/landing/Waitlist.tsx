"use client";

import React from "react";
import { Button, Card, CardBody, Input } from "@heroui/react";
import { motion, useReducedMotion } from "framer-motion";
import {
  getWaitlistEntry,
  hasJoinedWaitlist,
  isValidEmail,
  joinWaitlist,
  submitWaitlistRemote,
} from "../../lib/waitlist";
import { ENTER_Y, SPRING } from "../../lib/motion";

export default function Waitlist() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"idle" | "loading" | "ok" | "exists">("idle");
  const [joinedEmail, setJoinedEmail] = React.useState<string | null>(null);
  const [shaking, setShaking] = React.useState(false);
  const reduce = useReducedMotion();

  React.useEffect(() => {
    if (hasJoinedWaitlist()) {
      const entry = getWaitlistEntry();
      if (entry) {
        setJoinedEmail(entry.email);
        setStatus("exists");
      }
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError("Enter a valid email.");
      if (!reduce) {
        setShaking(true);
        window.setTimeout(() => setShaking(false), 400);
      }
      return;
    }
    setStatus("loading");
    const result = joinWaitlist(email);
    await submitWaitlistRemote(email);
    setJoinedEmail(email.trim().toLowerCase());
    setStatus(result === "exists" ? "exists" : "ok");
  }

  const isDone = status === "ok" || status === "exists";

  return (
    <section className="section-pad mx-auto w-full max-w-6xl" id="waitlist">
      <div className="mx-auto mb-8 max-w-md text-center">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Get early access
        </h2>
        <p className="mt-2 text-small text-default-500">
          Leave your email. We will invite you when accounts open.
        </p>
      </div>

      <motion.div
        className="mx-auto max-w-md"
        initial={reduce ? false : { opacity: 0, y: ENTER_Y }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={reduce ? { duration: 0 } : SPRING.card}
      >
        <Card className="border-small border-default-200 bg-content1" shadow="none">
          <CardBody className="gap-3 p-5 sm:p-6">
            {isDone ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className="t-success-check text-success" data-state="in" aria-hidden>
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                    <path
                      d="M9 16.5L13.5 21L23 11.5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <p className="font-display text-medium font-semibold text-foreground">
                  {status === "exists" ? "You are already on the list" : "You are on the list"}
                </p>
                {joinedEmail && (
                  <p className="text-small text-default-500">
                    We will email{" "}
                    <span className="font-medium text-default-700">{joinedEmail}</span>
                  </p>
                )}
              </div>
            ) : (
              <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
                <div className="flex w-full flex-1 flex-col gap-1">
                  <Input
                    isRequired
                    aria-label="Email"
                    autoComplete="email"
                    className={shaking ? "t-input is-shaking" : "t-input"}
                    classNames={{
                      inputWrapper:
                        "border-small border-default-200 bg-content1 shadow-none h-11 transition-colors",
                    }}
                    isInvalid={!!error}
                    name="email"
                    placeholder="you@example.com"
                    radius="lg"
                    type="email"
                    value={email}
                    variant="bordered"
                    onValueChange={(v) => {
                      setEmail(v);
                      if (error) setError(null);
                    }}
                  />
                  {error && <p className="px-1 text-tiny text-danger">{error}</p>}
                </div>
                <Button
                  className="t-btn-press t-btn-primary h-11 shrink-0 bg-default-foreground font-medium text-background sm:min-w-[112px]"
                  isLoading={status === "loading"}
                  radius="lg"
                  type="submit"
                >
                  Join
                </Button>
              </form>
            )}
          </CardBody>
        </Card>
      </motion.div>
    </section>
  );
}
