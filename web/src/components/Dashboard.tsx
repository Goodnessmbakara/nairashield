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
    livePulse,
  } = useAgent({
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

  // Agent ticks auto-start from useAgent — no human "Run check" entrypoint.

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

  // Gate numbers for the hero card (Tufte: show the data). Prefer live decision, else projection.
  const gateDecision =
    latest?.decision ??
    agentStatus?.lastTick?.decision ??
    agentStatus?.lastTick?.projection?.decision;
  const projectionDecision =
    latest?.projection?.decision ?? agentStatus?.lastTick?.projection?.decision;
  const yNet =
    typeof gateDecision?.yNet === "number"
      ? gateDecision.yNet
      : typeof projectionDecision?.yNet === "number"
        ? projectionDecision.yNet
        : undefined;
  const edge =
    typeof gateDecision?.edge === "number"
      ? gateDecision.edge
      : typeof projectionDecision?.edge === "number"
        ? projectionDecision.edge
        : undefined;
  const makerMargin =
    typeof gateDecision?.makerMargin === "number"
      ? gateDecision.makerMargin
      : typeof projectionDecision?.makerMargin === "number"
        ? projectionDecision.makerMargin
        : typeof agentStatus?.config?.makerMargin === "number"
          ? agentStatus.config.makerMargin
          : undefined;
  const minEdge = agentStatus?.config?.minEdge;
  const capitalMode = agentStatus?.capital ?? "unknown";
  const isSimMode =
    capitalMode === "simulation" ||
    Boolean(latest?.execution?.simulated) ||
    /SIMULATION/i.test(rawReason);
  const isUnfunded =
    capitalMode === "unfunded" ||
    isSimMode ||
    Boolean(latest?.projection ?? agentStatus?.lastTick?.projection) ||
    /no live kamino capital/i.test(rawReason);
  const simBankroll =
    typeof agentStatus?.simBankrollUsdc === "number"
      ? agentStatus.simBankrollUsdc
      : typeof latest?.execution?.simBankrollUsdc === "number"
        ? latest.execution.simBankrollUsdc
        : undefined;
  const integrations = agentStatus?.integrations ?? {};
  const integrationOrder = ["txline", "jupiter", "kamino", "wallet", "ai"] as const;

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
            subtitle="Sign in to watch the autonomous agent on live TxLINE odds"
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

  // Deming: common-cause HOLD (expected system behavior) vs special-cause (setup/error)
  const isCommonCauseHold =
    !isTrade &&
    !needsSetup &&
    !error &&
    (isUnfunded ||
      /no live odds|not in-play|not in play|next fixture|stays in yield|keep capital/i.test(
        rawReason,
      ));

  /** THE product moment — color-coded decision on live odds */
  const decisionHero = (
    <Card
      className={cn(
        "overflow-hidden border-2 bg-content1 shadow-sm transition-[box-shadow,border-color,transform] duration-500",
        isTrade
          ? "border-warning-300 shadow-warning-100/80"
          : "border-primary-200 shadow-primary-100/60",
        liveFlashId && latest && liveFlashId === latest.id
          ? "scale-[1.005] ring-2 ring-primary-400 ring-offset-2 shadow-primary-200/80"
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
      <CardBody className="gap-2.5 p-3 sm:p-4">
        {/* Status strip — integrations + capital (tight) */}
        <div className="flex flex-wrap items-center gap-1">
          {integrationOrder.map((key) => {
            const on = integrations[key];
            if (on === undefined) return null;
            return (
              <Chip
                key={key}
                classNames={{ content: "text-[0.55rem] font-medium uppercase" }}
                color={on ? "success" : "danger"}
                radius="sm"
                size="sm"
                variant="flat"
              >
                {key}
              </Chip>
            );
          })}
          <Chip
            classNames={{ content: "text-[0.55rem] font-medium" }}
            color={
              capitalMode === "funded"
                ? "success"
                : capitalMode === "simulation" || isSimMode
                  ? "secondary"
                  : capitalMode === "unfunded"
                    ? "warning"
                    : "default"
            }
            radius="sm"
            size="sm"
            variant="flat"
          >
            {capitalMode === "simulation" || isSimMode
              ? `paper · $${(simBankroll ?? 100).toFixed(0)}`
              : `capital · ${capitalMode}`}
          </Chip>
          {(isSimMode || /SIMULATION/i.test(rawReason)) && (
            <Chip
              classNames={{ content: "text-[0.55rem] font-semibold" }}
              color="secondary"
              radius="sm"
              size="sm"
              variant="solid"
            >
              SIM · real TxLINE
            </Chip>
          )}
          {isCommonCauseHold && !isTrade && (
            <Chip
              classNames={{ content: "text-[0.55rem] font-medium" }}
              color="default"
              radius="sm"
              size="sm"
              variant="flat"
            >
              expected HOLD
            </Chip>
          )}
        </div>

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

        <p className="text-small leading-6 text-foreground sm:text-medium">
          {reason || "Run a check to load the latest decision from live TxLINE odds."}
        </p>

        {/* Gates — compact data row */}
        {(typeof yNet === "number" ||
          typeof edge === "number" ||
          typeof makerMargin === "number" ||
          typeof minEdge === "number") && (
          <div className="grid grid-cols-4 gap-1.5">
            {typeof yNet === "number" && (
              <div className="rounded-medium border border-default-200 bg-content2 px-2 py-1.5">
                <p className="text-[0.55rem] font-medium uppercase text-default-400">Y_net</p>
                <p className="font-mono text-small font-semibold tabular-nums text-foreground">
                  ${yNet.toFixed(2)}
                </p>
              </div>
            )}
            {typeof edge === "number" && (
              <div className="rounded-medium border border-default-200 bg-content2 px-2 py-1.5">
                <p className="text-[0.55rem] font-medium uppercase text-default-400">Edge</p>
                <p className="font-mono text-small font-semibold tabular-nums text-foreground">
                  {(edge * 100).toFixed(1)}%
                </p>
              </div>
            )}
            {typeof minEdge === "number" && (
              <div className="rounded-medium border border-default-200 bg-content2 px-2 py-1.5">
                <p className="text-[0.55rem] font-medium uppercase text-default-400">minEdge</p>
                <p className="font-mono text-small font-semibold tabular-nums text-foreground">
                  {(minEdge * 100).toFixed(0)}%
                </p>
              </div>
            )}
            {typeof makerMargin === "number" && (
              <div className="rounded-medium border border-default-200 bg-content2 px-2 py-1.5">
                <p className="text-[0.55rem] font-medium uppercase text-default-400">Margin</p>
                <p className="font-mono text-small font-semibold tabular-nums text-foreground">
                  {(makerMargin * 100).toFixed(0)}%
                </p>
              </div>
            )}
          </div>
        )}

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
          <div className="grid grid-cols-3 gap-1.5">
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
                    "flex flex-col items-center rounded-medium border px-1.5 py-2",
                    tones[i % 3],
                  )}
                >
                  {isDraw ? (
                    <span className="flex h-4 w-6 items-center justify-center rounded-[2px] bg-secondary-200 text-[0.5rem] font-bold text-secondary-800">
                      X
                    </span>
                  ) : (
                    <TeamFlag name={k} width={22} height={15} />
                  )}
                  <span
                    className={cn(
                      "mt-1 text-[0.55rem] font-medium uppercase",
                      textTones[i % 3],
                    )}
                  >
                    {k}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-medium font-semibold tabular-nums",
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
            Odds appear when TxLINE returns a usable snapshot.
          </p>
        )}

        {movement.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[0.6rem] font-semibold text-warning-700">Sharp &gt;3%</span>
            {movement.slice(0, 3).map((m) => (
              <span
                key={m.outcome}
                className="rounded-full bg-warning-50 px-2 py-0.5 text-[0.65rem] tabular-nums text-default-700 ring-1 ring-warning-100"
              >
                {m.outcome} {m.fromOdds}→{m.toOdds} (
                {m.changePct > 0 ? "+" : ""}
                {Math.round(m.changePct * 1000) / 10}%)
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-primary-100 pt-2">
          <Chip
            classNames={{ content: "text-[0.6rem] font-semibold" }}
            color="success"
            radius="sm"
            size="sm"
            startContent={
              <span
                className={cn(
                  "ml-1 h-1.5 w-1.5 rounded-full bg-success",
                  livePulse % 2 === 0 ? "opacity-100" : "opacity-40",
                )}
              />
            }
            variant="flat"
          >
            {loading ? "Agent ticking…" : "Autonomous · every 60s"}
          </Chip>
          <span className="text-[0.65rem] text-primary-600/80">
            Live TxLINE · Y_net · no human in the loop
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
                startContent={
                  connected ? (
                    <span
                      className={cn(
                        "ml-1 h-1.5 w-1.5 rounded-full bg-success",
                        livePulse % 2 === 0 ? "opacity-100" : "opacity-40",
                      )}
                    />
                  ) : undefined
                }
              >
                {connected ? "LIVE" : "Offline"}
              </Chip>
              {connected && (liveReason || latest) && (
                <span className="hidden min-w-0 truncate text-tiny text-default-500 sm:inline">
                  <span
                    className={cn(
                      "font-semibold",
                      (liveReason?.action ?? latest?.decision.action) === "TRADE"
                        ? "text-warning-600"
                        : "text-success-600",
                    )}
                  >
                    {liveReason?.action ?? latest?.decision.action ?? "—"}
                  </span>
                  {" · "}
                  <span className="tabular-nums text-default-400">
                    {lastSyncedAt != null
                      ? Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000)) < 3
                        ? "now"
                        : `${Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))}s ago`
                      : "…"}
                  </span>
                  {liveFlashId ? (
                    <span className="ml-1 font-semibold text-primary">· new</span>
                  ) : null}
                </span>
              )}
            </div>

            <Chip
              classNames={{ content: "font-semibold text-[0.65rem]" }}
              color={connected ? "success" : "default"}
              radius="full"
              size="sm"
              startContent={
                <span
                  className={cn(
                    "ml-1 h-1.5 w-1.5 rounded-full",
                    connected ? "bg-success animate-pulse" : "bg-default-300",
                  )}
                />
              }
              variant="flat"
            >
              {loading ? "Ticking…" : connected ? "Agent autonomous" : "Agent offline"}
            </Chip>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
              {(error || needsSetup) && (
                <div className="mb-4 flex max-w-2xl flex-col gap-3">
                  {error && (
                    <GateCard
                      actionIcon="solar:refresh-linear"
                      actionLabel={configured ? "Retry agent link" : undefined}
                      description={error}
                      icon="solar:danger-triangle-bold"
                      isActionLoading={loading}
                      onAction={configured ? () => poll() : undefined}
                      title="Agent link interrupted"
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
                <div className="flex flex-col gap-3 lg:h-[calc(100dvh-5.5rem)] lg:min-h-0 lg:overflow-hidden">
                  {/*
                    Above-the-fold layout: decision left, watching + recent checks right.
                    No long vertical stack that buries Recent checks.
                  */}
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12 lg:overflow-hidden">
                    <div className="min-h-0 lg:col-span-7 lg:overflow-y-auto lg:pr-1">
                      {decisionHero}
                    </div>
                    <div className="flex min-h-0 flex-col gap-3 lg:col-span-5 lg:overflow-hidden">
                      <div className="shrink-0">
                        <WatchingPanel />
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto">
                        <DecisionFeed
                          compact
                          error={null}
                          lastSyncedAt={lastSyncedAt}
                          liveFlashId={liveFlashId}
                          liveReason={liveReason}
                          loading={loading}
                          ticks={ticks}
                        />
                      </div>
                    </div>
                  </div>
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
                />
              )}

              {view === "replays" && <ReplaysView />}
              {view === "portfolio" && <PortfolioView />}
            </div>
          </main>
        </div>
      </div>
    </HeroUIProvider>
  );
}
