// Builds the bitmaps the Windows installer shows, from the icons Tauri renders.
//
// NSIS (Modern UI 2) dresses the installer with two fixed-size bitmaps: a
// 164x314 panel on the Welcome and Finish pages and a 150x57 strip in the
// header of every other page. Both must be classic 24-bit BMPs with no alpha,
// so each one is composed here by painting an icon layer over a solid
// background:
//
//   installer-sidebar.bmp   the 128px tile centred on the brand contrast black
//   installer-header.bmp    the 48px layer of icon.ico on the header's white
//
// The pixels come from `src-tauri/icons` (rendered from `source.svg` by
// `tauri icon`), so the installer stays in step with the app icon whenever
// `pnpm icons` runs. Nothing is resampled: each bitmap uses a layer that
// already exists at the size it is shown.
//
//   node scripts/icons/build-nsis-images.mjs            rewrite both BMPs
//   node scripts/icons/build-nsis-images.mjs --check    fail if the committed BMPs drift from the icons

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodePng, dibToRgba, isPng, parseIco } from "./build-windows-ico.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const iconsDir = path.join(root, "src-tauri", "icons");
export const windowsDir = path.join(root, "src-tauri", "windows");

/** Background behind the tile on the Welcome/Finish panel: `--accent-brand-contrast`. */
export const sidebarBackground = [0x14, 0x17, 0x0f];
/** Background of the header strip: Modern UI paints the header white (`MUI_BGCOLOR`). */
export const headerBackground = [0xff, 0xff, 0xff];

/** The two bitmaps Modern UI 2 expects, at the sizes it draws them. */
export const images = {
  sidebar: { file: "installer-sidebar.bmp", width: 164, height: 314 },
  header: { file: "installer-header.bmp", width: 150, height: 57 },
};

// --- Composition --------------------------------------------------------------

/** A `width`x`height` opaque canvas filled with `[r, g, b]`. */
export function solid(width, height, [r, g, b]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    rgba[p * 4] = r;
    rgba[p * 4 + 1] = g;
    rgba[p * 4 + 2] = b;
    rgba[p * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

/**
 * Paints a straight-alpha `layer` onto `canvas` with its top-left corner at
 * (`x`, `y`). The canvas is opaque, so the result stays opaque.
 */
export function blit(canvas, layer, x, y) {
  for (let ly = 0; ly < layer.height; ly += 1) {
    const cy = y + ly;
    if (cy < 0 || cy >= canvas.height) continue;
    for (let lx = 0; lx < layer.width; lx += 1) {
      const cx = x + lx;
      if (cx < 0 || cx >= canvas.width) continue;
      const src = (ly * layer.width + lx) * 4;
      const dst = (cy * canvas.width + cx) * 4;
      const alpha = layer.rgba[src + 3] / 255;
      for (let c = 0; c < 3; c += 1) {
        canvas.rgba[dst + c] = Math.round(layer.rgba[src + c] * alpha + canvas.rgba[dst + c] * (1 - alpha));
      }
    }
  }
  return canvas;
}

/** Centres `layer` on a fresh canvas of `width`x`height` filled with `background`. */
export function centred(width, height, background, layer) {
  return blit(solid(width, height, background), layer, (width - layer.width) >> 1, (height - layer.height) >> 1);
}

// --- BMP ----------------------------------------------------------------------

/**
 * Encodes an opaque RGBA image as a 24-bit BMP (BITMAPFILEHEADER +
 * BITMAPINFOHEADER, bottom-up BGR rows padded to 32 bits). Alpha is dropped,
 * which is why callers composite onto a solid background first.
 */
export function encodeBmp({ width, height, rgba }) {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowStride * height;
  const out = Buffer.alloc(14 + 40 + pixelBytes);
  out.write("BM", 0, "latin1");
  out.writeUInt32LE(out.length, 2); // bfSize
  out.writeUInt32LE(54, 10); // bfOffBits
  out.writeUInt32LE(40, 14); // biSize
  out.writeInt32LE(width, 18); // biWidth
  out.writeInt32LE(height, 22); // biHeight (positive: bottom-up)
  out.writeUInt16LE(1, 26); // biPlanes
  out.writeUInt16LE(24, 28); // biBitCount
  out.writeUInt32LE(0, 30); // biCompression = BI_RGB
  out.writeUInt32LE(pixelBytes, 34); // biSizeImage
  out.writeInt32LE(2835, 38); // biXPelsPerMeter (96 dpi)
  out.writeInt32LE(2835, 42); // biYPelsPerMeter
  // biClrUsed and biClrImportant stay 0.
  for (let y = 0; y < height; y += 1) {
    const srcRow = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const src = (srcRow * width + x) * 4;
      const dst = 54 + y * rowStride + x * 3;
      out[dst] = rgba[src + 2]; // B
      out[dst + 1] = rgba[src + 1]; // G
      out[dst + 2] = rgba[src]; // R
    }
  }
  return out;
}

/** Reads back a BMP written by `encodeBmp` as opaque RGBA (tests and `--check`). */
export function decodeBmp(bmp) {
  if (bmp.toString("latin1", 0, 2) !== "BM") throw new Error("not a BMP file");
  const offset = bmp.readUInt32LE(10);
  const width = bmp.readInt32LE(18);
  const height = bmp.readInt32LE(22);
  const bitCount = bmp.readUInt16LE(28);
  if (bitCount !== 24 || height <= 0) throw new Error("only bottom-up 24-bit BMPs are supported");
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const dstRow = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const src = offset + y * rowStride + x * 3;
      const dst = (dstRow * width + x) * 4;
      rgba[dst] = bmp[src + 2];
      rgba[dst + 1] = bmp[src + 1];
      rgba[dst + 2] = bmp[src];
      rgba[dst + 3] = 255;
    }
  }
  return { width, height, rgba };
}

// --- Sources ------------------------------------------------------------------

/** Pulls the `size`px layer out of an ICO, whether it is stored as a DIB or a PNG. */
export function icoLayer(ico, size) {
  const entry = parseIco(ico).find((candidate) => candidate.width === size && candidate.height === size);
  if (!entry) throw new Error(`icon.ico has no ${size}px layer`);
  return isPng(entry.data) ? decodePng(entry.data) : dibToRgba(entry.data);
}

/** Composes both installer bitmaps from `{ tile, ico }` (a 128px PNG and icon.ico). */
export function buildNsisImages({ tile, ico }) {
  const tileImage = decodePng(tile);
  if (tileImage.width !== 128 || tileImage.height !== 128) {
    throw new Error(`expected a 128x128 tile, got ${tileImage.width}x${tileImage.height}`);
  }
  const { sidebar, header } = images;
  return {
    [sidebar.file]: encodeBmp(centred(sidebar.width, sidebar.height, sidebarBackground, tileImage)),
    [header.file]: encodeBmp(centred(header.width, header.height, headerBackground, icoLayer(ico, 48))),
  };
}

function readSources() {
  return {
    tile: fs.readFileSync(path.join(iconsDir, "128x128.png")),
    ico: fs.readFileSync(path.join(iconsDir, "icon.ico")),
  };
}

// --- CLI ----------------------------------------------------------------------

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function main(argv) {
  const check = argv.includes("--check");
  const built = buildNsisImages(readSources());
  let drifted = false;
  for (const [file, buffer] of Object.entries(built)) {
    const target = path.join(windowsDir, file);
    if (check) {
      const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
      if (current === null || !current.equals(buffer)) {
        console.error(`${relative(target)}: out of date with src-tauri/icons (run pnpm icons)`);
        drifted = true;
      }
      continue;
    }
    fs.writeFileSync(target, buffer);
    console.log(`${relative(target)}: wrote ${buffer.length} bytes`);
  }
  if (check) {
    if (drifted) {
      process.exitCode = 1;
      return;
    }
    console.log(`src-tauri/windows: installer bitmaps match src-tauri/icons`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
