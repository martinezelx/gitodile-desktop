import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startThemeFade, stopActiveThemeTransition } from "./themeTransition";

/** Stand-in for the real API: jsdom has no view transitions, so the tests drive
 * the capture callback and the `finished` promise by hand. */
function stubViewTransitions(): {
  transitions: Array<{ finish: () => void; skipTransition: ReturnType<typeof vi.fn> }>;
} {
  const transitions: Array<{ finish: () => void; skipTransition: ReturnType<typeof vi.fn> }> = [];
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    writable: true,
    value: (callback: () => void) => {
      callback();
      let finish!: () => void;
      const finished = new Promise<void>((resolve) => {
        finish = () => resolve();
      });
      const controls = { finish, skipTransition: vi.fn() };
      transitions.push(controls);
      return {
        finished,
        ready: finished,
        updateCallbackDone: finished,
        skipTransition: controls.skipTransition,
      };
    },
  });
  return { transitions };
}

function setReducedMotion(reduced: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

const root = document.documentElement;

beforeEach(() => {
  setReducedMotion(false);
});

afterEach(() => {
  delete root.dataset.themeTransition;
  delete root.dataset.themeTransitionGlyph;
  delete root.dataset.reducedMotion;
  root.removeAttribute("style");
  Reflect.deleteProperty(document, "startViewTransition");
});

describe("theme transitions", () => {
  it("applies the change untouched when the platform has no view transitions", () => {
    const apply = vi.fn();
    startThemeFade(apply);

    expect(apply).toHaveBeenCalledOnce();
    expect(root.dataset.themeTransition).toBeUndefined();
  });

  it("skips the animation outright under reduced motion", () => {
    const { transitions } = stubViewTransitions();
    setReducedMotion(true);
    const apply = vi.fn();

    startThemeFade(apply);

    expect(apply).toHaveBeenCalledOnce();
    expect(transitions).toHaveLength(0);
    expect(root.dataset.themeTransition).toBeUndefined();
  });

  it("skips the animation when GitOdile's reduced-motion setting is on", () => {
    const { transitions } = stubViewTransitions();
    root.dataset.reducedMotion = "true";
    const apply = vi.fn();

    startThemeFade(apply);

    expect(apply).toHaveBeenCalledOnce();
    expect(transitions).toHaveLength(0);
  });

  it("tags the root before capture so the outgoing snapshot matches the incoming one", () => {
    stubViewTransitions();
    const modeAtCapture = vi.fn(() => root.dataset.themeTransition);

    startThemeFade(modeAtCapture);

    expect(modeAtCapture).toHaveReturnedWith("fade");
  });

  // A named view-transition layer composites above a modal's blurred backdrop,
  // so the titlebar glyph flashed over the Settings dialog when the theme
  // changed from there. With a modal open the glyph is left unnamed and
  // dissolves with the window instead.
  it("leaves the titlebar glyph unnamed while a modal is open", () => {
    stubViewTransitions();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    const glyphAtCapture = vi.fn(() => root.dataset.themeTransitionGlyph);

    startThemeFade(glyphAtCapture);

    expect(glyphAtCapture).toHaveReturnedWith("off");
    dialog.remove();
  });

  it("gives the titlebar glyph its own layer when no modal is open", () => {
    stubViewTransitions();
    const glyphAtCapture = vi.fn(() => root.dataset.themeTransitionGlyph);

    startThemeFade(glyphAtCapture);

    expect(glyphAtCapture).toHaveReturnedWith(undefined);
  });

  it("leaves no origin geometry on the root", () => {
    stubViewTransitions();

    startThemeFade(vi.fn());

    // The withdrawn reveal wrote three custom properties here. A fade anchors on
    // nothing, so the root carries the attribute and no inline style at all.
    expect(root.getAttribute("style")).toBeNull();
  });

  it("clears the root once the animation ends", async () => {
    const { transitions } = stubViewTransitions();
    startThemeFade(vi.fn());

    transitions[0].finish();
    await Promise.resolve();
    await Promise.resolve();

    expect(root.dataset.themeTransition).toBeUndefined();
  });

  it("clears the glyph flag with the root once a modal-opened change ends", async () => {
    const { transitions } = stubViewTransitions();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);

    startThemeFade(vi.fn());
    expect(root.dataset.themeTransitionGlyph).toBe("off");

    transitions[0].finish();
    await Promise.resolve();
    await Promise.resolve();

    expect(root.dataset.themeTransition).toBeUndefined();
    expect(root.dataset.themeTransitionGlyph).toBeUndefined();
    dialog.remove();
  });

  it("lets a second change interrupt the first without stripping its own state", async () => {
    const { transitions } = stubViewTransitions();

    startThemeFade(vi.fn());
    startThemeFade(vi.fn());
    expect(transitions[0].skipTransition).toHaveBeenCalledOnce();

    // The interrupted transition settles late; the newer one owns the root now.
    transitions[0].finish();
    await Promise.resolve();
    await Promise.resolve();

    expect(root.dataset.themeTransition).toBe("fade");
  });

  it("stops an in-flight snapshot when reduced motion is turned on", () => {
    const { transitions } = stubViewTransitions();
    startThemeFade(vi.fn());

    stopActiveThemeTransition();

    expect(transitions[0].skipTransition).toHaveBeenCalledOnce();
    expect(root.dataset.themeTransition).toBeUndefined();
  });
});
