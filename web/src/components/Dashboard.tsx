"use client";

import React from "react";
import {
  HeroUIProvider,
  Button,
  Card,
  CardBody,
  Chip,
  cn,
  useDisclosure,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import DecisionFeed from "./DecisionFeed";
import PortfolioView from "./dashboard/PortfolioView";
import ProofsView from "./dashboard/ProofsView";
import ReplaysView from "./dashboard/ReplaysView";
import WatchingPanel from "./dashboard/WatchingPanel";
import GateCard from "./ui/GateCard";
import AuthCard from "./auth/AuthCard";
import DashboardSidebar from "./dashboard/DashboardSidebar";
import SidebarDrawer from "./dashboard/SidebarDrawer";
import LogoutConfirmModal from "./dashboard/LogoutConfirmModal";
import { dashboardNav, type DashboardView } from "./dashboard/sidebar-items";
import { dedupeTicksForFeed, displayAgentReason, isIdleHold } from "../lib/ticks";
import { useAgent } from "../hooks/useAgent";
import { useAuth } from "../hooks/useAuth";

const SIDEBAR_KEY = "ns_sidebar_compact";
const VIEW_KEY = "ns_dashboard_view";

const VIEW_TITLES: Record<DashboardView, string> = {
  overview: "Agent",
  decisions: "History",
  proofs: "Proofs",
  replays: "Replays",
  portfolio: "Portfolio",
};

function isDashboardView(v: string): v is DashboardView {
  return dashboardNav.some((item) => item.key === v);
}

export default function Dashboard() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const {
    ticks,
    error,
    loading,
    poll,
    configured,
    needsAuth,
    lastSyncedAt,
    liveFlashId,
    liveReason,
    agentStatus,
  } = useAgent({
    enabled: isAuthenticated,
  });

  const [isCompact, setIsCompact] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [view, setView] = React.useState<DashboardView>("overview");
  const [, setClock] = React.useState(0);
  const didAutoCheck = React.useRef(false);
  const {
    isOpen: logoutOpen,
    onOpen: openLogout,
    onOpenChange: onLogoutOpenChange,
  } = useDisclosure();

  React.useEffect(() => {
    const id = window.setInterval(() => setClock((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === "1") setIsCompact(true);
      const stored = localStorage.getItem(VIEW_KEY);
      if (stored && isDashboardView(stored)) setView(stored);
    } catch {
      /* ignore */
    }
  }, []);

  // One auto check on enter — core demo path lights up without hunting
  React.useEffect(() => {
    if (!isAuthenticated || !configured || didAutoCheck.current) return;
    didAutoCheck.current = true;
    void poll();
  }, [isAuthenticated, configured, poll]);

  const toggleCompact = React.useCallback(() => {
    setIsCompact((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const changeView = React.useCallback((next: DashboardView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const feedTicks = dedupeTicksForFeed(ticks);
  const connected = configured && isAuthenticated;
  const latest = feedTicks[0] ?? ticks[0];

  const rawReason =
    latest?.decision?.reason ??
    liveReason?.reason ??
    agentStatus?.lastTick?.projection?.decision?.reason ??
    agentStatus?.currentStatus?.reason ??
    "";
  const reason = displayAgentReason(rawReason);
  const action =
    latest?.decision?.action ??
    liveReason?.action ??
    agentStatus?.lastTick?.projection?.decision?.action ??
    agentStatus?.currentStatus?.action ??
    "HOLD";
  const isTrade = action === "TRADE";
  const market = latest?.market ?? agentStatus?.lastTick?.market;
  const matchName =
    market?.match ||
    (market?.p1 ? `${market.p1} vs ${market.p2 ?? "?"}` : null) ||
    "Waiting for TxLINE fixture";
  const odds = market?.odds ? Object.entries(market.odds) : [];
  const movement = latest?.movement ?? [];
  const yieldApy =
    agentStatus?.liveApy ??
    agentStatus?.position?.apy ??
    agentStatus?.config?.yieldApy ??
    0.08;

  if (authLoading) {
    return (
      <HeroUIProvider>
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <p className="text-small text-default-500">Checking session…</p>
        </div>
      </HeroUIProvider>
    );
  }

  if (!isAuthenticated || needsAuth) {
    return (
      <HeroUIProvider>
        <div className="min-h-dvh bg-background py-16">
          <AuthCard
            returnTo={
              typeof window !== "undefined"
                ? `${window.location.origin}/dashboard`
                : undefined
            }
            subtitle="Sign in to run the live agent on TxLINE odds"
            title="Open the agent"
          />
        </div>
      </HeroUIProvider>
    );
  }

  const sidebarProps = {
    activeView: view,
    onViewChange: changeView,
    user,
    onLogout: openLogout,
    onToggleCompact: toggleCompact,
  };

  const setupReason = latest?.decision?.reason;
  const needsSetup =
    Boolean(setupReason) &&
    !/not in-play|no match is in play|no live odds|keep capital in|stays? in yield|next fixture|no live kamino/i.test(
      setupReason!,
    ) &&
    /not configured|not wired|missing |unavailable|credential|api key|failed to|couldn.?t (reach|load|fetch)/i.test(
      setupReason!,
    );

  /** THE product moment — one card: decide on live odds */
  const decisionHero = (
    <Card
      className={cn(
        "border bg-content1 dark:border-default-100",
        isTrade ? "border-success-200" : "border-transparent",
        liveFlashId && latest && liveFlashId === latest.id
          ? "shadow-[0_0_0_1px_rgba(23,201,100,0.35)]"
          : "",
      )}
    >
      <CardBody className="gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-tiny font-medium uppercase tracking-wide text-default-500">
              Agent decision
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip
                classNames={{ content: "text-sm font-semibold px-1" }}
                color={isTrade ? "success" : "default"}
                radius="sm"
                size="lg"
                variant="flat"
              >
                {isTrade ? "TRADE" : "HOLD"}
              </Chip>
              <span className="text-tiny tabular-nums text-default-400">
                {latest?.receivedAt ||
                  (liveReason?.at
                    ? new Date(liveReason.at).toLocaleTimeString()
                    : loading
                      ? "checking…"
                      : "—")}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-tiny text-default-400">Yield bar</p>
            <p className="font-display text-medium font-semibold tabular-nums text-foreground">
              {(yieldApy * 100).toFixed(2)}% APY
            </p>
            <p className="text-[0.65rem] text-default-400">
              leave yield only if Y_net clears edge
            </p>
          </div>
        </div>

        <p className="text-medium leading-7 text-foreground sm:text-large">{reason || "Run a check to load the latest decision from live TxLINE odds."}</p>

        <div className="rounded-medium border border-default-100 bg-content2 px-4 py-3">
          <p className="text-tiny text-default-500">Market</p>
          <p className="mt-0.5 text-medium font-semibold text-foreground">{matchName}</p>
          {market?.matchId && (
            <p className="mt-1 font-mono text-[0.65rem] text-default-400">
              fixture · {market.matchId}
              {market.status ? ` · ${market.status}` : ""}
            </p>
          )}
        </div>

        {odds.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {odds.map(([k, v]) => (
              <div
                key={k}
                className="flex flex-col items-center rounded-medium border border-default-100 bg-content2 px-2 py-3"
              >
                <span className="text-[0.65rem] uppercase text-default-400">{k}</span>
                <span className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
                  {Number(v).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-tiny text-default-400">
            Odds appear here when TxLINE returns a usable snapshot for the active fixture.
          </p>
        )}

        {movement.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-tiny font-medium text-default-500">Sharp movement (&gt;3%)</p>
            {movement.map((m) => (
              <div
                key={m.outcome}
                className="flex items-center justify-between rounded-medium border border-default-100 bg-content2 px-3 py-2"
              >
                <span className="text-small text-foreground">{m.outcome}</span>
                <span className="text-tiny tabular-nums text-default-500">
                  {m.fromOdds} → {m.toOdds}{" "}
                  <span className={m.direction === "shortening" ? "text-success" : ""}>
                    ({m.changePct > 0 ? "+" : ""}
                    {Math.round(m.changePct * 1000) / 10}%)
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-default-100 pt-3">
          <Button
            className="bg-default-foreground font-medium text-background"
            isLoading={loading}
            radius="full"
            size="sm"
            startContent={!loading ? <Icon icon="solar:play-linear" width={14} /> : undefined}
            onPress={() => poll()}
          >
            Run check
          </Button>
          <span className="text-tiny text-default-400">
            Same loop as the minute cron — TxLINE in, decide, hold or trade.
          </span>
        </div>
      </CardBody>
    </Card>
  );

  return (
    <HeroUIProvider>
      <LogoutConfirmModal
        email={user?.email}
        isOpen={logoutOpen}
        onConfirm={() => logout()}
        onOpenChange={onLogoutOpenChange}
      />

      <div className="flex h-dvh w-full overflow-hidden bg-background">
        <aside
          className={cn(
            "hidden h-dvh shrink-0 border-r border-divider bg-content1 transition-[width] duration-200 ease-out sm:flex sm:flex-col",
            isCompact ? "w-[4.5rem]" : "w-72",
          )}
        >
          <DashboardSidebar
            {...sidebarProps}
            isCompact={isCompact}
            onNavigate={() => setMobileOpen(false)}
          />
        </aside>

        {mobileOpen ? (
          <SidebarDrawer isOpen onOpenChange={setMobileOpen}>
            <DashboardSidebar
              {...sidebarProps}
              hideCollapse
              isCompact={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </SidebarDrawer>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-divider bg-content1 px-4 sm:px-6">
            <Button
              isIconOnly
              aria-label="Open menu"
              className="sm:hidden"
              radius="full"
              size="sm"
              variant="flat"
              onPress={() => setMobileOpen(true)}
            >
              <Icon icon="solar:hamburger-menu-linear" width={20} />
            </Button>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="font-display truncate text-small font-semibold text-foreground">
                {VIEW_TITLES[view]}
              </span>
              <Chip
                classNames={{ content: "font-medium text-[0.65rem]" }}
                color={connected ? "success" : "warning"}
                radius="sm"
                size="sm"
                variant="flat"
              >
                {connected ? "Live" : "Offline"}
              </Chip>
              {connected && lastSyncedAt != null && (
                <span className="hidden text-tiny tabular-nums text-default-400 sm:inline">
                  {Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000)) < 5
                    ? "just now"
                    : `${Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))}s ago`}
                </span>
              )}
            </div>

            <Button
              className="t-btn-press t-btn-primary bg-default-foreground font-medium text-background"
              isDisabled={!configured}
              isLoading={loading}
              radius="full"
              size="sm"
              startContent={!loading && <Icon icon="solar:play-linear" width={14} />}
              onPress={() => poll()}
            >
              Run check
            </Button>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
              {(error || needsSetup) && (
                <div className="mb-4 flex max-w-2xl flex-col gap-3">
                  {error && (
                    <GateCard
                      actionIcon="solar:refresh-linear"
                      actionLabel={configured ? "Try again" : undefined}
                      description={error}
                      icon="solar:danger-triangle-bold"
                      isActionLoading={loading}
                      onAction={configured ? () => poll() : undefined}
                      title="Could not run the check"
                      tone="danger"
                    />
                  )}
                  {needsSetup && (
                    <GateCard
                      description={setupReason}
                      icon="solar:plug-circle-linear"
                      title="Agent needs setup"
                      tone="warning"
                    />
                  )}
                </div>
              )}

              {view === "overview" && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                    <div className="lg:col-span-3">{decisionHero}</div>
                    <div className="lg:col-span-2">
                      <WatchingPanel />
                    </div>
                  </div>
                  <DecisionFeed
                    error={null}
                    lastSyncedAt={lastSyncedAt}
                    liveFlashId={liveFlashId}
                    liveReason={liveReason}
                    loading={loading}
                    ticks={ticks}
                  />
                </div>
              )}

              {view === "decisions" && (
                <DecisionFeed
                  error={error}
                  lastSyncedAt={lastSyncedAt}
                  liveFlashId={liveFlashId}
                  liveReason={liveReason}
                  loading={loading}
                  ticks={ticks}
                  onOpenProofs={() => changeView("proofs")}
                />
              )}

              {view === "proofs" && <ProofsView ticks={ticks} />}
              {view === "replays" && <ReplaysView />}
              {view === "portfolio" && <PortfolioView />}
            </div>
          </main>
        </div>
      </div>
    </HeroUIProvider>
  );
}
