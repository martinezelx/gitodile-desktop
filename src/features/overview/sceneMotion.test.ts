import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { playSceneTransition, sameSceneFacts, type SceneFacts } from "./sceneMotion";

const SYNCED: SceneFacts = { outgoing: 0, incoming: 0, synced: true, unknown: false, hasRemote: true };

function scene({ out = 0, inc = 0, synced = false, unknown = false }: { out?: number; inc?: number; synced?: boolean; unknown?: boolean }): HTMLElement {
  const element = document.createElement("section");
  const dots = [
    ...Array.from({ length: out }, () => '<i class="work-scene__dot work-scene__dot--out"></i>'),
    ...Array.from({ length: inc }, () => '<i class="work-scene__dot work-scene__dot--in"></i>'),
  ].join("");
  element.innerHTML = `
    <div class="work-scene__row">
      <span class="work-scene__place work-scene__place--here">${out ? `<span class="work-scene__badge">${out}</span>` : ""}</span>
      <span class="work-scene__path">
        ${synced ? '<span class="work-scene__mark"></span>' : ""}
        ${unknown ? '<span class="work-scene__mark work-scene__mark--unknown">?</span>' : ""}
        ${dots ? `<span class="work-scene__dots">${dots}</span>` : ""}
      </span>
      <span class="work-scene__place work-scene__place--remote">${inc ? `<span class="work-scene__badge">${inc}</span>` : ""}</span>
    </div>`;
  document.body.appendChild(element);
  return element;
}

let animated: Element[];

beforeEach(() => {
  animated = [];
  HTMLElement.prototype.animate = vi.fn(function (this: HTMLElement) {
    animated.push(this);
    return { finished: new Promise(() => {}) } as unknown as Animation;
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  delete document.documentElement.dataset.reducedMotion;
  // jsdom has no Web Animations; the stub goes with the test.
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

describe("playSceneTransition", () => {
  it("sends published versions to the remote and confirms the match", () => {
    const element = scene({ synced: true });
    playSceneTransition(element, { ...SYNCED, outgoing: 2, synced: false }, SYNCED);

    expect(element.querySelectorAll(".work-scene__dot--ghost.work-scene__dot--out")).toHaveLength(2);
    expect(element.querySelector(".work-scene__place--here .work-scene__badge")).toHaveTextContent("2");
    expect(animated).toContain(element.querySelector(".work-scene__mark"));
  });

  it("brings new versions in from the remote once a check finds them", () => {
    const element = scene({ inc: 2 });
    playSceneTransition(element, SYNCED, { ...SYNCED, incoming: 2, synced: false });

    const arriving = Array.from(element.querySelectorAll(".work-scene__dot--in:not(.work-scene__dot--ghost)"));
    expect(arriving.every((dot) => animated.includes(dot))).toBe(true);
    expect(animated).toContain(element.querySelector(".work-scene__place--remote .work-scene__badge"));
    // The check that no longer holds fades from where it stood.
    expect(element.querySelector(".work-scene__mark")).not.toBeNull();
  });

  it("swaps the check for a question when the remote cannot be asked", () => {
    const element = scene({ unknown: true });
    playSceneTransition(element, SYNCED, { ...SYNCED, synced: false, unknown: true });

    expect(animated).toContain(element.querySelector(".work-scene__mark--unknown:not([aria-hidden])"));
  });

  it("stays still when the reader has asked for reduced motion", () => {
    document.documentElement.dataset.reducedMotion = "true";
    const element = scene({ synced: true });
    playSceneTransition(element, { ...SYNCED, outgoing: 2, synced: false }, SYNCED);

    expect(animated).toHaveLength(0);
    expect(element.querySelector(".work-scene__dot--ghost")).toBeNull();
  });
});

describe("sameSceneFacts", () => {
  it("tells a redraw from a change", () => {
    expect(sameSceneFacts(SYNCED, { ...SYNCED })).toBe(true);
    expect(sameSceneFacts(SYNCED, { ...SYNCED, hasRemote: false })).toBe(false);
  });
});
