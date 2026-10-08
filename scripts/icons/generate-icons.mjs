// Regenerates every platform icon, and the brand PNGs, from the mascot in `mascot.mjs`.
//
// GitOdile has one application icon on every platform and at every size: the
// mascot's portrait on the slate tile (ADR 0018, ADR 0029). Windows and Linux take it
// filling the canvas; macOS takes the same icon on Apple's 824px grid, so the
// Dock can draw its shadow around the tile.
//
// 1. `mascot.mjs` rewrites the in-app SVGs and supplies the 1024px sources,
//    written to a temporary folder.
// 2. `tauri icon` rasterises the default source into a full icon set in
//    `src-tauri/icons`, and the macOS source into a second set whose
//    `icon.icns` replaces the default one. Tauri also emits Android/iOS sets,
//    which GitOdile does not ship.
// 3. `tauri icon --png` renders the brand PNGs under `src/assets/brand`: the
//    icon at every size it ships in, the macOS icon, and the mascot and its
//    head on transparent squares, and the Windows installer's side panel and
//    header, each rendered on a square and cropped to its size.
// 4. `build-windows-ico.mjs` re-encodes the small ICO layers as DIBs (see that
//    file for why).
// 5. `build-nsis-images.mjs` encodes the installer's PNGs as the BMPs NSIS
//    needs.
//
//   pnpm icons

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { crop, images as installerImages } from "./build-nsis-images.mjs";
import { decodePng, encodePng } from "./build-windows-ico.mjs";
import { brandDir, brandSourceSvg, iconSourceSvg, installerSourceSvg } from "./mascot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const iconsDir = path.join(root, "src-tauri", "icons");
const tauri = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

/** Every size the icon ships in, from the 16px ICO layer to the 1024px macOS entry. */
export const BRAND_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

function run(script, args) {
  // Every step is a Node entry point, so no shell (and no .cmd shim) is needed.
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function parseIcns(buffer) {
  if (buffer.toString("latin1", 0, 4) !== "icns") throw new Error("not an ICNS file");
  const entries = [];
  for (let offset = 8; offset + 8 <= buffer.length; ) {
    const type = buffer.toString("latin1", offset, offset + 4);
    const length = buffer.readUInt32BE(offset + 4);
    if (length < 8) throw new Error(`ICNS entry ${type} has an invalid length`);
    entries.push({ type, data: buffer.subarray(offset + 8, offset + length) });
    offset += length;
  }
  return entries;
}

/** Renders `svg` into `sizes` PNGs under `work` and returns their paths, keyed by size. */
function renderPngs(work, name, svg, sizes) {
  const source = path.join(work, `${name}.svg`);
  const out = path.join(work, `${name}-png`);
  fs.writeFileSync(source, svg);
  run(tauri, ["icon", source, "-o", out, "-p", sizes.join(",")]);
  return Object.fromEntries(sizes.map((size) => [size, path.join(out, `${size}x${size}.png`)]));
}

function main() {
  run(path.join(root, "scripts", "icons", "mascot.mjs"), []);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "gitodile-icons-"));
  try {
    const sources = {
      default: { svg: iconSourceSvg({ platform: "default" }), out: iconsDir },
      macos: { svg: iconSourceSvg({ platform: "macos" }), out: path.join(work, "macos") },
    };
    for (const [key, { svg, out }] of Object.entries(sources)) {
      const source = path.join(work, `${key}.svg`);
      fs.writeFileSync(source, svg);
      run(tauri, ["icon", source, "-o", out]);
      for (const mobile of ["android", "ios"]) fs.rmSync(path.join(out, mobile), { recursive: true, force: true });
    }
    fs.copyFileSync(path.join(sources.macos.out, "icon.icns"), path.join(iconsDir, "icon.icns"));

    // Brand PNGs, kept beside the SVGs so they are at hand outside the build.
    const png = path.join(brandDir, "png");
    fs.rmSync(png, { recursive: true, force: true });
    fs.mkdirSync(png, { recursive: true });
    const icon = renderPngs(work, "icon", sources.default.svg, BRAND_ICON_SIZES);
    for (const size of BRAND_ICON_SIZES) fs.copyFileSync(icon[size], path.join(png, `gitodile-icon-${size}.png`));
    const extras = {
      "gitodile-icon-macos.png": renderPngs(work, "icon-macos", sources.macos.svg, [1024])[1024],
      "gitodile-mascot.png": renderPngs(work, "mascot", brandSourceSvg("body"), [1024])[1024],
      "gitodile-mascot-head.png": renderPngs(work, "mascot-head", brandSourceSvg("head"), [1024])[1024],
    };
    for (const [file, from] of Object.entries(extras)) fs.copyFileSync(from, path.join(png, file));
    // `tauri icon` renders squares only, so each installer image is drawn in
    // the corner of one and cut back out.
    for (const [name, { source, width, height }] of Object.entries(installerImages)) {
      const side = Math.max(width, height);
      const square = renderPngs(work, `installer-${name}`, installerSourceSvg(name, { width, height }), [side])[side];
      fs.writeFileSync(path.join(png, source), encodePng(crop(decodePng(fs.readFileSync(square)), width, height)));
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  run(path.join(root, "scripts", "icons", "build-windows-ico.mjs"), []);
  run(path.join(root, "scripts", "icons", "build-nsis-images.mjs"), []);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
