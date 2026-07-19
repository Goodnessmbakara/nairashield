import type { SidebarItem } from "./SidebarNav";

/**
 * App views — switch the main panel (not page scroll).
 */
export type DashboardView = "overview" | "decisions" | "proofs" | "replays" | "portfolio";

/** Core first: Agent is the product. Other views are secondary. */
export const dashboardNav: SidebarItem[] = [
  {
    key: "overview",
    title: "Agent",
    icon: "solar:cpu-bolt-linear",
  },
  {
    key: "decisions",
    title: "History",
    icon: "solar:checklist-minimalistic-outline",
  },
  {
    key: "replays",
    title: "Replays",
    icon: "solar:history-2-linear",
  },
  {
    key: "proofs",
    title: "Proofs",
    icon: "solar:shield-check-linear",
  },
  {
    key: "portfolio",
    title: "Portfolio",
    icon: "solar:wallet-2-linear",
  },
];
