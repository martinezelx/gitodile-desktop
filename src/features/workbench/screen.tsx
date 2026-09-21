import { GitCompare } from "lucide-react";

import { preloadChangesPanel } from "../changes";
import { preloadHistoryScreen } from "../history";
import { createLazyScreenContainer, type ScreenModule } from "../../runtime/screen/module";

const container = createLazyScreenContainer(
  () => import("./WorkbenchScreen"),
  (module) => module.WorkbenchScreen,
);

export const WorkbenchScreen = container.Component;

/** Work: what has changed and what has been saved, as two tabs of one screen.
 * The panels are chunks of their own features, so the idle prefetch lists them
 * here — the same rule that keeps every screen's chunks warm before the first
 * visit. */
export const workbenchScreenModule = {
  kind: "screen",
  id: "workbench",
  section: "project",
  labelKey: "navWork",
  disabledLabelKey: "navWorkTitle",
  commandLabelKey: "commandGoWork",
  icon: <GitCompare />,
  requiresProject: true,
  inCompactNav: true,
  container,
  additionalPreloads: [preloadChangesPanel, preloadHistoryScreen],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
  performanceBudget: { warmSwitchWarningMs: 40, warmSwitchFailureMs: 50, maxVisibleDescendants: 1200 },
} as const satisfies ScreenModule;
