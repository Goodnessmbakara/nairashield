"use client";

import React from "react";
import { HeroUIProvider, Spinner } from "@heroui/react";
import { exchangeCode, persistSession } from "../../lib/auth";

/** Completes Google OAuth handoff: one-time code → bearer session. */
export default function LoginCallback() {
  const [message, setMessage] = React.useState("Finishing sign-in…");

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const next = params.get("next") || "/dashboard";

    if (!code) {
      window.location.replace("/login?error=invalid_state");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { token, user } = await exchangeCode(code);
        if (cancelled) return;
        persistSession(token, user, true);
        const dest = next.startsWith("/") ? next : "/dashboard";
        window.location.replace(dest);
      } catch (e) {
        if (cancelled) return;
        setMessage((e as Error).message || "Sign-in failed");
        setTimeout(() => {
          window.location.replace(
            `/login?error=${encodeURIComponent((e as Error).message || "exchange_failed")}`,
          );
        }, 1200);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <HeroUIProvider>
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background">
        <Spinner color="primary" size="lg" />
        <p className="text-small text-default-500">{message}</p>
      </div>
    </HeroUIProvider>
  );
}
