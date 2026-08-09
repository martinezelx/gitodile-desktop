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
  // Overview remains host-owned until its read lifecycle migrates in task 028.
  container: { kind: "host-owned" },
  additionalPreloads: [
    () => import("../../pendingVersions"),
    () => import("../../publishDialog"),
    () => import("../../versionLinesDialog"),
  ],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
  performanceBudget: { warmSwitchWarningMs: 40, warmSwitchFailureMs: 50, maxVisibleDescendants: 1200 },
} as const satisfies ScreenModule;
