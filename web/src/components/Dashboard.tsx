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
import LazyActivityChart from "./ui/LazyActivityChart";
import AuthCard from "./auth/AuthCard";
import DashboardSidebar from "./dashboard/DashboardSidebar";
import SidebarDrawer from "./dashboard/SidebarDrawer";
import LogoutConfirmModal from "./dashboard/LogoutConfirmModal";
import { dashboardNav, type DashboardView } from "./dashboard/sidebar-items";
import { heldSeriesFromTicks, checksSeriesFromTicks } from "../lib/chart-from-ticks";
import { useAgent } from "../hooks/useAgent";
import { useAuth } from "../hooks/useAuth";

type KpiProps = {
  title: string;
  value: string;
  hint: string;
};

const KpiCard = ({ title, value, hint }: KpiProps) => (
  <Card className="border border-transparent bg-content1 dark:border-default-100">
    <CardBody className="gap-1 p-4">
      <p className="text-small font-medium text-default-500">{title}</p>
      <p className="font-display text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="text-tiny text-default-400">{hint}</p>
    </CardBody>
  </Card>
);

const SIDEBAR_KEY = "ns_sidebar_compact";
const VIEW_KEY = "ns_dashboard_view";

const VIEW_TITLES: Record<DashboardView, string> = {
  overview: "Overview",
  activity: "Activity",
  decisions: "Decisions",
  odds: "Market odds",
};

function isDashboardView(v: string): v is DashboardView {
  return dashboardNav.some((item) => item.key === v);
}

export default function Dashboard() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const { ticks, error, loading, poll, configured, needsAuth } = useAgent({
    enabled: isAuthenticated,
  });

  const [isCompact, setIsCompact] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [view, setView] = React.useState<DashboardView>("overview");
  const {
    isOpen: logoutOpen,
    onOpen: openLogout,
    onOpenChange: onLogoutOpenChange,
  } = useDisclosure();

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

  const observed = ticks.length;
  const trades = ticks.filter((t) => t.decision.action === "TRADE").length;
  const holds = observed - trades;
  // Connection chip: auth + agent URL only — do not thrash on transient poll errors
  const connected = configured && isAuthenticated;

  const heldSeries = heldSeriesFromTicks(ticks);
  const checkSeries = checksSeriesFromTicks(ticks);
  const chartData = heldSeries.length >= 2 ? heldSeries : checkSeries;
  const latest = ticks[0];
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
            subtitle="Sign up or sign in with Google to open the live dashboard and run agent checks"
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

  const statusBanner =
    latest?.decision?.reason &&
    /TxLINE|Kamino|BetDEX|not configured|not wired/i.test(latest.decision.reason) ? (
      <p className="mt-3 rounded-medium border border-default-200 bg-content2 px-3 py-2 text-small text-default-600">
        Latest agent status: {latest.decision.reason}
      </p>
    ) : null;

  const kpis = (
    <dl className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <KpiCard
        hint="this session"
        title="Checks"
        value={observed > 0 ? String(observed) : "-"}
      />
      <KpiCard
        hint="capital moved"
        title="Opportunities taken"
        value={observed > 0 ? String(trades) : "-"}
      />
      <KpiCard
        hint="stayed earning"
        title="Kept earning"
        value={observed > 0 ? String(holds) : "-"}
      />
    </dl>
  );

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
      height={view === "activity" ? 360 : 280}
      title="Kept earning over time"
      value={chartData.length >= 2 ? String(holds) : "-"}
    />
  );

  const oddsPanel = (
    <Card className="border border-transparent bg-content1 dark:border-default-100">
      <CardBody className="gap-4 p-5">
        <h2 className="font-display text-medium font-semibold text-foreground">
          Latest market odds
        </h2>
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
          </div>
        ) : (
          <div className="rounded-medium border border-dashed border-default-200 px-3 py-8 text-center">
            <p className="text-small text-default-500">No odds yet</p>
            <p className="mt-1 text-tiny text-default-400">
              When the agent takes an opportunity, the market and spread show here.
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );

  const decisionsPanel = (
    <DecisionFeed error={error} loading={loading} ticks={ticks} />
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
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
              {(error || statusBanner) && (
                <div className="mb-5 max-w-2xl">
                  {error && (
                    <p className="rounded-medium border border-warning-200 bg-warning-50/60 px-3 py-2 text-small text-warning-800">
                      {error}
                    </p>
                  )}
                  {statusBanner}
                </div>
              )}

              {view === "overview" && (
                <div className="flex flex-col gap-5">
                  <div className="max-w-2xl">
                    <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                      Overview
                    </h1>
                    <p className="mt-1 text-small leading-6 text-default-500">
                      Session KPIs, activity, and latest odds from the real agent.
                    </p>
                  </div>
                  {kpis}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
                    <div className="lg:col-span-3">{activityPanel}</div>
                    <div className="lg:col-span-2">{oddsPanel}</div>
                  </div>
                </div>
              )}

              {view === "activity" && (
                <div className="flex flex-col gap-5">
                  <div className="max-w-2xl">
                    <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                      Activity
                    </h1>
                    <p className="mt-1 text-small leading-6 text-default-500">
                      How often the agent checked and held capital this session.
                    </p>
                  </div>
                  {kpis}
                  {activityPanel}
                </div>
              )}

              {view === "decisions" && (
                <div className="flex flex-col gap-5">
                  <div className="max-w-2xl">
                    <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                      Decisions
                    </h1>
                    <p className="mt-1 text-small leading-6 text-default-500">
                      Live feed of agent TRADE / HOLD outcomes for this session.
                    </p>
                  </div>
                  {decisionsPanel}
                </div>
              )}

              {view === "odds" && (
                <div className="flex max-w-lg flex-col gap-5">
                  <div>
                    <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                      Market odds
                    </h1>
                    <p className="mt-1 text-small leading-6 text-default-500">
                      Last market the agent quoted when taking an opportunity.
                    </p>
                  </div>
                  {oddsPanel}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </HeroUIProvider>
  );
}
