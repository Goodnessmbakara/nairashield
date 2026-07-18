import type { Tick } from "./agent";

/** Waiting / no in-play market — not a new event. */
export function isIdleHold(tick: Tick): boolean {
  if (tick.decision.action !== "HOLD") return false;
  const r = tick.decision.reason.toLowerCase();
  return (
    r.includes("no live odds") ||
    r.includes("not in-play") ||
    r.includes("not in play") ||
    r.includes("capital stays in yield") ||
    r.includes("keep capital in kamino") ||
    r.includes("stays in yield") ||
    r.includes("next fixture") ||
    (!tick.decision.team && typeof tick.decision.spread !== "number")
  );
}

/** One row per real state change — idle HOLDs collapse to a single status. */
export function dedupeTicksForFeed(ticks: Tick[]): Tick[] {
  const out: Tick[] = [];
  for (const tick of ticks) {
    const prev = out[out.length - 1];
    if (prev && isIdleHold(prev) && isIdleHold(tick)) {
      if (/next fixture/i.test(tick.decision.reason)) {
        out[out.length - 1] = tick;
      }
      continue;
    }
    if (
      prev &&
      prev.decision.action === tick.decision.action &&
      prev.decision.reason === tick.decision.reason &&
      tick.decision.action === "HOLD"
    ) {
      continue;
    }
    out.push(tick);
  }
  return out;
}
