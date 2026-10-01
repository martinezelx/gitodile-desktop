import assert from "node:assert/strict";
import test from "node:test";

import { asciiArt, flattenPath } from "./ascii-art.mjs";

const ramp = " .:-=+*#%@";
const tones = {
  "#00ff00": { tone: 1, weight: 0.55 },
  "#000000": { tone: 2, weight: 1 },
  "#ffffff": { tone: 0, weight: 0 },
};

test("flattens absolute paths into closed and open polylines", () => {
  const [square, line] = flattenPath("M0 0 L10 0 L10 10 L0 10 Z M0 20 H10 V30");
  assert.equal(square.closed, true);
  assert.deepEqual(square.points, [[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.equal(line.closed, false);
  assert.deepEqual(line.points.at(-1), [10, 30]);
  assert.throws(() => flattenPath("m0 0 l10 0"), /Relative/);
});

test("shades each cell by its weighted ink, tones it by the heaviest colour and trims empty edges", () => {
  const nodes = [
    ["path", { d: "M10 10 L30 10 L30 30 L10 30 Z", fill: "#00ff00" }],
    ["path", { d: "M30 10 L40 10 L40 20 L30 20 Z", fill: "#00ff00" }],
    // A white hole takes a corner out of each inner cell: less ink, lighter glyph.
    ["circle", { cx: 20, cy: 20, r: 4, fill: "#ffffff" }],
  ];
  const art = asciiArt(nodes, { x: 0, y: 0, width: 40, height: 40 }, { columns: 4, cellAspect: 1, tones, ramp });
  assert.deepEqual(art.text, ["==+", "== "]);
  assert.deepEqual(art.tones, ["111", "110"]);
  // The cover counts the white hole as drawing: only the empty corner is open.
  assert.deepEqual(art.cover, ["111", "110"]);
});

test("the outline prints densest and takes the cell's tone", () => {
  const nodes = [
    ["path", { d: "M0 0 L40 0 L40 20 L0 20 Z", fill: "#00ff00" }],
    ["path", { d: "M0 10 H40", fill: "none", stroke: "#000000", "stroke-width": 20 }],
  ];
  const art = asciiArt(nodes, { x: 0, y: 0, width: 40, height: 20 }, { columns: 4, cellAspect: 2, tones, ramp });
  assert.deepEqual(art.text, Array(4).fill("@@@@"));
  assert.deepEqual(art.tones, Array(4).fill("2222"));
});

test("strokeScale widens every stroke before sampling", () => {
  const nodes = [["path", { d: "M0 20 H40", fill: "none", stroke: "#000000", "stroke-width": 4 }]];
  const box = { x: 0, y: 0, width: 40, height: 40 };
  const thin = asciiArt(nodes, box, { columns: 4, cellAspect: 1, tones, ramp });
  const wide = asciiArt(nodes, box, { columns: 4, cellAspect: 1, tones, ramp, strokeScale: 5 });
  assert.ok(wide.text.join("").split("").filter((ch) => ch === "@").length > thin.text.join("").split("").filter((ch) => ch === "@").length);
});

test("rejects colours without a tone", () => {
  const nodes = [["circle", { cx: 5, cy: 5, r: 5, fill: "#ff0000" }]];
  assert.throws(() => asciiArt(nodes, { x: 0, y: 0, width: 10, height: 10 }, { columns: 2, cellAspect: 1, tones, ramp }), /has no ASCII tone/);
});
