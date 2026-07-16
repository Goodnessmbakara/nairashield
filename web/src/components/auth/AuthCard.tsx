"use client";

/**
 * Design ProMax authentication card - Google for new + returning users.
 * Google OAuth creates a session for first-time sign-up and sign-in alike.
 */

import React from "react";
import { Button, Divider, Link, cn } from "@heroui/react";
import { Icon } from "@iconify/react";
import { googleSignInUrl, isAgentConfigured } from "../../lib/auth";
import BrandMark from "../ui/BrandMark";

type AuthCardProps = {
  className?: string;
  title?: string;
  subtitle?: string;
  returnTo?: string;
  error?: string | null;
};

const AuthCard = React.forwardRef<HTMLDivElement, AuthCardProps>(
  (
    {
      className,
      title = "Join NairaShield",
      subtitle = "Sign up or sign in with Google to open your dashboard and run the agent",
      returnTo,
      error,
    },
    ref,
  ) => {
    const configured = isAgentConfigured();

    const onGoogle = () => {
      if (!configured) return;
      window.location.href = googleSignInUrl(returnTo);
    };

    return (
      <div
        ref={ref}
        className={cn("flex h-full w-full flex-col items-center justify-center px-4", className)}
      >
        <div className="flex flex-col items-center pb-6">
          <BrandMark className="mb-3" size="lg" />
          <p className="font-display text-xl font-semibold tracking-tight text-foreground">
            {title}
          </p>
          <p className="mt-1 max-w-xs text-center text-small text-default-500">{subtitle}</p>
        </div>

        <div className="mt-2 flex w-full max-w-sm flex-col gap-4 rounded-large bg-content1 px-8 py-6 shadow-small">
          {error && (
            <div className="rounded-medium border border-danger-100 bg-danger-50/60 px-3 py-2 text-tiny text-danger-600">
              {error}
            </div>
          )}

          {!configured && (
            <div className="rounded-medium border border-warning-100 bg-warning-50/60 px-3 py-2 text-tiny text-default-600">
              Set <code className="font-medium">PUBLIC_AGENT_URL</code> so Google auth can reach the
              worker.
            </div>
          )}

          <Button
            className="t-btn-press t-btn-secondary w-full font-medium"
            isDisabled={!configured}
            size="lg"
            startContent={<Icon icon="flat-color-icons:google" width={24} />}
            variant="bordered"
            onPress={onGoogle}
          >
            Continue with Google
          </Button>

          <p className="text-center text-tiny leading-5 text-default-500">
            New here? That creates your account. Already have one? You sign in the same way.
          </p>

          <div className="flex items-center gap-4">
            <Divider className="flex-1" />
            <p className="shrink-0 text-tiny text-default-500">sign up · sign in</p>
            <Divider className="flex-1" />
          </div>

          <p className="text-center text-tiny leading-5 text-default-400">
            We only use your Google account to identify you. Your agent runs on Cloudflare Workers
            with a signed session. No passwords stored here.
          </p>

          <p className="text-center text-small text-default-500">
            Back to{" "}
            <Link href="/" size="sm">
              home
            </Link>
          </p>
        </div>
      </div>
    );
  },
);
AuthCard.displayName = "AuthCard";

export default AuthCard;
