"use client";

import { useAuth } from "./useAuth";

/** Landing CTAs: Sign in when logged out, Explore → dashboard when signed in. */
export function useAuthCta(signedOutLabel = "Sign in") {
  const { isAuthenticated, loading } = useAuth();

  if (isAuthenticated) {
    return {
      href: "/dashboard",
      label: "Explore",
      isAuthenticated: true as const,
      loading,
    };
  }

  return {
    href: "/login",
    label: signedOutLabel,
    isAuthenticated: false as const,
    loading,
  };
}
