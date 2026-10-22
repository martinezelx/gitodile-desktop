import { describe, expect, it } from "vitest";

import { getFocusableElements } from "./modalFocus";

describe("dialog focus order", () => {
  it("skips controls that cannot take focus, including those inside a hidden ancestor", () => {
    const dialog = document.createElement("div");
    dialog.innerHTML = `
      <button id="first">First</button>
      <button id="disabled" disabled>Disabled</button>
      <button id="roving" tabindex="-1">Roving</button>
      <button id="self-hidden" hidden>Hidden</button>
      <div hidden><button id="folded">Folded</button></div>
      <input id="last" />`;
    expect(getFocusableElements(dialog).map((element) => element.id)).toEqual(["first", "last"]);
  });
});
