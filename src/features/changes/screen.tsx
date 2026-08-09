import { GitCompare } from "lucide-react";

import { createLazyScreenContainer, type ScreenModule } from "../../screenModule";

const container = createLazyScreenContainer(
  () => import("../../changes"),
  (module) => module.ChangesPanel,
);

export const ChangesPanel = container.Component;

export const changesScreenModule = {
  kind: "screen",
  id: "changes",
  section: "project",
  labelKey: "navChanges",
  disabledLabelKey: "navChangesTitle",
  commandLabelKey: "navChanges",
  icon: <GitCompare />,
  requiresProject: true,
  inCompactNav: true,
  container,
  additionalPreloads: [],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
  performanceBudget: { warmSwitchWarningMs: 40, warmSwitchFailureMs: 50, maxVisibleDescendants: 1200 },
} as const satisfies ScreenModule;
