"use client";

import React from "react";
import { Avatar, Badge, Card, Chip, cn } from "@heroui/react";
import { Icon } from "@iconify/react";
import type { Tick } from "../lib/agent";
import { dedupeTicksForFeed, displayAgentReason, isIdleHold } from "../lib/ticks";
import { TeamFlag } from "../lib/flags";

const MAX_HISTORY = 12;

function actionLabel(action: string) {
  if (action === "TRADE") return "Take opportunity";
  if (action === "HOLD") return "Keep earning";
  return action;
}

/** Only real trade-path aborts — not feed/odds/config HOLDs. */
function isTradeAbort(tick: Tick): boolean {
  if (tick.execution?.aborted) return true;
  if (tick.agentStatus === "Aborted") return true;
  const r = tick.decision.reason.toLowerCase();
  return r.includes("trade aborted");
}

/** Transient check / feed failures (still HOLD — no trade). */
function isFeedIssue(tick: Tick): boolean {
  if (isTradeAbort(tick)) return false;
  if (tick.agentStatus === "Error") return true;
  const r = tick.decision.reason.toLowerCase();
  return (
    r.includes("check failed") ||
    r.includes("agent check failed") ||
    r.includes("tick failed") ||
    (r.includes("returned") && r.includes("usable odds")) ||
    r.includes("txline snapshot")
  );
}

function statusChip(tick: Tick): { label: string; color: "success" | "warning" | "default" | "danger" | "primary" | "secondary" } {
  if (isTradeAbort(tick)) return { label: "Safe abort", color: "warning" };
  if (isFeedIssue(tick)) return { label: "Feed issue", color: "secondary" };
  if (tick.execution?.simulated && tick.decision.action === "TRADE") {
    return { label: "SIM TRADE", color: "secondary" };
  }
  if (tick.decision.action === "TRADE") {
    return { label: "TRADE", color: "warning" };
  }
  if (tick.execution?.simulated || /SIMULATION/i.test(tick.decision.reason)) {
    return { label: "SIM HOLD", color: "default" };
  }
  return { label: "HOLD", color: "success" };
}

function MarketBlock({ tick }: { tick: Tick }) {
  const m = tick.market;
  if (!m?.match && !m?.matchId && !m?.odds) return null;
  const oddsEntries = m.odds ? Object.entries(m.odds) : [];
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-default-100 pt-3">
      {(m.match || m.p1) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-tiny text-default-500">Market</span>
          <span className="text-small font-medium text-foreground">
            {m.match || `${m.p1 ?? "?"} vs ${m.p2 ?? "?"}`}
          </span>
          {typeof m.minute === "number" && (
            <Chip classNames={{ content: "text-[0.6rem]" }} radius="sm" size="sm" variant="flat">
              {m.minute}&apos;
            </Chip>
          )}
          {m.status && (
            <Chip classNames={{ content: "text-[0.6rem]" }} radius="sm" size="sm" variant="flat">
              {m.status}
            </Chip>
          )}
        </div>
      )}
      {oddsEntries.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {oddsEntries.map(([k, v]) => (
            <div
              key={k}
              className="flex flex-col items-center rounded-medium bg-primary-50/80 px-2 py-2 ring-1 ring-primary-100"
            >
              {/^draw|x$/i.test(k) ? (
                <span className="flex h-4 w-6 items-center justify-center rounded-[2px] bg-secondary-200 text-[0.5rem] font-bold text-secondary-800">
                  X
                </span>
              ) : (
                <TeamFlag name={k} width={22} height={15} />
              )}
              <span className="mt-1 text-[0.6rem] font-medium uppercase text-primary-600">{k}</span>
              <span className="font-mono text-small font-semibold tabular-nums text-primary-800">
                {Number(v).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
      {m.matchId && (
        <p className="font-mono text-[0.65rem] text-default-400">fixture · {m.matchId}</p>
      )}
    </div>
  );
}

function YieldBlock({ tick }: { tick: Tick }) {
  const y = tick.yield;
  if (typeof y?.balanceUsdc !== "number") return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-tiny text-default-500">
      <span>
        Kamino{" "}
        <span className="font-medium tabular-nums text-default-700">
          ${y.balanceUsdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </span>
      {typeof y.apy === "number" && (
        <span className="tabular-nums">{(y.apy * 100).toFixed(2)}% APY</span>
      )}
      {y.source && (
        <Chip classNames={{ content: "text-[0.6rem]" }} radius="sm" size="sm" variant="flat">
          {y.source}
        </Chip>
      )}
    </div>
  );
}

/** Unfunded dry-run — reason text and/or explicit projection payload. */
function isUnfundedProjection(tick: Tick): boolean {
  if (tick.projection) return true;
  const r = tick.decision.reason.toLowerCase();
  return (
    r.includes("no live kamino capital") ||
    r.includes("no live kamino position") ||
    r.includes("nothing is executed")
  );
}

/** Prefer live decision gates; fall back to projection.decision when unfunded. */
function gateNumbers(tick: Tick) {
  const d = tick.decision;
  const p = tick.projection?.decision;
  return {
    yNet: typeof d.yNet === "number" ? d.yNet : p?.yNet,
    edge: typeof d.edge === "number" ? d.edge : p?.edge,
    makerMargin: typeof d.makerMargin === "number" ? d.makerMargin : p?.makerMargin,
    yieldApy: typeof d.yieldApy === "number" ? d.yieldApy : p?.yieldApy,
    fairOdds: typeof d.fairOdds === "number" ? d.fairOdds : p?.fairOdds,
  };
}

function pctLabel(fraction: number, digits = 2): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Compact Y_net / edge / margin / APY row — only renders fields that exist. */
function GatesBlock({ tick }: { tick: Tick }) {
  const g = gateNumbers(tick);
  const items: Array<{ key: string; label: string; value: string }> = [];
  if (typeof g.yNet === "number") {
    items.push({
      key: "ynet",
      label: "Y_net",
      value: `$${g.yNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`,
    });
  }
  if (typeof g.edge === "number") {
    items.push({ key: "edge", label: "Edge", value: pctLabel(g.edge) });
  }
  if (typeof g.makerMargin === "number") {
    items.push({ key: "margin", label: "Margin", value: pctLabel(g.makerMargin) });
  }
  if (typeof g.yieldApy === "number") {
    items.push({ key: "apy", label: "Yield APY", value: pctLabel(g.yieldApy) });
  }
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-tiny text-default-500">
      <span className="font-medium text-default-400">Gates</span>
      {items.map((it) => (
        <span key={it.key}>
          {it.label}{" "}
          <span className="font-medium tabular-nums text-default-700">{it.value}</span>
        </span>
      ))}
    </div>
  );
}

/** Largest sharp move when movement[] is present. */
function MovementBlock({ tick }: { tick: Tick }) {
  const moves = tick.movement;
  if (!moves?.length) return null;
  const top = [...moves].sort(
    (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct),
  )[0]!;
  const pct = Math.round(top.changePct * 1000) / 10;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-tiny">
      <span className="font-medium text-warning-700">Movement</span>
      <span className="text-default-600">{top.outcome}</span>
      <span className="tabular-nums text-default-500">
        {top.fromOdds} → {top.toOdds}
      </span>
      <span
        className={cn(
          "font-medium tabular-nums",
          top.direction === "shortening" ? "text-success-600" : "text-warning-600",
        )}
      >
        {pct > 0 ? "+" : ""}
        {pct}% · {top.direction}
      </span>
      {moves.length > 1 && (
        <span className="text-default-400">+{moves.length - 1} more</span>
      )}
    </div>
  );
}

function ProjectionChip({ tick }: { tick: Tick }) {
  if (!isUnfundedProjection(tick)) return null;
  const projectedTrade =
    tick.projection?.decision?.action === "TRADE" ||
    /would place a maker quote/i.test(tick.decision.reason);
  return (
    <Chip
      classNames={{ content: "font-medium text-[0.65rem]" }}
      color="secondary"
      radius="sm"
      size="sm"
      variant="flat"
    >
      {projectedTrade ? "Projection TRADE (unfunded)" : "Projection (unfunded)"}
    </Chip>
  );
}

const StatusPanel = ({ tick, flash }: { tick: Tick; flash?: boolean }) => {
  const chip = statusChip(tick);
  const abort = isTradeAbort(tick);
  const feed = isFeedIssue(tick);
  const isTrade = tick.decision.action === "TRADE";
  const gates = gateNumbers(tick);
  const team = tick.decision.team ?? tick.projection?.decision?.team;
  const side = tick.decision.side ?? tick.projection?.decision?.side;
  const spread = tick.decision.spread ?? tick.projection?.decision?.spread;
  return (
    <div
      className={cn(
        "rounded-medium border bg-content2 px-4 py-4 transition-[box-shadow,border-color] duration-500",
        flash && !abort && !feed
          ? "border-primary-300 shadow-[0_0_0_1px_rgba(0,107,187,0.25)]"
          : flash && (abort || feed)
            ? "border-warning-400 shadow-[0_0_0_1px_rgba(240,140,0,0.3)]"
            : abort || feed
              ? "border-warning-200 bg-warning-50/40"
              : isTrade
                ? "border-warning-200 bg-warning-50/30"
                : "border-success-200 bg-success-50/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-tiny font-semibold uppercase tracking-wide text-primary">
          Current status
        </p>
        <Chip
          classNames={{ content: "font-medium text-[0.65rem]" }}
          color={chip.color}
          radius="sm"
          size="sm"
          variant="flat"
        >
          {chip.label}
        </Chip>
        <ProjectionChip tick={tick} />
        {abort && tick.execution?.redeposited && (
          <Chip
            classNames={{ content: "font-medium text-[0.65rem]" }}
            color="success"
            radius="sm"
            size="sm"
            variant="flat"
          >
            redeposited
          </Chip>
        )}
        {flash && (
          <Chip
            classNames={{ content: "font-medium text-[0.65rem]" }}
            color={abort || feed ? "warning" : "success"}
            radius="sm"
            size="sm"
            variant="flat"
          >
            just now
          </Chip>
        )}
        <span className="ml-auto text-tiny tabular-nums text-default-400">
          {tick.receivedAt}
        </span>
      </div>
      <p className="mt-3 text-small leading-6 text-default-700">
        {displayAgentReason(tick.decision.reason)}
      </p>
      <GatesBlock tick={tick} />
      <MovementBlock tick={tick} />
      {tick.execution?.abortReason && (
        <p className="mt-2 text-tiny leading-5 text-warning-700">
          Failure: {tick.execution.abortReason}
        </p>
      )}
      {(team || typeof spread === "number" || typeof gates.fairOdds === "number") && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-default-100 pt-3">
          {team && (
            <Chip color="primary" radius="sm" size="sm" variant="flat">
              {team}
              {side ? ` · ${side}` : ""}
            </Chip>
          )}
          {typeof spread === "number" && (
            <span className="text-tiny text-default-500">
              Odds / spread{" "}
              <span className="font-medium tabular-nums text-default-700">{spread}</span>
            </span>
          )}
          {typeof gates.fairOdds === "number" && (
            <span className="text-tiny text-default-500">
              fair{" "}
              <span className="font-medium tabular-nums text-default-700">{gates.fairOdds}</span>
            </span>
          )}
        </div>
      )}
      <MarketBlock tick={tick} />
      <YieldBlock tick={tick} />
      {tick.verification && (
        <div className="mt-2 text-tiny text-default-500">
          On-chain:{" "}
          <span className={tick.verification.ok ? "text-success-600" : "text-default-600"}>
            {tick.verification.ok ? "verified" : "not verified"}
          </span>
          {" — "}
          {tick.verification.reason}
        </div>
      )}
    </div>
  );
};

const DecisionCard = React.forwardRef<
  HTMLDivElement,
  { tick: Tick; className?: string }
>(({ tick, className, ...props }, ref) => {
  const executed = tick.status === "Executed";
  const abort = isTradeAbort(tick);
  const feed = isFeedIssue(tick);
  const chip = statusChip(tick);

  return (
    <div ref={ref} className={cn("flex gap-3", className)} {...props}>
      <div className="relative flex-none">
        <Badge
          isOneChar
          color={abort || feed ? "warning" : executed ? "success" : "default"}
          content={
            <Icon
              className="text-background"
              icon={
                abort || feed
                  ? "solar:shield-warning-bold"
                  : executed
                    ? "solar:check-circle-bold"
                    : "solar:pause-circle-bold"
              }
              width={12}
            />
          }
          placement="bottom-right"
          shape="circle"
        >
          <Avatar
            showFallback
            classNames={{
              base: "border border-default-200 bg-content2",
              name: "text-small font-semibold text-default-600",
            }}
            name="R"
            radius="lg"
            size="md"
          />
        </Badge>
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-small font-medium text-default-700">Agent</span>
          <Chip
            classNames={{ content: "font-medium text-[0.65rem]" }}
            color={chip.color}
            radius="sm"
            size="sm"
            variant="flat"
          >
            {chip.label}
          </Chip>
          <ProjectionChip tick={tick} />
          {tick.market?.match && (
            <span className="truncate text-tiny text-default-400">{tick.market.match}</span>
          )}
          <span className="ml-auto text-tiny tabular-nums text-default-400">
            {tick.receivedAt}
          </span>
        </div>

        <div
          className={cn(
            "relative w-full rounded-medium px-4 py-3 text-default-600",
            abort || feed
              ? "border border-warning-100 bg-warning-50/40"
              : executed
                ? "border border-success-100 bg-success-50/40"
                : "bg-content2",
          )}
        >
          <p className="text-small leading-6">{displayAgentReason(tick.decision.reason)}</p>
          <GatesBlock tick={tick} />
          <MovementBlock tick={tick} />
          {tick.market?.odds && Object.keys(tick.market.odds).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(tick.market.odds).map(([k, v]) => (
                <span key={k} className="text-tiny tabular-nums text-default-500">
                  {k}{" "}
                  <span className="font-medium text-default-700">{Number(v).toFixed(2)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
DecisionCard.displayName = "DecisionCard";

function syncLabel(lastSyncedAt: number | null): string {
  if (!lastSyncedAt) return "waiting…";
  const sec = Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000));
  if (sec < 3) return "synced";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)}m ago`;
}

type FeedProps = {
  ticks: Tick[];
  error: string | null;
  loading: boolean;
  lastSyncedAt?: number | null;
  liveFlashId?: string | null;
  liveReason?: { action: string; reason: string; at: string } | null;
  onOpenProofs?: () => void;
  className?: string;
  /** Dense layout for overview sidebar — no duplicate status hero */
  compact?: boolean;
};

const DecisionFeed = React.forwardRef<HTMLDivElement, FeedProps>(
  (
    {
      ticks,
      error,
      loading,
      lastSyncedAt = null,
      liveFlashId = null,
      liveReason = null,
      onOpenProofs,
      className,
      compact = false,
    },
    ref,
  ) => {
    const feed = React.useMemo(() => dedupeTicksForFeed(ticks), [ticks]);
    const current = feed[0];
    // Compact: show latest rows including current; full: history under status panel
    const history = (
      compact ? feed.slice(0, 1 + MAX_HISTORY) : feed.slice(1, 1 + MAX_HISTORY)
    ).filter((t) => !isIdleHold(t) || isFeedIssue(t) || isTradeAbort(t) || t.execution?.simulated);
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
      const id = window.setInterval(() => setTick((n) => n + 1), 1000);
      return () => window.clearInterval(id);
    }, []);

    return (
      <Card
        ref={ref}
        className={cn(
          "border border-primary-100 bg-content1 shadow-sm shadow-primary-100/30 dark:border-default-100",
          compact ? "p-3 sm:p-3.5" : "p-5 sm:p-6",
          className,
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-small font-semibold text-foreground sm:text-medium">
            Live actions
          </h2>
          <Chip
            classNames={{ content: "font-medium text-[0.65rem]" }}
            color={
              liveFlashId
                ? "success"
                : lastSyncedAt && Date.now() - lastSyncedAt < 12_000
                  ? "success"
                  : "primary"
            }
            radius="sm"
            size="sm"
            startContent={
              <span
                className={cn(
                  "ml-1 h-1.5 w-1.5 rounded-full",
                  liveFlashId || (lastSyncedAt && Date.now() - lastSyncedAt < 12_000)
                    ? "animate-pulse bg-success"
                    : "bg-primary",
                )}
              />
            }
            variant="flat"
          >
            {liveFlashId ? "just now" : syncLabel(lastSyncedAt)}
          </Chip>
          {loading && (
            <Chip
              classNames={{ content: "font-medium text-[0.65rem]" }}
              color="primary"
              radius="sm"
              size="sm"
              variant="flat"
            >
              running
            </Chip>
          )}
        </div>

        {!compact && (
          <p className="mt-2 max-w-xl text-tiny leading-5 text-default-500">
            Each row is one agent tick on live TxLINE odds. Paper SIM fills are labeled when
            capital is virtual.
            {onOpenProofs && (
              <>
                {" "}
                <button
                  className="underline underline-offset-2"
                  type="button"
                  onClick={onOpenProofs}
                >
                  Verify path →
                </button>
              </>
            )}
          </p>
        )}

        <div className={cn("flex flex-col", compact ? "mt-3 gap-3" : "mt-5 gap-5")}>
          {error && (
            <div className="flex items-start gap-3 rounded-medium border border-warning-100 bg-warning-50/50 px-4 py-3">
              <Icon
                className="mt-0.5 flex-none text-warning"
                icon="solar:danger-triangle-linear"
                width={18}
              />
              <div className="min-w-0">
                <p className="text-small font-medium text-default-700">Sign-in needed</p>
                <p className="mt-1 text-tiny leading-5 text-default-500">{error}</p>
              </div>
            </div>
          )}

          {!error && ticks.length === 0 && loading && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Icon className="animate-spin text-primary" icon="solar:refresh-linear" width={22} />
              <p className="text-small text-default-500">Loading the latest check…</p>
            </div>
          )}

          {!error && ticks.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-2 rounded-medium bg-content2 py-12 text-center">
              <Icon className="text-default-300" icon="solar:inbox-linear" width={28} />
              <p className="text-small text-default-500">No decisions yet</p>
              <p className="max-w-xs text-tiny text-default-400">
                Status updates when the market or the decision changes — not every idle minute.
              </p>
            </div>
          )}

          {!compact && current && (
            <StatusPanel
              flash={liveFlashId === current.id}
              tick={
                liveReason && liveReason.at > current.id
                  ? ({
                      ...current,
                      decision: {
                        ...current.decision,
                        action: (liveReason.action === "TRADE" ? "TRADE" : "HOLD") as Tick["decision"]["action"],
                        reason: liveReason.reason,
                      },
                      receivedAt: new Date(liveReason.at).toLocaleTimeString(),
                    } satisfies Tick)
                  : current
              }
            />
          )}

          {history.length > 0 && (
            <div className={cn("flex flex-col", compact ? "gap-2.5" : "gap-4")}>
              {!compact && (
                <p className="text-tiny font-medium text-default-500">Earlier changes</p>
              )}
              {history.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "rounded-medium transition-[box-shadow,transform,opacity] duration-500",
                    liveFlashId === t.id &&
                      "scale-[1.01] shadow-[0_0_0_2px_rgba(0,107,187,0.35)]",
                  )}
                >
                  <DecisionCard tick={t} />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    );
  },
);
DecisionFeed.displayName = "DecisionFeed";

export default DecisionFeed;
