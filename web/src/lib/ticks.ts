import type { Tick } from "./agent";

/** Waiting / no in-play market — not a new event. */
export function isIdleHold(tick: Tick): boolean {
  if (tick.decision.action !== "HOLD") return false;
  const r = tick.decision.reason.toLowerCase();
  // Trade aborts and feed issues are real state changes — never collapse as idle.
  if (
    tick.agentStatus === "Aborted" ||
    tick.agentStatus === "Error" ||
    tick.execution?.aborted ||
    r.includes("trade aborted") ||
    r.includes("check failed") ||
    r.includes("agent check failed") ||
    r.includes("usable odds") ||
    r.includes("txline snapshot")
  ) {
    return false;
  }
  return (
    r.includes("no live odds") ||
    r.includes("not in-play") ||
    r.includes("not in play") ||
    r.includes("capital stays in yield") ||
    r.includes("keep capital in kamino") ||
    r.includes("stays in yield") ||
    r.includes("next fixture") ||
    r.includes("no live kamino capital") ||
    (!tick.decision.team && typeof tick.decision.spread !== "number")
  );
}

/**
 * User-facing agent reason: strip eng-ops framing, keep the live decision.
 * e.g. "No live Kamino… would also hold — Market not in-play" → "Market not in-play; keep capital in Kamino yield."
 */
export function displayAgentReason(reason: string): string {
  const raw = (reason || "").trim();
  if (!raw) return raw;
  const would = raw.match(
    /would (?:also hold|place a maker quote)\s*[—–-]\s*(.+)$/i,
  );
  if (would?.[1]) return would[1].trim();
  // Drop pure capital-gate prefixes when a clearer clause follows
  let stripped = raw
    .replace(/^No live Kamino capital, so nothing is executed\.\s*/i, "")
    .replace(/^On the live odds the agent\s+/i, "")
    .replace(/^would also hold\s*[—–-]?\s*/i, "")
    .replace(/^would place a maker quote\s*[—–-]?\s*/i, "")
    .trim();
  // Bare capital-gate with nothing left → neutral hold copy
  if (
    !stripped ||
    /^no live kamino/i.test(stripped) ||
    /nothing is executed/i.test(stripped)
  ) {
    return "Holding — watching live odds";
  }
  return stripped;
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
