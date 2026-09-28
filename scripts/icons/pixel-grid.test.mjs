import assert from "node:assert/strict";
import test from "node:test";

import { flattenPath, pixelGrid } from "./pixel-grid.mjs";

const palette = ["#00ff00", "#000000", "#ffffff"];

test("flattens absolute paths into closed and open polylines", () => {
  const [square, line] = flattenPath("M0 0 L10 0 L10 10 L0 10 Z M0 20 H10 V30");
  assert.equal(square.closed, true);
  assert.deepEqual(square.points, [[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.equal(line.closed, false);
  assert.deepEqual(line.points.at(-1), [10, 30]);
  assert.throws(() => flattenPath("m0 0 l10 0"), /Relative/);
});

test("paints fills, then strokes, in document order and trims empty edges", () => {
  const nodes = [
    ["path", { d: "M10 10 L30 10 L30 30 L10 30 Z", fill: "#00ff00", stroke: "none" }],
    ["circle", { cx: 20, cy: 20, r: 6, fill: "#ffffff" }],
  ];
  const grid = pixelGrid(nodes, { x: 0, y: 0, width: 40, height: 40 }, { columns: 8, palette });
  assert.deepEqual(grid, ["1111", "1331", "1331", "1111"]);
});

test("strokes cover half their width on each side of the line", () => {
  const nodes = [["path", { d: "M0 20 H40", fill: "none", stroke: "#000000", "stroke-width": 10 }]];
  const grid = pixelGrid(nodes, { x: 0, y: 0, width: 40, height: 40 }, { columns: 8, palette });
  assert.deepEqual(grid, ["22222222", "22222222"]);
});

test("rejects colours outside the palette", () => {
  const nodes = [["circle", { cx: 5, cy: 5, r: 5, fill: "#ff0000" }]];
  assert.throws(() => pixelGrid(nodes, { x: 0, y: 0, width: 10, height: 10 }, { columns: 2, palette }), /not in the pixel palette/);
});
