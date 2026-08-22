import { GitCommitHorizontal } from "lucide-react";
import { createLazyScreenContainer, type ScreenModule } from "../../screenModule";

const container = createLazyScreenContainer(
  () => import("./HistoryScreen"),
  (module) => module.HistoryScreen,
);

export const HistoryScreen = container.Component;

export const historyScreenModule = {
  kind: "screen",
  id: "history",
  section: "project",
  labelKey: "navHistory",
  disabledLabelKey: "navHistoryTitle",
  commandLabelKey: "commandGoHistory",
  icon: <GitCommitHorizontal />,
  requiresProject: true,
  inCompactNav: true,
  container,
  additionalPreloads: [],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
  performanceBudget: { warmSwitchWarningMs: 40, warmSwitchFailureMs: 50, maxVisibleDescendants: 400 },
} as const satisfies ScreenModule;
