import { LayoutDashboard } from "lucide-react";

import { createEagerScreenContainer, type ScreenModule } from "../../runtime/screen/module";
import { OverviewPanel as OverviewPanelComponent } from "./OverviewPanel";

/** Eager, not lazy. Overview is what the app paints with no project open, so a
 * chunk fetch here would sit in front of first paint. It is still registered
 * through a container so nav, palette, keep-alive, lifecycle and eviction come
 * from this descriptor rather than from the shell composing it by hand. */
const container = createEagerScreenContainer(OverviewPanelComponent);

export const OverviewPanel = container.Component;

export const overviewScreenModule = {
  kind: "screen",
  id: "overview",
  section: "project",
  labelKey: "navOverview",
  disabledLabelKey: null,
  commandLabelKey: "commandGoOverview",
  icon: <LayoutDashboard />,
  requiresProject: false,
  inCompactNav: true,
  container,
  additionalPreloads: [
    () => import("./PendingVersionsSection"),
    () => import("./HistorySummarySection"),
    () => import("../publish"),
    () => import("../version-lines"),
  ],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
  performanceBudget: { warmSwitchWarningMs: 40, warmSwitchFailureMs: 50, maxVisibleDescendants: 1200 },
} as const satisfies ScreenModule;
