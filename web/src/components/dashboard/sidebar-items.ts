import type { SidebarItem } from "./SidebarNav";

/**
 * App views — switch the main panel (not page scroll).
 * Two honest destinations only: everything at a glance, and the full
 * decision log. No duplicate views.
 */
export type DashboardView = "overview" | "decisions" | "portfolio" | "admin";

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
    key: "portfolio",
    title: "Portfolio",
    icon: "solar:wallet-2-linear",
  },
  {
    key: "admin",
    title: "Admin",
    icon: "solar:shield-keyhole-linear",
  },
];
