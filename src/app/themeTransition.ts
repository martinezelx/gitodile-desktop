import { flushSync } from "react-dom";

/** Theme changes animate differently depending on which control asked for them.
 *
 * - `reveal`: the titlebar toggle is a single control at a known point, so the
 *   incoming theme is wiped in from it and the change reads as caused by that
 *   button.
 * - `fade`: Settings and the command palette offer a three-way choice from
 *   inside a dialog. A wipe anchored there would sweep across the very panel
 *   the user is reading, and "system" has no direction to come from, so the
 *   window cross-fades as one.
 *
 * Both modes tag the document element with `data-theme-transition` for the
 * duration of the animation; the choreography lives in
 * `styles/theme-transition.css`. */

type ThemeTransitionMode = "reveal" | "fade";

const ORIGIN_PROPERTIES = ["--theme-reveal-x", "--theme-reveal-y", "--theme-reveal-radius"] as const;

/** The change in flight, if any. Without this, a second toggle's cleanup would
 * race the first one and strip the root attribute mid-animation. */
let activeTransition: ViewTransition | null = null;

/** No view transitions under jsdom, and reduced motion means skipping the
 * animation outright rather than running it at zero duration. */
function prefersInstantChange(): boolean {
  return (
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function revealCenter(origin: HTMLElement | null): { x: number; y: number } {
  if (!origin) return { x: window.innerWidth / 2, y: 0 };
  const rect = origin.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Distance from the origin to the furthest window corner: the radius at which
 * the circle has covered every pixel, so the sweep never stops short. */
function revealRadius(x: number, y: number): number {
  return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
}

function begin(mode: ThemeTransitionMode, applyPreference: () => void): void {
  const root = document.documentElement;
  activeTransition?.skipTransition();
  // Set before the transition starts so the outgoing capture already carries the
  // mode — the toggle icon opts into its own layer through this attribute.
  root.dataset.themeTransition = mode;

  // `flushSync` so React's own part of the change (the toggle swapping its
  // sun/moon glyph) lands in the captured new state instead of committing
  // afterwards and popping into place.
  const transition = document.startViewTransition(() => flushSync(applyPreference));
  activeTransition = transition;

  const finish = (): void => {
    if (activeTransition !== transition) return; // a newer change owns the root now
    activeTransition = null;
    delete root.dataset.themeTransition;
    for (const property of ORIGIN_PROPERTIES) root.style.removeProperty(property);
  };
  transition.finished.then(finish, finish);
}

/** Circular wipe of the incoming theme, growing from `origin`. */
export function startThemeReveal(origin: HTMLElement | null, applyPreference: () => void): void {
  if (prefersInstantChange()) {
    applyPreference();
    return;
  }
  const root = document.documentElement;
  const { x, y } = revealCenter(origin);
  root.style.setProperty("--theme-reveal-x", `${x}px`);
  root.style.setProperty("--theme-reveal-y", `${y}px`);
  root.style.setProperty("--theme-reveal-radius", `${revealRadius(x, y)}px`);
  begin("reveal", applyPreference);
}

/** Whole-window cross-fade, for theme changes with no meaningful origin point. */
export function startThemeFade(applyPreference: () => void): void {
  if (prefersInstantChange()) {
    applyPreference();
    return;
  }
  begin("fade", applyPreference);
}
