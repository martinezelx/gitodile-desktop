// Regenerates every platform icon from `src-tauri/icons/source.svg`.
//
// 1. `tauri icon` rasterises the SVG at each size Tauri needs (PNG, ICNS, ICO,
//    Windows Store logos). It also emits Android/iOS sets, which GitOdile does
//    not ship, so those are removed again.
// 2. `build-windows-ico.mjs` re-encodes the small ICO layers as DIBs (see that
//    file for why).
// 3. `build-nsis-images.mjs` composes the Windows installer's sidebar and
//    header bitmaps from the freshly rendered icons.
//
//   pnpm icons

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const iconsDir = path.join(root, "src-tauri", "icons");
const source = path.join(iconsDir, "source.svg");

function run(script, args) {
  // Both steps are Node entry points, so no shell (and no .cmd shim) is needed.
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"), ["icon", source, "-o", iconsDir]);
for (const mobile of ["android", "ios"]) {
  fs.rmSync(path.join(iconsDir, mobile), { recursive: true, force: true });
}
run(path.join(root, "scripts", "icons", "build-windows-ico.mjs"), []);
run(path.join(root, "scripts", "icons", "build-nsis-images.mjs"), []);
