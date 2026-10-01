import { FolderGit2 } from "lucide-react";
import { createEagerScreenContainer, type ScreenModule } from "../../runtime/screen/module";
import { HomeScreen as HomeScreenComponent } from "./HomeScreen";

const container = createEagerScreenContainer(HomeScreenComponent);
export const HomeScreen = container.Component;

export const homeScreenModule = {
  kind: "screen",
  id: "home",
  section: "application",
  labelKey: "navHome",
  disabledLabelKey: null,
  commandLabelKey: "commandGoHome",
  icon: <FolderGit2 />,
  requiresProject: false,
  inCompactNav: false,
  inRail: false,
  container,
  additionalPreloads: [],
  lifecycle: { hidden: "retain-suspended", evict: "application-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
} as const satisfies ScreenModule;
