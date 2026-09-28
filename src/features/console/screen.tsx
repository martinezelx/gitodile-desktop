import { SquareTerminal } from "lucide-react";
import { createLazyScreenContainer, type ScreenModule } from "../../runtime/screen/module";

const container = createLazyScreenContainer(() => import("./ConsoleScreen"), (module) => module.ConsoleScreen);
export const ConsoleScreen = container.Component;

export const consoleScreenModule = {
  kind: "screen",
  id: "console",
  section: "project",
  labelKey: "navConsole",
  disabledLabelKey: "navConsoleTitle",
  commandLabelKey: "commandGoConsole",
  icon: <SquareTerminal />,
  requiresProject: true,
  inCompactNav: true,
  container,
  additionalPreloads: [],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
  performanceBudget: { warmSwitchWarningMs: 40, warmSwitchFailureMs: 50, maxVisibleDescendants: 1000 },
} as const satisfies ScreenModule;
