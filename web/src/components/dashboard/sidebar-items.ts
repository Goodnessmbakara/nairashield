import type { SidebarItem } from "./SidebarNav";

/**
 * App views — switch the main panel (not page scroll).
 */
export type DashboardView = "overview" | "decisions" | "replays" | "portfolio";

/** Core first: Agent is the product. No eng-ops Proofs/devnet panel in primary nav. */
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
    key: "portfolio",
    title: "Portfolio",
    icon: "solar:wallet-2-linear",
  },
];
