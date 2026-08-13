import { Settings } from "lucide-react";

import type { ScreenModule } from "../../screenModule";

/** Settings is registered here for the same reason every screen is registered
 * beside its feature: nav, the command palette and the compact nav all derive
 * from this one entry.
 *
 * The panel itself is eagerly exported by the barrel. Task 046 code-split it
 * for 2.4 kB of entry headroom and task 055 undid that once the headroom was
 * ~107 kB; see AGENTS.md for why an overlay cannot hide a lazy boundary. */
export const settingsOverlayModule = {
  kind: "overlay",
  id: "settings",
  section: "application",
  labelKey: "navSettings",
  icon: <Settings />,
  inCompactNav: true,
  commandLabelKey: "commandGoSettings",
  overlay: "settings",
} as const satisfies ScreenModule;
