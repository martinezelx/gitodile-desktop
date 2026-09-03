import { flushSync } from "react-dom";

/** Theme changes cross-fade the whole window.
 *
 * Every control that changes the theme — the titlebar toggle, Settings and the
 * command palette — animates the same way. The titlebar toggle used to get a
 * circular wipe anchored on the button instead, on the theory that a change
 * caused by one control should look like it came from there. It was withdrawn:
 * the wipe's origin never read as the button it was anchored to, and the sweep
 * spent most of its time crossing a single corner of the window, because the
 * curve paced a radius the way it would pace a position. The fade has none of
 * that geometry to get wrong, and "system" — which Settings offers and which has
 * no direction to come from — was always going to need it anyway.
 *
 * The document element carries `data-theme-transition` for the duration; the
 * choreography lives in `styles/theme-transition.css`. */

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

/** Whole-window cross-fade of the incoming theme. */
export function startThemeFade(applyPreference: () => void): void {
  if (prefersInstantChange()) {
    applyPreference();
    return;
  }
  const root = document.documentElement;
  activeTransition?.skipTransition();
  // Set before the transition starts so the outgoing capture already carries
  // the attribute, and the two halves of the pair are styled alike.
  root.dataset.themeTransition = "fade";

  // `flushSync` so React's own part of the change (the toggle swapping its
  // sun/moon glyph) lands in the captured new state instead of committing
  // afterwards and popping into place.
  const transition = document.startViewTransition(() => flushSync(applyPreference));
  activeTransition = transition;

  const finish = (): void => {
    if (activeTransition !== transition) return; // a newer change owns the root now
    activeTransition = null;
    delete root.dataset.themeTransition;
  };
  transition.finished.then(finish, finish);
}
