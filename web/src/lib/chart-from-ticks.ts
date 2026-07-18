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

/**
 * Estimate USDC earned since first tick in session based on APY.
 * Returns null if no yield data available.
 */
export function estimatedEarned(ticks: Tick[]): number | null {
  const withYield = ticks.filter((t) => typeof t.yield?.balanceUsdc === "number");
  if (withYield.length === 0) return null;

  const latest = withYield[0]; // newest first
  const oldest = withYield[withYield.length - 1];
  const balance = latest.yield!.balanceUsdc!;
  const apy = latest.yield?.apy ?? 0.08;

  // Time elapsed in hours between oldest and newest tick
  const oldestTime = new Date(oldest.receivedAt || Date.now()).getTime();
  const latestTime = new Date(latest.receivedAt || Date.now()).getTime();
  const hoursElapsed = Math.max(0, (latestTime - oldestTime) / 3_600_000);

  // APY → per-hour rate, applied to balance
  const earned = balance * apy * (hoursElapsed / 8760);
  return Math.round(earned * 1_000_000) / 1_000_000; // 6 decimal places
}
