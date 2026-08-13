import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startThemeFade, startThemeReveal } from "./themeTransition";

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

function originAt(left: number, top: number, size: number): HTMLElement {
  const element = document.createElement("button");
  element.getBoundingClientRect = () =>
    ({ left, top, width: size, height: size, right: left + size, bottom: top + size }) as DOMRect;
  return element;
}

const root = document.documentElement;

beforeEach(() => {
  setReducedMotion(false);
  window.innerWidth = 1000;
  window.innerHeight = 600;
});

afterEach(() => {
  delete root.dataset.themeTransition;
  root.removeAttribute("style");
  Reflect.deleteProperty(document, "startViewTransition");
});

describe("theme transitions", () => {
  it("applies the change untouched when the platform has no view transitions", () => {
    const apply = vi.fn();
    startThemeReveal(originAt(0, 0, 10), apply);

    expect(apply).toHaveBeenCalledOnce();
    expect(root.dataset.themeTransition).toBeUndefined();
  });

  it("skips the animation outright under reduced motion", () => {
    const { transitions } = stubViewTransitions();
    setReducedMotion(true);
    const apply = vi.fn();

    startThemeReveal(originAt(0, 0, 10), apply);
    startThemeFade(apply);

    expect(apply).toHaveBeenCalledTimes(2);
    expect(transitions).toHaveLength(0);
    expect(root.dataset.themeTransition).toBeUndefined();
  });

  it("anchors the reveal on the origin and reaches the furthest corner", () => {
    stubViewTransitions();
    // Centre lands at (198, 22); the far corner is bottom-left of that point.
    startThemeReveal(originAt(180, 4, 36), vi.fn());

    expect(root.dataset.themeTransition).toBe("reveal");
    expect(root.style.getPropertyValue("--theme-reveal-x")).toBe("198px");
    expect(root.style.getPropertyValue("--theme-reveal-y")).toBe("22px");
    expect(Number.parseFloat(root.style.getPropertyValue("--theme-reveal-radius"))).toBeCloseTo(
      Math.hypot(802, 578),
      3,
    );
  });

  it("tags the mode before capture so the outgoing snapshot matches the incoming one", () => {
    stubViewTransitions();
    const modeAtCapture = vi.fn(() => root.dataset.themeTransition);

    startThemeReveal(originAt(0, 0, 10), modeAtCapture);

    expect(modeAtCapture).toHaveReturnedWith("reveal");
  });

  it("falls back to the top edge when the origin element is gone", () => {
    stubViewTransitions();
    // React refs are nullable: a reveal without an anchor still has to sweep the
    // whole window rather than divide by an absent rect.
    startThemeReveal(null, vi.fn());

    expect(root.style.getPropertyValue("--theme-reveal-x")).toBe("500px");
    expect(root.style.getPropertyValue("--theme-reveal-y")).toBe("0px");
    expect(Number.parseFloat(root.style.getPropertyValue("--theme-reveal-radius"))).toBeCloseTo(
      Math.hypot(500, 600),
      3,
    );
  });

  it("fades without an origin when the change has no anchor point", () => {
    stubViewTransitions();

    startThemeFade(vi.fn());

    expect(root.dataset.themeTransition).toBe("fade");
    expect(root.style.getPropertyValue("--theme-reveal-x")).toBe("");
  });

  it("clears the root once the animation ends", async () => {
    const { transitions } = stubViewTransitions();
    startThemeReveal(originAt(180, 4, 36), vi.fn());

    transitions[0].finish();
    await Promise.resolve();
    await Promise.resolve();

    expect(root.dataset.themeTransition).toBeUndefined();
    expect(root.style.getPropertyValue("--theme-reveal-radius")).toBe("");
  });

  it("lets a second change interrupt the first without stripping its own state", async () => {
    const { transitions } = stubViewTransitions();

    startThemeReveal(originAt(180, 4, 36), vi.fn());
    startThemeFade(vi.fn());
    expect(transitions[0].skipTransition).toHaveBeenCalledOnce();

    // The interrupted transition settles late; the newer one owns the root now.
    transitions[0].finish();
    await Promise.resolve();
    await Promise.resolve();

    expect(root.dataset.themeTransition).toBe("fade");
  });
});
