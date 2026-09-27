// Regenerates every platform icon from the mascot in `mascot.mjs`.
//
// The mascot has two drawings, and each icon size uses the one that reads at
// that size: the full body from 48px up, the head below that. macOS
// icons sit on the emerald tile the Dock expects; Windows and Linux icons are
// the transparent mascot.
//
// 1. `mascot.mjs` rewrites the in-app SVGs and supplies four 1024px sources
//    (body/head, transparent/tiled), written to a temporary folder.
// 2. `tauri icon` rasterises each source into a full icon set. The transparent
//    body set lands in `src-tauri/icons`; the others are rendered alongside.
//    Tauri also emits Android/iOS sets, which GitOdile does not ship.
// 3. The files and layers under 48px are swapped for their head versions: the
//    32/30/44px PNGs, the 16/24/32px ICO layers and the 16/32px ICNS entries.
//    The ICNS keeps only the tiled renders.
// 4. `build-windows-ico.mjs` re-encodes the small ICO layers as DIBs (see that
//    file for why).
// 5. `build-nsis-images.mjs` composes the Windows installer's sidebar and
//    header bitmaps from the freshly rendered icons.
//
//   pnpm icons

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseIco, writeIco } from "./build-windows-ico.mjs";
import { iconSourceSvg } from "./mascot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const iconsDir = path.join(root, "src-tauri", "icons");
const tauri = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

/** Smallest size, in pixels, that shows the full body; anything smaller shows the head. */
export const BODY_MIN_SIZE = 48;

/** PNG files `tauri icon` writes under `BODY_MIN_SIZE`, which take the head. */
const smallPngs = ["32x32.png", "Square30x30Logo.png", "Square44x44Logo.png"];

/**
 * ICNS entries at 32px or less: the 16px and 32px RLE bitmaps with their masks
 * and the 32px PNG used as 16px@2x. `ic12` (32px@2x) is 64px and keeps the body.
 */
const smallIcnsTypes = new Set(["is32", "s8mk", "il32", "l8mk", "ic11"]);

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

export function writeIcns(entries) {
  const parts = entries.map(({ type, data }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, "latin1");
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const header = Buffer.alloc(8);
  header.write("icns", 0, "latin1");
  header.writeUInt32BE(8 + parts.reduce((sum, part) => sum + part.length, 0), 4);
  return Buffer.concat([header, ...parts]);
}

/** `large`'s ICO layers, with those under `BODY_MIN_SIZE` taken from `small`. */
export function mixIco(large, small) {
  const smallLayers = parseIco(small);
  return writeIco(
    parseIco(large).map((entry) => {
      if (entry.width >= BODY_MIN_SIZE) return entry;
      const replacement = smallLayers.find((layer) => layer.width === entry.width);
      if (!replacement) throw new Error(`head ICO has no ${entry.width}px layer`);
      return replacement;
    }),
  );
}

/** `large`'s ICNS entries, with the small ones taken from `small`. */
export function mixIcns(large, small) {
  const smallEntries = parseIcns(small);
  return writeIcns(
    parseIcns(large).map((entry) => {
      if (!smallIcnsTypes.has(entry.type)) return entry;
      const replacement = smallEntries.find((candidate) => candidate.type === entry.type);
      if (!replacement) throw new Error(`head ICNS has no ${entry.type} entry`);
      return replacement;
    }),
  );
}

function main() {
  run(path.join(root, "scripts", "icons", "mascot.mjs"), []);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "gitodile-icons-"));
  try {
    const sets = {
      body: iconsDir,
      head: path.join(work, "head"),
      macBody: path.join(work, "mac-body"),
      macHead: path.join(work, "mac-head"),
    };
    const sources = {
      body: iconSourceSvg("body", { tile: false }),
      head: iconSourceSvg("head", { tile: false }),
      macBody: iconSourceSvg("body", { tile: true }),
      macHead: iconSourceSvg("head", { tile: true }),
    };
    for (const [key, svg] of Object.entries(sources)) {
      const source = path.join(work, `${key}.svg`);
      fs.writeFileSync(source, svg);
      run(tauri, ["icon", source, "-o", sets[key]]);
      for (const mobile of ["android", "ios"]) {
        fs.rmSync(path.join(sets[key], mobile), { recursive: true, force: true });
      }
    }

    for (const file of smallPngs) {
      fs.copyFileSync(path.join(sets.head, file), path.join(iconsDir, file));
    }
    fs.writeFileSync(
      path.join(iconsDir, "icon.ico"),
      mixIco(fs.readFileSync(path.join(iconsDir, "icon.ico")), fs.readFileSync(path.join(sets.head, "icon.ico"))),
    );
    fs.writeFileSync(
      path.join(iconsDir, "icon.icns"),
      mixIcns(fs.readFileSync(path.join(sets.macBody, "icon.icns")), fs.readFileSync(path.join(sets.macHead, "icon.icns"))),
    );
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  run(path.join(root, "scripts", "icons", "build-windows-ico.mjs"), []);
  run(path.join(root, "scripts", "icons", "build-nsis-images.mjs"), []);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
