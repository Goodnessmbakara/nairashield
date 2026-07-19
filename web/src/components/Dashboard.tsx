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
import { TeamFlag, flagUrl } from "../lib/flags";
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

  /** THE product moment — color-coded decision on live odds */
  const decisionHero = (
    <Card
      className={cn(
        "overflow-hidden border-2 bg-content1 shadow-sm",
        isTrade
          ? "border-warning-300 shadow-warning-100/80"
          : "border-primary-200 shadow-primary-100/60",
        liveFlashId && latest && liveFlashId === latest.id
          ? "ring-2 ring-primary-300 ring-offset-2"
          : "",
      )}
    >
      <div
        className={cn(
          "h-1.5 w-full",
          isTrade
            ? "bg-gradient-to-r from-warning-400 via-warning-500 to-warning-600"
            : "bg-gradient-to-r from-primary-400 via-primary-500 to-secondary-500",
        )}
      />
      <CardBody className="gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-tiny font-semibold uppercase tracking-wide text-primary">
              Agent decision
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip
                classNames={{
                  base: isTrade ? "bg-warning-100" : "bg-success-100",
                  content: "text-sm font-bold px-1",
                }}
                color={isTrade ? "warning" : "success"}
                radius="sm"
                size="lg"
                variant="flat"
              >
                {isTrade ? "TRADE" : "HOLD"}
              </Chip>
              <Chip color="primary" radius="sm" size="sm" variant="dot">
                TxLINE
              </Chip>
              <span className="text-tiny tabular-nums text-default-500">
                {latest?.receivedAt ||
                  (liveReason?.at
                    ? new Date(liveReason.at).toLocaleTimeString()
                    : loading
                      ? "checking…"
                      : "—")}
              </span>
            </div>
          </div>
          <div className="rounded-large bg-success-50 px-3 py-2 text-right ring-1 ring-success-100">
            <p className="text-tiny font-medium text-success-700">Yield bar</p>
            <p className="font-display text-medium font-semibold tabular-nums text-success-700">
              {(yieldApy * 100).toFixed(2)}% APY
            </p>
            <p className="text-[0.65rem] text-success-600/80">
              leave yield only if edge clears
            </p>
          </div>
        </div>

        <p className="text-medium leading-7 text-foreground sm:text-large">
          {reason || "Run a check to load the latest decision from live TxLINE odds."}
        </p>

        <div className="rounded-medium border border-primary-100 bg-primary-50/60 px-4 py-3">
          <p className="text-tiny font-medium text-primary-600">Market</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {market?.p1 && <TeamFlag name={market.p1} width={24} height={17} />}
            {!market?.p1 && flagUrl(matchName.split(/\s+vs\s+/i)[0]) && (
              <TeamFlag name={matchName.split(/\s+vs\s+/i)[0]!} width={24} height={17} />
            )}
            <p className="text-medium font-semibold text-foreground">{matchName}</p>
            {market?.p2 && <TeamFlag name={market.p2} width={24} height={17} />}
            {!market?.p2 && flagUrl(matchName.split(/\s+vs\s+/i)[1]) && (
              <TeamFlag name={matchName.split(/\s+vs\s+/i)[1]!} width={24} height={17} />
            )}
          </div>
          {market?.matchId && (
            <p className="mt-1 font-mono text-[0.65rem] text-primary-500/80">
              fixture · {market.matchId}
              {market.status ? ` · ${market.status}` : ""}
            </p>
          )}
        </div>

        {odds.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {odds.map(([k, v], i) => {
              const tones = [
                "border-primary-200 bg-primary-50",
                "border-secondary-200 bg-secondary-50",
                "border-warning-200 bg-warning-50",
              ];
              const textTones = ["text-primary-700", "text-secondary-700", "text-warning-700"];
              const isDraw = /^draw|x$/i.test(k);
              return (
                <div
                  key={k}
                  className={cn(
                    "flex flex-col items-center rounded-medium border px-2 py-3",
                    tones[i % 3],
                  )}
                >
                  {isDraw ? (
                    <span className="flex h-5 w-7 items-center justify-center rounded-[2px] bg-secondary-200 text-[0.55rem] font-bold text-secondary-800">
                      X
                    </span>
                  ) : (
                    <TeamFlag name={k} width={28} height={20} />
                  )}
                  <span
                    className={cn(
                      "mt-1.5 text-[0.65rem] font-medium uppercase",
                      textTones[i % 3],
                    )}
                  >
                    {k}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 font-mono text-xl font-semibold tabular-nums",
                      textTones[i % 3],
                    )}
                  >
                    {Number(v).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-tiny text-default-500">
            Odds appear here when TxLINE returns a usable snapshot for the active fixture.
          </p>
        )}

        {movement.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-tiny font-semibold text-warning-700">Sharp movement (&gt;3%)</p>
            {movement.map((m) => (
              <div
                key={m.outcome}
                className="flex items-center justify-between rounded-medium border border-warning-100 bg-warning-50 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-small font-medium text-foreground">
                  <TeamFlag name={m.outcome} width={20} height={14} />
                  {m.outcome}
                </span>
                <span className="text-tiny tabular-nums text-default-600">
                  {m.fromOdds} → {m.toOdds}{" "}
                  <span
                    className={
                      m.direction === "shortening" ? "font-semibold text-success-600" : "text-warning-600"
                    }
                  >
                    ({m.changePct > 0 ? "+" : ""}
                    {Math.round(m.changePct * 1000) / 10}%)
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {latest?.verification && (
          <div
            className={`rounded-medium border px-3 py-2.5 ${
              latest.verification.ok
                ? "border-success-200 bg-success-50"
                : "border-warning-200 bg-warning-50"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Chip
                color={latest.verification.ok ? "success" : "warning"}
                size="sm"
                variant="flat"
                classNames={{ content: "text-[0.65rem] font-bold" }}
              >
                {latest.verification.ok ? "VAR · CONFIRMED" : "VAR · REVIEW"}
              </Chip>
              <span className="text-tiny text-default-600">
                {latest.verification.stage} · {latest.verification.cluster}
              </span>
            </div>
            <p className="mt-1 text-tiny leading-5 text-default-600">
              {latest.verification.reason}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-primary-100 pt-3">
          <Button
            className="font-semibold"
            color="primary"
            isLoading={loading}
            radius="full"
            size="sm"
            startContent={!loading ? <Icon icon="solar:play-bold" width={14} /> : undefined}
            onPress={() => poll()}
          >
            Run check
          </Button>
          {market?.matchId && (
            <Button
              className="font-semibold"
              color="secondary"
              radius="full"
              size="sm"
              startContent={<Icon icon="solar:shield-check-bold" width={14} />}
              variant="flat"
              onPress={() => changeView("proofs")}
            >
              Verify match
            </Button>
          )}
          <span className="text-tiny text-primary-600/80">
            Cron loop · TxLINE in · decide · optional on-chain VAR
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

      <div className="flex h-dvh w-full overflow-hidden">
        <aside
          className={cn(
            "hidden h-dvh shrink-0 border-r border-primary-100 bg-white/90 backdrop-blur-md transition-[width] duration-200 ease-out sm:flex sm:flex-col",
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
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-primary-100 bg-white/80 px-4 backdrop-blur-md sm:px-6">
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
              className="t-btn-press font-semibold"
              color="primary"
              isDisabled={!configured}
              isLoading={loading}
              radius="full"
              size="sm"
              startContent={!loading && <Icon icon="solar:play-bold" width={14} />}
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
