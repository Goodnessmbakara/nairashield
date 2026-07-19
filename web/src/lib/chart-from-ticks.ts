import type { Tick } from "./agent";
import type { ChartPoint } from "../components/ui/ActivityChart";

/** Default display capital when the agent is unfunded (UI projection only — never on-chain). */
export const DEMO_CAPITAL_USDC = 100;

/**
 * Build a USDC balance series from ticks that carry yield data.
 * Shows the actual Kamino balance over time — real earning, not a counter.
 */
export function heldSeriesFromTicks(ticks: Tick[]): ChartPoint[] {
  if (ticks.length === 0) return [];
  const chronological = [...ticks].reverse();

  // Only include ticks that have a real yield balance
  const withYield = chronological.filter((t) => typeof t.yield?.balanceUsdc === "number");
  if (withYield.length < 2) return [];

  return withYield.map((tick, i) => ({
    label: tick.receivedAt?.slice(0, 5) || `#${i + 1}`,
    value: tick.yield!.balanceUsdc!,
  }));
}

/**
 * Projection series for the dashboard when unfunded.
 * Uses real tick timestamps as the x-axis so the panel tracks live checks;
 * balance is display-only mock capital (not written to DB / not tradeable).
 */
export function projectionSeriesFromTicks(
  ticks: Tick[],
  capitalUsdc: number,
  apy = 0.08,
): ChartPoint[] {
  const chronological = [...ticks].reverse();
  const cap = Math.max(0, capitalUsdc);

  if (chronological.length === 0) {
    return [
      { label: "t0", value: Number(cap.toFixed(4)) },
      { label: "now", value: Number(cap.toFixed(4)) },
    ];
  }

  // Idle yield accrual between checks for a living chart — labeled projection only.
  const perCheck = (cap * apy) / (365 * 24 * 60); // ~per-minute at 1-min cron
  return chronological.map((tick, i) => ({
    label: tick.receivedAt?.slice(0, 5) || `#${i + 1}`,
    value: Number((cap + perCheck * i).toFixed(6)),
  }));
}

/** Resolve display capital: live Kamino first, else mock projection amount. */
export function resolveDisplayCapital(opts: {
  liveBalance?: number | null;
  projectionCapital?: number | null;
  tradeSizeUsdc?: number | null;
}): { balanceUsdc: number; mode: "live" | "projection" } {
  if (typeof opts.liveBalance === "number" && Number.isFinite(opts.liveBalance) && opts.liveBalance > 0) {
    return { balanceUsdc: opts.liveBalance, mode: "live" };
  }
  if (typeof opts.projectionCapital === "number" && opts.projectionCapital > 0) {
    return { balanceUsdc: opts.projectionCapital, mode: "projection" };
  }
  if (typeof opts.tradeSizeUsdc === "number" && opts.tradeSizeUsdc > 0) {
    return { balanceUsdc: opts.tradeSizeUsdc * 10, mode: "projection" };
  }
  return { balanceUsdc: DEMO_CAPITAL_USDC, mode: "projection" };
}

export function checksSeriesFromTicks(ticks: Tick[]): ChartPoint[] {
  if (ticks.length === 0) return [];
  const chronological = [...ticks].reverse();
  return chronological.map((tick, i) => ({
    label: tick.receivedAt?.slice(0, 5) || `#${i + 1}`,
    value: i + 1,
  }));
}

/** Latest real Kamino snapshot from ticks (newest-first). */
export function latestYield(ticks: Tick[]): { balanceUsdc: number; apy: number } | null {
  const t = ticks.find((x) => typeof x.yield?.balanceUsdc === "number");
  if (!t?.yield || typeof t.yield.balanceUsdc !== "number") return null;
  return {
    balanceUsdc: t.yield.balanceUsdc,
    apy: typeof t.yield.apy === "number" ? t.yield.apy : 0.08,
  };
}

/** Estimated USDC per day at current balance × APY — not session PnL. */
export function estimatedDailyYield(ticks: Tick[]): number | null {
  const y = latestYield(ticks);
  if (!y) return null;
  const perDay = y.balanceUsdc * y.apy * (1 / 365);
  return Math.round(perDay * 1_000_000) / 1_000_000;
}

/** @deprecated use estimatedDailyYield — kept for any stray imports */
export function estimatedEarned(ticks: Tick[]): number | null {
  return estimatedDailyYield(ticks);
}
