"use client";

/**
 * Design ProMax authentication card - Google for new + returning users.
 * Google OAuth creates a session for first-time sign-up and sign-in alike.
 */

import React from "react";
import { Button, Link, cn } from "@heroui/react";
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
      subtitle = "Continue with Google to open your dashboard and run the agent",
      returnTo,
      error,
    },
    ref,
  ) => {
    const configured = isAgentConfigured();

    React.useEffect(() => {
      if (!configured) {
        console.warn("[auth] PUBLIC_AGENT_URL is not set — Google sign-in cannot reach the worker.");
      }
    }, [configured]);

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
              Sign-in isn’t available right now. Please try again shortly.
            </div>
          )}

          <Button
            className="t-btn-press t-btn-secondary w-full font-medium"
            isDisabled={!configured}
            radius="full"
            size="lg"
            startContent={<Icon icon="flat-color-icons:google" width={24} />}
            variant="bordered"
            onPress={onGoogle}
          >
            Continue with Google
          </Button>

          <p className="text-center text-tiny leading-5 text-default-400">
            We only use your Google account to identify you. No passwords stored here.
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
