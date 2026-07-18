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
import WatchingPanel from "./dashboard/WatchingPanel";
import StatCard from "./ui/StatCard";
import GateCard from "./ui/GateCard";
import LazyActivityChart from "./ui/LazyActivityChart";
import AuthCard from "./auth/AuthCard";
import DashboardSidebar from "./dashboard/DashboardSidebar";
import SidebarDrawer from "./dashboard/SidebarDrawer";
import LogoutConfirmModal from "./dashboard/LogoutConfirmModal";
import { dashboardNav, type DashboardView } from "./dashboard/sidebar-items";
import { heldSeriesFromTicks, checksSeriesFromTicks, estimatedEarned } from "../lib/chart-from-ticks";
import { dedupeTicksForFeed, isIdleHold } from "../lib/ticks";
import { useAgent } from "../hooks/useAgent";
import { useAuth } from "../hooks/useAuth";

const SIDEBAR_KEY = "ns_sidebar_compact";
const VIEW_KEY = "ns_dashboard_view";

const VIEW_TITLES: Record<DashboardView, string> = {
  overview: "Overview",
  decisions: "Decisions",
  proofs: "Proofs",
  portfolio: "Portfolio",
};

function isDashboardView(v: string): v is DashboardView {
  return dashboardNav.some((item) => item.key === v);
}

export default function Dashboard() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const { ticks, error, loading, poll, configured, needsAuth, lastSyncedAt, liveFlashId } =
    useAgent({
      enabled: isAuthenticated,
    });

  const [isCompact, setIsCompact] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [view, setView] = React.useState<DashboardView>("overview");
  const [, setClock] = React.useState(0);
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

  // Dedupe idle HOLDs so KPIs don't look like fabricated check volume
  const feedTicks = dedupeTicksForFeed(ticks);
  const observed = feedTicks.length;
  const trades = feedTicks.filter((t) => t.decision.action === "TRADE").length;
  const holds = feedTicks.filter((t) => t.decision.action === "HOLD").length;
  const idleOnly = feedTicks.length > 0 && feedTicks.every(isIdleHold);
  // Connection chip: auth + agent URL only — do not thrash on transient poll errors
  const connected = configured && isAuthenticated;

  const heldSeries = heldSeriesFromTicks(feedTicks);
  const checkSeries = checksSeriesFromTicks(feedTicks);
  const chartData = heldSeries.length >= 2 ? heldSeries : checkSeries;
  const earned = estimatedEarned(feedTicks);
  const latestBalance = feedTicks.find((t) => typeof t.yield?.balanceUsdc === "number")?.yield
    ?.balanceUsdc;
  const latest = feedTicks[0] ?? ticks[0];
  const latestOdds =
    latest && (latest.decision.team || typeof latest.decision.spread === "number")
      ? latest.decision
      : null;

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
            subtitle="Continue with Google to open the live dashboard and run agent checks"
            title="Continue with Google"
          />
        </div>
      </HeroUIProvider>
    );
  }

  const sidebarProps = {
    activeView: view,
    onViewChange: changeView,
    connected: Boolean(connected),
    user,
    onLogout: openLogout,
    onToggleCompact: toggleCompact,
  };

  // Only real setup/credential failures — not normal HOLDs that mention Kamino yield.
  const setupReason = latest?.decision?.reason;
  const needsSetup =
    Boolean(setupReason) &&
    !/not in-play|no match is in play|no live odds|keep capital in|stays? in yield|next fixture/i.test(
      setupReason!,
    ) &&
    /not configured|not wired|missing |unavailable|credential|api key|failed to|couldn.?t (reach|load|fetch)/i.test(
      setupReason!,
    );
  const statusBanner = needsSetup ? (
    <GateCard
      description={setupReason}
      icon="solar:plug-circle-linear"
      title="Agent needs setup"
      tone="warning"
    />
  ) : null;

  const kpis = (
    <dl className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <StatCard
        hint={idleOnly ? "waiting on live play" : "state changes"}
        icon="solar:pulse-linear"
        title="Checks"
        value={observed > 0 ? String(observed) : "-"}
      />
      <StatCard
        hint="capital moved"
        icon="solar:arrow-right-up-linear"
        share={observed > 0 ? trades / observed : undefined}
        title="Opportunities taken"
        value={observed > 0 ? String(trades) : "-"}
      />
      <StatCard
        hint={
          latestBalance
            ? `$${latestBalance.toFixed(2)} @ ${((feedTicks.find((t) => typeof t.yield?.apy === "number")?.yield?.apy ?? 0.08) * 100).toFixed(2)}% APY`
            : "stayed earning"
        }
        icon="solar:safe-square-linear"
        share={observed > 0 ? holds / observed : undefined}
        title="Kept earning"
        value={
          earned !== null
            ? `+$${earned < 0.001 ? earned.toFixed(6) : earned.toFixed(4)}`
            : observed > 0
              ? String(holds)
              : "-"
        }
      />
    </dl>
  );

  const usingUsdcChart = heldSeries.length >= 2;
  const activityPanel = (
    <LazyActivityChart
      change={chartData.length >= 2 ? "this session" : undefined}
      changeType="positive"
      data={chartData}
      emptyLabel={
        loading
          ? "Loading live activity…"
          : "No live graph yet. Run checks when the agent is connected."
      }
      height={260}
      title={usingUsdcChart ? "Kamino balance over time" : "Kept earning over time"}
      value={
        usingUsdcChart && latestBalance !== undefined
          ? `$${latestBalance.toFixed(2)}`
          : chartData.length >= 2 ? String(holds) : "-"
      }
    />
  );

  const oddsPanel = (
    <Card className="border border-transparent bg-content1 dark:border-default-100">
      <CardBody className="gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
            <Icon className="text-default-500" icon="solar:chart-2-linear" width={16} />
          </div>
          <h2 className="font-display text-medium font-semibold text-foreground">
            Latest market odds
          </h2>
        </div>
        {latestOdds ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-medium border border-default-200 bg-content2 px-3 py-3">
              <p className="text-tiny text-default-500">Market</p>
              <p className="text-medium font-semibold text-foreground">
                {latestOdds.team ?? "-"}
              </p>
            </div>
            <div className="rounded-medium border border-default-200 bg-content2 px-3 py-3">
              <p className="text-tiny text-default-500">Spread / offer</p>
              <p className="font-display text-2xl font-semibold tabular-nums text-foreground">
                {typeof latestOdds.spread === "number" ? latestOdds.spread : "-"}
              </p>
            </div>
            <div className="rounded-medium bg-content2 px-3 py-3">
              <p className="text-tiny text-default-500">Decision</p>
              <p className="text-small text-default-700">
                {latestOdds.action === "TRADE" ? "Take opportunity" : "Keep earning"}
              </p>
              <p className="mt-1 text-tiny leading-5 text-default-500">
                {latest?.decision.reason}
              </p>
            </div>
            {latest?.verification && (
              <div
                className={`rounded-medium border px-3 py-3 ${
                  latest.verification.ok
                    ? "border-success-200 bg-success-50/60"
                    : "border-default-200 bg-content2"
                }`}
              >
                <p className="text-tiny text-default-500">On-chain match check</p>
                <p className="mt-0.5 text-small font-medium text-foreground">
                  {latest.verification.ok ? "Verified on Solana" : "Not verified yet"}
                </p>
                <p className="mt-1 text-tiny leading-5 text-default-500">
                  {latest.verification.reason}
                </p>
                {latest.verification.explorerUrl && (
                  <a
                    className="mt-2 inline-block text-tiny text-primary underline-offset-2 hover:underline"
                    href={latest.verification.explorerUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View roots PDA
                  </a>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-medium border border-dashed border-default-200 px-3 py-5 text-center">
            <div className="mb-2 flex rounded-medium border border-default-100 bg-default-50 p-2">
              <Icon className="text-default-400" icon="solar:chart-2-linear" width={20} />
            </div>
            <p className="text-small text-default-500">No odds yet</p>
            <p className="mt-1 text-tiny text-default-400">
              When the agent takes an opportunity, the market and spread show here.
            </p>
          </div>
        )}

        {latest?.movement?.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-tiny font-medium text-default-500">
              Sharp movement since last check
            </p>
            {latest.movement.map((m) => (
              <div
                key={m.outcome}
                className="flex items-center justify-between rounded-medium border border-default-200 bg-content2 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon
                    className={
                      m.direction === "shortening" ? "text-success" : "text-default-400"
                    }
                    icon={
                      m.direction === "shortening"
                        ? "solar:arrow-right-down-linear"
                        : "solar:arrow-right-up-linear"
                    }
                    width={16}
                  />
                  <p className="truncate text-small text-foreground">{m.outcome}</p>
                </div>
                <p className="shrink-0 text-tiny tabular-nums text-default-500">
                  {m.fromOdds} → {m.toOdds}{" "}
                  <span
                    className={
                      m.direction === "shortening" ? "text-success" : "text-default-400"
                    }
                  >
                    ({m.changePct > 0 ? "+" : ""}
                    {Math.round(m.changePct * 1000) / 10}%)
                  </span>
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );

  const decisionsPanel = (
    <DecisionFeed
      error={error}
      lastSyncedAt={lastSyncedAt}
      liveFlashId={liveFlashId}
      loading={loading}
      ticks={ticks}
      onOpenProofs={() => changeView("proofs")}
    />
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
                {connected ? "Live" : "Limited"}
              </Chip>
              {connected && lastSyncedAt && (
                <span className="hidden text-tiny tabular-nums text-default-400 sm:inline">
                  agent sync{" "}
                  {Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000)) < 5
                    ? "now"
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
              startContent={!loading && <Icon icon="solar:refresh-linear" width={14} />}
              onPress={() => poll()}
            >
              Run check
            </Button>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-5">
              {(error || statusBanner) && (
                <div className="mb-5 flex max-w-2xl flex-col gap-3">
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
                  {statusBanner}
                </div>
              )}

              {view === "overview" && (
                <div className="flex flex-col gap-3 sm:gap-4">
                  {kpis}
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-4">
                    <div className="lg:col-span-3">{activityPanel}</div>
                    <div className="flex flex-col gap-3 lg:col-span-2">
                      {oddsPanel}
                      <WatchingPanel />
                    </div>
                  </div>
                </div>
              )}

              {view === "decisions" && (
                <div className="flex flex-col gap-4">
                  {decisionsPanel}
                </div>
              )}

              {view === "proofs" && <ProofsView ticks={ticks} />}

              {view === "portfolio" && (
                <div className="flex flex-col gap-4">
                  <PortfolioView />
                </div>
              )}


            </div>
          </main>
        </div>
      </div>
    </HeroUIProvider>
  );
}
