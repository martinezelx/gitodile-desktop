import { GitBranch } from "lucide-react";

import { createLazyScreenContainer, type ScreenModule } from "../../screenModule";

const container = createLazyScreenContainer(
  () => import("../../versionLinesPanel"),
  (module) => module.VersionLinesPanel,
);

export const VersionLinesPanel = container.Component;

export const versionLinesScreenModule = {
  kind: "screen",
  id: "version-lines",
  section: "project",
  labelKey: "navVersionLines",
  disabledLabelKey: "navVersionLinesTitle",
  commandLabelKey: "commandGoVersionLines",
  icon: <GitBranch />,
  requiresProject: true,
  inCompactNav: true,
  container,
  additionalPreloads: [() => import("../../versionLinesDialog")],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
  performanceBudget: { warmSwitchWarningMs: 40, warmSwitchFailureMs: 50, maxVisibleDescendants: 1200 },
} as const satisfies ScreenModule;
