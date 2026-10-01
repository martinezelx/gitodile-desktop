import { createLazyScreenContainer } from "../../runtime/screen/module";

/** History is a view of the Work screen (task 126), not a screen of its own,
 * so this is the lazy chunk and its preload rather than a registry entry. The
 * workbench module lists the preload so the idle prefetch still warms it. */
const container = createLazyScreenContainer(
  () => import("./HistoryScreen"),
  (module) => module.HistoryScreen,
);

export const HistoryScreen = container.Component;
export const preloadHistoryScreen = container.preload;
