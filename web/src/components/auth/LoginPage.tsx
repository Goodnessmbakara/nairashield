"use client";

import React from "react";
import { HeroUIProvider } from "@heroui/react";
import AuthCard from "./AuthCard";

function mapError(code: string | null): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    access_denied: "Google sign-in was cancelled.",
    invalid_state: "Sign-in expired. Try again.",
    token_exchange: "Couldn’t finish signing you in. Try again.",
    no_access_token: "Google didn’t complete the sign-in. Try again.",
    userinfo: "Couldn’t load your Google profile.",
    incomplete_profile: "Your Google account didn’t share an email address.",
    auth_not_configured: "Sign-in isn’t available right now.",
  };
  // Raw code goes to the console for debugging, never to the person signing in.
  if (!map[code]) console.warn(`[auth] unmapped sign-in error: ${code}`);

  return map[code] || "Something went wrong signing you in. Try again.";
}

export default function LoginPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [returnTo, setReturnTo] = React.useState<string | undefined>();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setError(mapError(params.get("error")));
    const next = params.get("next");
    if (next?.startsWith("/")) {
      setReturnTo(`${window.location.origin}${next}`);
    }
  }, []);

  return (
    <HeroUIProvider>
      <div className="flex min-h-dvh w-full items-center justify-center bg-background py-12">
        <AuthCard error={error} returnTo={returnTo} />
      </div>
    </HeroUIProvider>
  );
}
