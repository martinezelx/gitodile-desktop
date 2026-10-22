import { GitBranch } from "lucide-react";

import { createLazyScreenContainer, type ScreenModule } from "../../runtime/screen/module";

const container = createLazyScreenContainer(
  () => import("./BranchesScreen"),
  (module) => module.BranchesScreen,
);

export const BranchesScreen = container.Component;

export const branchesScreenModule = {
  kind: "screen",
  id: "branches",
  section: "project",
  labelKey: "navBranches",
  disabledLabelKey: "navBranchesTitle",
  commandLabelKey: "commandGoBranches",
  icon: <GitBranch />,
  requiresProject: true,
  inCompactNav: true,
  container,
  additionalPreloads: [() => import("./BranchesDialog")],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
  performanceBudget: { warmSwitchWarningMs: 40, warmSwitchFailureMs: 50, maxVisibleDescendants: 1200 },
} as const satisfies ScreenModule;
