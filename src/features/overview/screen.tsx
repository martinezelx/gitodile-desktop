import { LayoutDashboard } from "lucide-react";

import type { ScreenModule } from "../../screenModule";

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
  // The shell still composes the visual Overview panel, while repository,
  // status and pending-version reads are owned by their feature controllers.
  container: { kind: "host-owned" },
  additionalPreloads: [
    () => import("./PendingVersionsSection"),
    () => import("../publish/PublishDialog"),
    () => import("../version-lines/VersionLinesDialog"),
  ],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
  performanceBudget: { warmSwitchWarningMs: 40, warmSwitchFailureMs: 50, maxVisibleDescendants: 1200 },
} as const satisfies ScreenModule;
