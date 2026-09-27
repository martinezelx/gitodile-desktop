import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { encodePng, parseIco, writeIco } from "./build-windows-ico.mjs";
import { BODY_MIN_SIZE, mixIcns, mixIco, parseIcns, writeIcns } from "./generate-icons.mjs";
import { generatedFiles, iconSourceSvg, mascotSvg, variantNames } from "./mascot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function square(size, value) {
  return encodePng({ width: size, height: size, rgba: Buffer.alloc(size * size * 4, value) });
}

test("mixIco takes the layers under 48px from the head and keeps the rest", () => {
  const sizes = [32, 16, 24, 48, 64, 256];
  const body = writeIco(sizes.map((size) => ({ width: size, height: size, data: square(size, 1) })));
  const head = writeIco(sizes.map((size) => ({ width: size, height: size, data: square(size, 2) })));
  const mixed = parseIco(mixIco(body, head));
  assert.deepEqual(
    mixed.map((entry) => entry.width),
    sizes,
  );
  for (const entry of mixed) {
    const from = entry.width < BODY_MIN_SIZE ? head : body;
    const expected = parseIco(from).find((layer) => layer.width === entry.width);
    assert.ok(entry.data.equals(expected.data), `${entry.width}px layer`);
  }
});

test("mixIco fails when the head is missing a small layer", () => {
  const body = writeIco([{ width: 16, height: 16, data: square(16, 1) }]);
  const head = writeIco([{ width: 48, height: 48, data: square(48, 2) }]);
  assert.throws(() => mixIco(body, head), /no 16px layer/);
});

test("ICNS round-trips and mixIcns swaps only the 16 and 32px entries", () => {
  const types = ["ic07", "is32", "s8mk", "il32", "l8mk", "ic11", "ic12", "ic10"];
  const make = (fill) => writeIcns(types.map((type) => ({ type, data: Buffer.alloc(12, fill) })));
  const body = make(1);
  assert.deepEqual(
    parseIcns(body).map((entry) => entry.type),
    types,
  );
  assert.equal(body.readUInt32BE(4), body.length);
  const mixed = parseIcns(mixIcns(body, make(2)));
  const fromHead = mixed.filter((entry) => entry.data[0] === 2).map((entry) => entry.type);
  assert.deepEqual(fromHead, ["is32", "s8mk", "il32", "l8mk", "ic11"]);
});

test("the committed ICNS carries every entry and the generated mascot files match mascot.mjs", () => {
  const entries = parseIcns(fs.readFileSync(path.join(root, "src-tauri", "icons", "icon.icns")));
  for (const type of ["is32", "il32", "ic11", "ic12", "ic07", "ic08", "ic09", "ic10"]) {
    assert.ok(
      entries.some((entry) => entry.type === type),
      `icon.icns has ${type}`,
    );
  }
  for (const [file, text] of Object.entries(generatedFiles())) {
    assert.equal(fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n"), text, path.basename(file));
  }
});

test("icon sources are 1024px squares; only the macOS ones carry the tile", () => {
  for (const name of variantNames) {
    assert.match(mascotSvg(name), /^<svg [^>]*viewBox="[\d. ]+"/);
    const flat = iconSourceSvg(name, { tile: false });
    const tiled = iconSourceSvg(name, { tile: true });
    for (const svg of [flat, tiled]) assert.match(svg, /width="1024" height="1024" viewBox="0 0 1024 1024"/);
    assert.doesNotMatch(flat, /linearGradient/);
    assert.match(tiled, /linearGradient/);
  }
});
