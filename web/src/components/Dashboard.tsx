"use client";

import React from "react";
import {
  HeroUIProvider,
  Button,
  Card,
  CardBody,
  Chip,
  Link,
  Avatar,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import DecisionFeed from "./DecisionFeed";
import LazyActivityChart from "./ui/LazyActivityChart";
import AuthCard from "./auth/AuthCard";
import BrandMark from "./ui/BrandMark";
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
      <p className="font-display text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-tiny text-default-400">{hint}</p>
    </CardBody>
  </Card>
);

export default function Dashboard() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const { ticks, error, loading, poll, configured, needsAuth } = useAgent({
    enabled: isAuthenticated,
  });

  const observed = ticks.length;
  const trades = ticks.filter((t) => t.decision.action === "TRADE").length;
  const holds = observed - trades;
  const connected = configured && isAuthenticated && !error;

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
            returnTo={typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined}
            subtitle="Sign in with Google to open the live dashboard and run agent checks"
            title="Sign in to continue"
          />
        </div>
      </HeroUIProvider>
    );
  }

  return (
    <HeroUIProvider>
      <div className="min-h-dvh bg-background">
        {/* Header base - solid chrome, not sticky glass over a photo */}
        <header className="header-base">
          <div className="mx-auto flex h-16 w-full max-w-7xl flex-wrap items-center gap-3 px-4 sm:px-6">
            <Link href="/" aria-label="Home">
              <BrandMark size="sm" />
            </Link>
            <span className="hidden h-4 w-px bg-default-200 sm:block" aria-hidden />
            <span className="font-display text-small font-medium text-default-600">Dashboard</span>
            <Chip
              classNames={{ content: "font-medium text-[0.65rem]" }}
              color={connected ? "success" : "warning"}
              radius="sm"
              size="sm"
              variant="flat"
            >
              {connected ? "Live" : "Offline"}
            </Chip>
            <div className="ml-auto flex items-center gap-2">
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

              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <button
                    className="flex items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-90"
                    type="button"
                  >
                    <Avatar
                      className="h-8 w-8"
                      name={user?.name || "U"}
                      size="sm"
                      src={user?.picture}
                    />
                  </button>
                </DropdownTrigger>
                <DropdownMenu aria-label="Account">
                  <DropdownItem key="profile" className="h-14 gap-2" textValue="profile">
                    <p className="font-semibold">{user?.name}</p>
                    <p className="text-tiny text-default-500">{user?.email}</p>
                  </DropdownItem>
                  <DropdownItem
                    key="logout"
                    color="danger"
                    startContent={<Icon icon="solar:logout-2-linear" width={16} />}
                    onPress={() => logout()}
                  >
                    Sign out
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="mb-6 max-w-2xl">
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Dashboard
            </h1>
            <p className="mt-1 text-small leading-6 text-default-500">
              Live agent decisions, odds when a trade is taken, and session activity. Only from the
              real agent, never invented.
            </p>
          </div>

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

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
            <LazyActivityChart
              change={chartData.length >= 2 ? "this session" : undefined}
              changeType="positive"
              className="lg:col-span-3"
              data={chartData}
              emptyLabel={
                loading
                  ? "Loading live activity…"
                  : "No live graph yet. Run checks when the agent is connected."
              }
              height={280}
              title="Kept earning over time"
              value={chartData.length >= 2 ? String(holds) : "-"}
            />

            <Card className="border border-transparent bg-content1 dark:border-default-100 lg:col-span-2">
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
                  <div className="flex flex-col gap-3">
                    <div className="rounded-medium border border-dashed border-default-200 px-3 py-8 text-center">
                      <p className="text-small text-default-500">No odds yet</p>
                      <p className="mt-1 text-tiny text-default-400">
                        When the agent takes an opportunity, the market and spread show here.
                      </p>
                    </div>
                    <div className="rounded-medium border border-default-200 bg-content2 px-3 py-3">
                      <p className="text-tiny text-default-500">Signed in as</p>
                      <p className="text-small text-default-600">{user?.email}</p>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="mt-5">
            <DecisionFeed error={error} loading={loading} ticks={ticks} />
          </div>
        </main>
      </div>
    </HeroUIProvider>
  );
}
