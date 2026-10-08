import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { BRAND_ICON_SIZES, parseIcns } from "./generate-icons.mjs";
import { brandSourceSvg, generatedFiles, iconSourceSvg, installerSourceSvg, mascotSvg, variantNames } from "./mascot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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

test("both icon sources are the same portrait on the slate tile, at a different margin", () => {
  const tile = (svg) => svg.match(/<rect x="(\d+)" y="\d+" width="(\d+)"/).slice(1).map(Number);
  const flat = iconSourceSvg({ platform: "default" });
  const mac = iconSourceSvg({ platform: "macos" });
  for (const svg of [flat, mac]) {
    assert.match(svg, /width="1024" height="1024" viewBox="0 0 1024 1024"/);
    assert.match(svg, /linearGradient id="tile"/);
    assert.match(svg, /clip-path="url\(#tile-shape\)"/);
  }
  assert.deepEqual(tile(mac), [100, 824], "macOS sits on Apple's 824px grid");
  assert.ok(tile(flat)[1] > tile(mac)[1], "Windows and Linux fill more of the canvas");
});

test("the installer sources draw their image in the corner of a square slate canvas", () => {
  const sidebar = installerSourceSvg("sidebar", { width: 164, height: 314 });
  assert.match(sidebar, /width="314" height="314"/);
  assert.match(sidebar, /<rect width="164" height="314" fill="url\(#slate\)"\/>/);
  const header = installerSourceSvg("header", { width: 150, height: 57 });
  assert.match(header, /width="150" height="150"/);
  assert.match(header, /<rect width="150" height="57" fill="url\(#slate\)"\/>/);
  assert.throws(() => installerSourceSvg("banner", { width: 1, height: 1 }), /unknown installer image/);
});

test("the brand sources and variants render as standalone SVGs", () => {
  for (const name of variantNames) {
    assert.match(mascotSvg(name), /^<svg [^>]*viewBox="[-\d. ]+"/);
    const square = brandSourceSvg(name);
    assert.match(square, /width="1024" height="1024"/);
    assert.doesNotMatch(square, /linearGradient/);
  }
  assert.deepEqual(BRAND_ICON_SIZES, [16, 24, 32, 48, 64, 128, 256, 512, 1024]);
});
