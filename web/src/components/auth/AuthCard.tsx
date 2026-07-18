"use client";

/**
 * AuthCard — email/password (sign in + sign up) + Google OAuth.
 * Tabs switch between the two modes. No page reload needed.
 */

import React from "react";
import { Button, Input, Link, Tab, Tabs, cn } from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  emailSignIn,
  emailRegister,
  googleSignInUrl,
  isAgentConfigured,
  persistSession,
} from "../../lib/auth";
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
      title = "Join Edgeora",
      subtitle = "Sign in to open your dashboard and run the agent",
      returnTo,
      error: externalError,
    },
    ref,
  ) => {
    const configured = isAgentConfigured();

    const [mode, setMode] = React.useState<"signin" | "signup">("signin");
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [name, setName] = React.useState("");
    const [showPw, setShowPw] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
      if (!configured) {
        console.warn("[auth] PUBLIC_AGENT_URL is not set — sign-in cannot reach the worker.");
      }
    }, [configured]);

    const onGoogle = () => {
      if (!configured) return;
      window.location.href = googleSignInUrl(returnTo);
    };

    const redirectAfterAuth = () => {
      const dest = returnTo || `${window.location.origin}/dashboard`;
      window.location.href = dest;
    };

    const onSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!configured || loading) return;
      setLoading(true);
      setError(null);
      try {
        const result =
          mode === "signin"
            ? await emailSignIn(email, password)
            : await emailRegister(email, password, name);
        persistSession(result.token, result.user, true);
        redirectAfterAuth();
      } catch (err) {
        setError((err as Error).message || "Something went wrong. Try again.");
      } finally {
        setLoading(false);
      }
    };

    const displayError = error || externalError;

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
          {displayError && (
            <div className="rounded-medium border border-danger-100 bg-danger-50/60 px-3 py-2 text-tiny text-danger-600">
              {displayError}
            </div>
          )}

          {!configured && (
            <div className="rounded-medium border border-warning-100 bg-warning-50/60 px-3 py-2 text-tiny text-default-600">
              Sign-in isn't available right now. Please try again shortly.
            </div>
          )}

          {/* Mode tabs */}
          <Tabs
            fullWidth
            aria-label="Sign in or sign up"
            selectedKey={mode}
            onSelectionChange={(k) => {
              setMode(k as "signin" | "signup");
              setError(null);
            }}
          >
            <Tab key="signin" title="Sign in" />
            <Tab key="signup" title="Create account" />
          </Tabs>

          {/* Email/password form */}
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            {mode === "signup" && (
              <Input
                isRequired
                label="Name"
                placeholder="Your name"
                type="text"
                value={name}
                isDisabled={loading || !configured}
                onValueChange={setName}
                startContent={<Icon icon="solar:user-linear" className="text-default-400" width={18} />}
              />
            )}

            <Input
              isRequired
              label="Email"
              placeholder="you@example.com"
              type="email"
              value={email}
              isDisabled={loading || !configured}
              onValueChange={setEmail}
              startContent={<Icon icon="solar:letter-linear" className="text-default-400" width={18} />}
            />

            <Input
              isRequired
              label="Password"
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              type={showPw ? "text" : "password"}
              value={password}
              isDisabled={loading || !configured}
              onValueChange={setPassword}
              startContent={<Icon icon="solar:lock-linear" className="text-default-400" width={18} />}
              endContent={
                <button
                  type="button"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="text-default-400 hover:text-default-600"
                  onClick={() => setShowPw((v) => !v)}
                >
                  <Icon icon={showPw ? "solar:eye-closed-linear" : "solar:eye-linear"} width={18} />
                </button>
              }
            />

            <Button
              type="submit"
              className="w-full font-medium"
              color="primary"
              radius="full"
              size="lg"
              isLoading={loading}
              isDisabled={!configured || loading}
            >
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-divider" />
            <span className="text-tiny text-default-400">or</span>
            <div className="h-px flex-1 bg-divider" />
          </div>

          {/* Google button */}
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
