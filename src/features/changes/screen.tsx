import { createLazyScreenContainer } from "../../runtime/screen/module";

/** Changes is a view of the Work screen (task 126), not a screen of its own,
 * so this is the lazy chunk and its preload rather than a registry entry. The
 * workbench module lists the preload so the idle prefetch still warms it. */
const container = createLazyScreenContainer(
  () => import("./ChangesPanel"),
  (module) => module.ChangesPanel,
);

export const ChangesPanel = container.Component;
export const preloadChangesPanel = container.preload;
