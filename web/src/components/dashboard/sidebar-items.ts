import type { SidebarItem } from "./SidebarNav";

/**
 * App views — switch the main panel (not page scroll).
 */
export type DashboardView = "overview" | "decisions" | "proofs" | "portfolio";

export const dashboardNav: SidebarItem[] = [
  {
    key: "overview",
    title: "Overview",
    icon: "solar:widget-2-outline",
  },
  {
    key: "decisions",
    title: "Decisions",
    icon: "solar:checklist-minimalistic-outline",
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
