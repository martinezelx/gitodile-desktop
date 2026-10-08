// Builds the bitmaps the Windows installer shows, from the PNGs `pnpm icons`
// renders.
//
// NSIS (Modern UI 2) dresses the installer with two fixed-size bitmaps: a
// 164x314 panel on the Welcome and Finish pages and a 150x57 strip in the
// header of every other page. Both are drawn in `mascot.mjs` on the icon's
// slate (ADR 0029):
//
//   installer-sidebar.bmp   the whole mascot, clear of every edge
//   installer-header.bmp    the mascot's head, centred in the strip
//
// `pnpm icons` renders each one at its exact size into
// `src/assets/brand/png/gitodile-installer-*.png`. NSIS needs classic 24-bit
// BMPs with no alpha, so this script flattens those PNGs and re-encodes them;
// nothing is resampled.
//
//   node scripts/icons/build-nsis-images.mjs            rewrite both BMPs
//   node scripts/icons/build-nsis-images.mjs --check    fail if the committed BMPs drift from the PNGs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodePng } from "./build-windows-ico.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const brandPngDir = path.join(root, "src", "assets", "brand", "png");
export const windowsDir = path.join(root, "src-tauri", "windows");

/**
 * What a translucent pixel in a rendered PNG is flattened onto: the slate's
 * darker end. The renders are opaque, so this only guards the BMP's lack of alpha.
 */
export const flattenBackground = [0x16, 0x1b, 0x22];

/** The two bitmaps Modern UI 2 expects, at the sizes it draws them, and the PNG each is encoded from. */
export const images = {
  sidebar: { file: "installer-sidebar.bmp", source: "gitodile-installer-sidebar.png", width: 164, height: 314 },
  header: { file: "installer-header.bmp", source: "gitodile-installer-header.png", width: 150, height: 57 },
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

/** Cuts the `width`x`height` top-left corner out of `image`. */
export function crop(image, width, height) {
  if (image.width < width || image.height < height) {
    throw new Error(`cannot crop ${width}x${height} from ${image.width}x${image.height}`);
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    image.rgba.copy(rgba, y * width * 4, y * image.width * 4, (y * image.width + width) * 4);
  }
  return { width, height, rgba };
}

/** Encodes both installer bitmaps from their rendered PNGs, `{ sidebar, header }`. */
export function buildNsisImages(sources) {
  const built = {};
  for (const [name, { file, width, height }] of Object.entries(images)) {
    const image = decodePng(sources[name]);
    if (image.width !== width || image.height !== height) {
      throw new Error(`expected a ${width}x${height} ${name}, got ${image.width}x${image.height}`);
    }
    built[file] = encodeBmp(blit(solid(width, height, flattenBackground), image, 0, 0));
  }
  return built;
}

function readSources() {
  return Object.fromEntries(
    Object.entries(images).map(([name, { source }]) => [name, fs.readFileSync(path.join(brandPngDir, source))]),
  );
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
        console.error(`${relative(target)}: out of date with its rendered PNG (run pnpm icons)`);
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
    console.log(`src-tauri/windows: installer bitmaps match their rendered PNGs`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
