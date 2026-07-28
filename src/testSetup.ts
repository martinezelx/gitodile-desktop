import "@testing-library/jest-dom/vitest";

// jsdom has no real layout engine, so every element reports a zero-size
// bounding rect by default. `@tanstack/react-virtual` (used by the diff
// viewer in `changes.tsx` to render only on-screen lines of a large file)
// uses that rect to decide how many rows fit in the viewport — with a
// zero-height viewport it would render nothing, and any test asserting on
// diff line content would fail even though the component works correctly in
// a real browser. Giving every element a fixed, reasonable size to measure
// against fixes that without needing to mock the virtualizer itself.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

const STUBBED_RECT: DOMRect = {
  width: 1024,
  height: 768,
  top: 0,
  left: 0,
  right: 1024,
  bottom: 768,
  x: 0,
  y: 0,
  toJSON() {
    return this;
  },
};

Element.prototype.getBoundingClientRect = () => STUBBED_RECT;

// `getBoundingClientRect` alone isn't enough: jsdom also defines
// `offsetHeight`/`clientHeight` (and their `*Width` counterparts) as getters
// hardcoded to 0, and the virtualizer reads those directly for the
// scrollable container's viewport size.
for (const property of ["offsetHeight", "offsetWidth", "clientHeight", "clientWidth"] as const) {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true,
    get() {
      return property.endsWith("Height") ? STUBBED_RECT.height : STUBBED_RECT.width;
    },
  });
}
