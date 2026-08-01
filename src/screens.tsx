import React, { Profiler, lazy, useEffect, useLayoutEffect, useRef } from "react";
import { GitBranch, GitCommitHorizontal, GitCompare, LayoutDashboard, LifeBuoy, Settings2 } from "lucide-react";

import type { Translations } from "./i18n";
import type { ProjectView } from "./projectSessions";

/** Every screen the app can show. `ProjectView` stays the source of truth for
 * the per-project ones, so `ProjectSession`'s view history keeps type-checking
 * against this. Settings is app-level and never enters that history. */
export type ScreenId = ProjectView | "settings";

/** Nav destinations include screens that do not exist yet (History, Recovery).
 * They live in the same table so a destination cannot be half-registered: when
 * task 015 builds History, it flips one entry from `screen: null` to a screen
 * id and gets nav, palette, prefetch, and keep-alive at once. */
export type NavDestinationId = ScreenId | "history" | "recovery";

/** Keys of `Translations` whose value is a plain string, so a registry entry
 * can name a label without being able to point at a formatting function. */
type TextKey = { [K in keyof Translations]: Translations[K] extends string ? K : never }[keyof Translations];

export type NavDestination = {
  id: NavDestinationId;
  /** `null` for a destination that is announced but not built yet. Anything
   * with a screen id is mounted and kept alive by `KeepAliveScreens`. */
  screen: ScreenId | null;
  /** Which sidebar `<nav>` the entry belongs to. */
  section: "project" | "application";
  labelKey: TextKey;
  /** Tooltip and accessible name while the entry is disabled — it has to
   * explain *why* it is disabled, per AGENTS.md's "never hide consequences". */
  disabledLabelKey: TextKey | null;
  icon: React.JSX.Element;
  /** Disabled until a project is open, and left automatically if the project
   * closes while the screen is showing. */
  requiresProject: boolean;
  /** Narrow windows show a reduced nav; `false` keeps an entry out of it. */
  inCompactNav: boolean;
  /** Command palette label, or `null` to stay out of the palette. */
  commandLabelKey: TextKey | null;
  /** Chunks this destination needs, warmed during idle after first paint so
   * the first visit is a cache hit rather than a fetch (task 018's rule).
   * Listing them per destination rather than in one flat list is what stops a
   * new screen from silently shipping without a prefetch, which is exactly
   * what happened to the Version-lines chunks between tasks 016 and 019. */
  prefetch: (() => Promise<unknown>)[];
};

/** Lazily loaded: neither is needed for first paint (Overview with no project
 * open), and both pull in the file-type icon set. Owned here rather than in
 * `main.tsx` so the registry entry and the component it refers to sit
 * together. */
export const ChangesPanel = lazy(() => import("./changes").then((m) => ({ default: m.ChangesPanel })));
export const VersionLinesPanel = lazy(() =>
  import("./versionLinesPanel").then((m) => ({ default: m.VersionLinesPanel })),
);

/** The single place a screen is registered. Nav (expanded and compact), the
 * command palette, idle prefetching, the "leave if the project closed" guard,
 * and the keep-alive host all derive from this array — adding a screen means
 * adding an entry here and a component, and nothing else. Order is the order
 * the sidebar shows. */
export const NAV_DESTINATIONS: NavDestination[] = [
  {
    id: "overview",
    screen: "overview",
    section: "project",
    labelKey: "navOverview",
    disabledLabelKey: null,
    icon: <LayoutDashboard />,
    requiresProject: false,
    inCompactNav: true,
    commandLabelKey: "commandGoOverview",
    // Overview hosts the pending-versions section, the publish flow, and the
    // quick switch/create dialogs, so those chunks belong to it.
    prefetch: [() => import("./pendingVersions"), () => import("./publishDialog"), () => import("./versionLinesDialog")],
  },
  {
    id: "changes",
    screen: "changes",
    section: "project",
    labelKey: "navChanges",
    disabledLabelKey: "navChangesTitle",
    icon: <GitCompare />,
    requiresProject: true,
    inCompactNav: true,
    commandLabelKey: "navChanges",
    prefetch: [() => import("./changes")],
  },
  {
    id: "version-lines",
    screen: "version-lines",
    section: "project",
    labelKey: "navVersionLines",
    disabledLabelKey: "navVersionLinesTitle",
    icon: <GitBranch />,
    requiresProject: true,
    inCompactNav: true,
    commandLabelKey: "commandGoVersionLines",
    prefetch: [() => import("./versionLinesPanel"), () => import("./versionLinesDialog")],
  },
  {
    id: "history",
    screen: null,
    section: "project",
    labelKey: "navHistory",
    disabledLabelKey: "navHistoryTitle",
    icon: <GitCommitHorizontal />,
    requiresProject: true,
    inCompactNav: false,
    commandLabelKey: null,
    prefetch: [],
  },
  {
    id: "recovery",
    screen: null,
    section: "project",
    labelKey: "navRecovery",
    disabledLabelKey: "navRecoveryTitle",
    icon: <LifeBuoy />,
    requiresProject: true,
    inCompactNav: false,
    commandLabelKey: null,
    prefetch: [],
  },
  {
    id: "settings",
    screen: "settings",
    section: "application",
    labelKey: "navSettings",
    disabledLabelKey: null,
    icon: <Settings2 />,
    requiresProject: false,
    inCompactNav: true,
    commandLabelKey: "commandGoSettings",
    prefetch: [],
  },
];

/** Screen ids in nav order, which is also the DOM order the keep-alive host
 * mounts them in. */
export const SCREEN_ORDER: ScreenId[] = NAV_DESTINATIONS.flatMap((destination) =>
  destination.screen ? [destination.screen] : [],
);

const SCREENS_REQUIRING_PROJECT = new Set<ScreenId>(
  NAV_DESTINATIONS.flatMap((destination) =>
    destination.screen && destination.requiresProject ? [destination.screen] : [],
  ),
);

export function screenRequiresProject(screen: ScreenId): boolean {
  return SCREENS_REQUIRING_PROJECT.has(screen);
}

/** Warms every registered destination's chunks. Called from an idle callback
 * after first paint — never before it, which would defeat the code splitting
 * this exists to compensate for. */
export function prefetchScreenChunks(): void {
  for (const destination of NAV_DESTINATIONS) {
    for (const load of destination.prefetch) {
      void load();
    }
  }
}

/** Development builds only, and never under the test runner. Excluded from
 * production bundles by the `import.meta.env` checks, which Vite resolves
 * statically. Profiling is opt-in because React's Profiler and per-switch
 * logging both add work to the interaction they measure. Run with
 * `VITE_PROFILE_SCREEN_SWITCHES=true pnpm tauri dev` to collect numbers. */
const MEASURE_SWITCHES =
  import.meta.env.DEV &&
  import.meta.env.MODE !== "test" &&
  import.meta.env.VITE_PROFILE_SCREEN_SWITCHES === "true";

/** State of the switch currently being measured. Module-level because the
 * click, the commit, and the painted frame happen in three different places. */
let switchIntentAt: number | null = null;
let switchFrom: ScreenId | null = null;
let switchTo: ScreenId | null = null;
/** Set by the inner profiler, read by the outer one. React fires nested
 * `onRender` callbacks child-first, so this is always the current commit's
 * value by the time the app-level report runs. */
let screensRenderMs = 0;

export function markScreenSwitchIntent(from: ScreenId, to: ScreenId): void {
  if (MEASURE_SWITCHES) {
    switchIntentAt = performance.now();
    switchFrom = from;
    switchTo = to;
  }
}

/** Breaks a screen switch into the costs that are easily confused for each
 * other, because guessing which one dominates has already been wrong twice:
 *
 * - `app` — React rendering the whole tree for this commit. Switching screens
 *   re-renders `App` itself: sidebar, project switcher, palette command list,
 *   dialog wrappers. That work is the same size whichever screen you land on,
 *   which is what a cost that does not scale with the screen looks like.
 * - `screens` — the part of `app` spent inside the screen host, so the two
 *   together say whether the cost is the screen or everything around it.
 * - `paint` — from the commit to the browser having painted the next frame:
 *   style, layout, and paint.
 * - `total` — from the click to that painted frame. Anything outside React's
 *   render (event handling, effects, forced reflow, waiting on IPC) shows up
 *   as the gap between `total` and the rest.
 *
 * Wrap the whole app in this, not just the screens — measuring only the screen
 * subtree is what hid the constant per-switch cost in the first place.
 *
 * Run `pnpm tauri dev`, switch screens, and read the console. Long animation
 * frames are logged too where the engine supports the API, which attributes a
 * slow frame to script vs. style-and-layout. */
export function SwitchMeasurementRoot({ children }: { children: React.ReactNode }): React.JSX.Element {
  useEffect(() => {
    if (!MEASURE_SWITCHES || !("PerformanceObserver" in window)) {
      return undefined;
    }
    if (!PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
      return undefined;
    }
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const frame = entry as PerformanceEntry & { renderStart?: number; styleAndLayoutStart?: number };
        const script = frame.renderStart ? frame.renderStart - frame.startTime : 0;
        const render = frame.styleAndLayoutStart && frame.renderStart ? frame.styleAndLayoutStart - frame.renderStart : 0;
        const styleAndLayout = frame.styleAndLayoutStart
          ? frame.startTime + frame.duration - frame.styleAndLayoutStart
          : 0;
        console.info(
          `[screens] long frame ${frame.duration.toFixed(0)}ms — script ${script.toFixed(0)}ms, ` +
            `render ${render.toFixed(0)}ms, style+layout ${styleAndLayout.toFixed(0)}ms`,
        );
      }
    });
    observer.observe({ type: "long-animation-frame", buffered: true });
    return () => observer.disconnect();
  }, []);

  if (!MEASURE_SWITCHES) {
    return <>{children}</>;
  }

  return (
    <Profiler
      id="app"
      onRender={(_id, _phase, actualDuration) => {
        if (switchIntentAt === null) {
          return;
        }
        const clickedAt = switchIntentAt;
        const from = switchFrom;
        const to = switchTo;
        switchIntentAt = null;
        const committedAt = performance.now();
        const appMs = actualDuration;
        const screensMs = screensRenderMs;
        let reported = false;
        const report = (paintedAt: number | null): void => {
          if (reported) {
            return;
          }
          reported = true;
          const nodes = document.querySelectorAll(".screen-slot:not([hidden]) *").length;
          const paint = paintedAt === null ? "n/a" : `${(paintedAt - committedAt).toFixed(1)}ms`;
          const total = paintedAt === null ? "n/a" : `${(paintedAt - clickedAt).toFixed(1)}ms`;
          console.info(
            `[screens] ${from} → ${to}: app ${appMs.toFixed(1)}ms (screens ${screensMs.toFixed(1)}ms), ` +
              `paint ${paint}, total ${total}, ${nodes} nodes`,
          );
        };
        // Two frames: the first is the one this commit paints in, the second
        // guarantees the browser has finished it. The timeout is the fallback
        // for a window that is not compositing (minimised, or a headless
        // preview), where no frame is produced and paint is unavailable.
        requestAnimationFrame(() => requestAnimationFrame(() => report(performance.now())));
        setTimeout(() => report(null), 500);
      }}
    >
      {children}
    </Profiler>
  );
}

/** Keeps every visited screen mounted and hides the inactive ones, instead of
 * unmounting on navigation.
 *
 * Why: the caches from task 019 made screen data instant, but each switch
 * still rebuilt the screen's DOM from scratch — for Changes that means the
 * whole file list plus a virtualizer remount whose rows measure themselves on
 * first render. Not unmounting is a property this host provides once, rather
 * than an optimisation every future screen has to repeat.
 *
 * Three details carry the behaviour:
 *
 * - **Mount on first visit, not eagerly.** A screen the user never opens costs
 *   nothing, so the first-paint work task 018 protected is untouched.
 * - **Inactive screens are frozen.** Their element from the last time they were
 *   active is re-rendered by identity, so React bails out of that subtree and
 *   an unrelated `App` state change cannot re-render a screen nobody is
 *   looking at. They pick up current props on the frame they become active
 *   again.
 * - **Hidden means gone.** `hidden` plus `inert` keeps an inactive screen out
 *   of the tab order, out of the accessibility tree, and unable to announce
 *   status updates from behind the visible one.
 *
 * Eviction is the caller's job and is done with `key`: keying this host by the
 * active project session drops that session's screens when the project
 * changes or closes, so nothing stale survives and memory does not grow with
 * the number of projects visited. */
export function KeepAliveScreens({
  active,
  screens,
}: {
  active: ScreenId;
  /** The screens available right now. A screen missing from this record (a
   * project-only screen with no project open) is dropped rather than kept
   * alive. */
  screens: Partial<Record<ScreenId, React.ReactNode>>;
}): React.JSX.Element {
  const mounted = (
    <>
      {SCREEN_ORDER.map((id) => (
        <KeepAliveScreenSlot key={id} isActive={id === active} isAvailable={id in screens}>
          {screens[id]}
        </KeepAliveScreenSlot>
      ))}
    </>
  );

  // Reports its own share of the commit so the app-level measurement can say
  // how much of a switch is the screen and how much is everything around it.
  return MEASURE_SWITCHES ? (
    <Profiler
      id="screens"
      onRender={(_id, _phase, actualDuration) => {
        screensRenderMs = actualDuration;
      }}
    >
      {mounted}
    </Profiler>
  ) : (
    mounted
  );
}

/** Owns the committed lifetime of one screen without mutating refs during
 * render. React may start and abandon a concurrent render; only a layout
 * effect proves that a screen was actually committed. The current screen is
 * still rendered on its first visit, while the last committed element is
 * reused by identity after it becomes inactive. */
function KeepAliveScreenSlot({
  isActive,
  isAvailable,
  children,
}: {
  isActive: boolean;
  isAvailable: boolean;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const hasCommittedVisit = useRef(false);
  const lastCommittedElement = useRef<React.ReactNode>(null);

  useLayoutEffect(() => {
    if (!isAvailable) {
      hasCommittedVisit.current = false;
      lastCommittedElement.current = null;
    } else if (isActive) {
      hasCommittedVisit.current = true;
      lastCommittedElement.current = children;
    }
  }, [children, isActive, isAvailable]);

  if (!isAvailable || (!isActive && !hasCommittedVisit.current)) {
    return null;
  }

  return (
    <div className="screen-slot" hidden={!isActive} inert={!isActive}>
      {isActive ? children : lastCommittedElement.current}
    </div>
  );
}
