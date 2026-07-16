import type { SidebarItem } from "./SidebarNav";

/** App views — switch the main panel (not page scroll). */
export type DashboardView = "overview" | "activity" | "decisions" | "odds";

export const dashboardNav: SidebarItem[] = [
  {
    key: "overview",
    title: "Overview",
    icon: "solar:widget-2-outline",
  },
  {
    key: "activity",
    title: "Activity",
    icon: "solar:chart-outline",
  },
  {
    key: "decisions",
    title: "Decisions",
    icon: "solar:checklist-minimalistic-outline",
  },
  {
    key: "odds",
    title: "Market odds",
    icon: "solar:graph-up-outline",
  },
];
