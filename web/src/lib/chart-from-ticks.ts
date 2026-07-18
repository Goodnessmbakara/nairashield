import type { Tick } from "./agent";
import type { ChartPoint } from "../components/ui/ActivityChart";

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
