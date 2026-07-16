import type { Tick } from "./agent";
import type { ChartPoint } from "../components/ui/ActivityChart";

/**
 * Build a simple running series from ticks observed this session.
 * - label: short time or #n
 * - value: cumulative "kept earning" (HOLD) count after each check
 * Falls back to empty array when there aren't enough points.
 */
export function heldSeriesFromTicks(ticks: Tick[]): ChartPoint[] {
  if (ticks.length === 0) return [];

  // ticks are newest-first; chart should read left→right chronological
  const chronological = [...ticks].reverse();
  let held = 0;

  return chronological.map((tick, i) => {
    if (tick.decision.action === "HOLD") held += 1;
    return {
      label: tick.receivedAt?.slice(0, 5) || `#${i + 1}`,
      value: held,
    };
  });
}

export function checksSeriesFromTicks(ticks: Tick[]): ChartPoint[] {
  if (ticks.length === 0) return [];
  const chronological = [...ticks].reverse();
  return chronological.map((tick, i) => ({
    label: tick.receivedAt?.slice(0, 5) || `#${i + 1}`,
    value: i + 1,
  }));
}
