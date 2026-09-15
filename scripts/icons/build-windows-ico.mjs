// Rebuilds `src-tauri/icons/icon.ico` so it follows the Windows ICO
// conventions the shell is happiest with.
//
// `tauri icon` writes every ICO layer as a PNG-compressed frame. Windows only
// guarantees PNG support for the 256px layer; the smaller layers are expected
// to be classic 32-bit DIBs (BITMAPINFOHEADER + BGRA pixels + AND mask). Most
// shell code paths cope with PNG-compressed small layers, but not all of them
// do, and a shortcut that resolves its icon through one of the paths that does
// not renders as a blank sheet. Converting the small layers to DIBs removes
// that variable without changing what the icon looks like.
//
// The Tauri layer order is kept: 32px first (Tauri asks for that so the
// development window picks the right layer), then 16, 24, 48, 64 and 256.
//
//   node scripts/icons/build-windows-ico.mjs            rewrite icon.ico in place
//   node scripts/icons/build-windows-ico.mjs --check    fail if icon.ico is not in the expected shape
//
// Only the frame encoding changes; pixels are copied as-is from the PNG frames
// Tauri rendered from `source.svg`. No third-party dependency: the PNG frames
// Tauri writes are 8-bit, non-interlaced, and the decoder below covers exactly
// the colour types PNG allows at that depth.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const defaultIcoPath = path.join(root, "src-tauri", "icons", "icon.ico");

/** Layers every Windows ICO shipped by Tauri must carry, in this order. */
export const expectedLayerSizes = [32, 16, 24, 48, 64, 256];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// --- PNG ---------------------------------------------------------------------

export function isPng(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}

/**
 * Decodes an 8-bit, non-interlaced PNG into straight-alpha RGBA.
 * Returns `{ width, height, rgba }` with `rgba` laid out top-down.
 */
export function decodePng(buffer) {
  if (!isPng(buffer)) throw new Error("not a PNG stream");
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!header) throw new Error("PNG has no IHDR chunk");
  if (header.bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${header.bitDepth}`);
  if (header.interlace !== 0) throw new Error("interlaced PNG is not supported");
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header.colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${header.colorType}`);

  const { width, height } = header;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error("PNG image data has an unexpected length");

  const pixels = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = pixels.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? current[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      let predictor;
      switch (filter) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = a;
          break;
        case 2:
          predictor = b;
          break;
        case 3:
          predictor = (a + b) >> 1;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
      current[i] = (line[i] + predictor) & 0xff;
    }
    previous = current;
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const src = p * channels;
    const dst = p * 4;
    switch (channels) {
      case 1:
        rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = pixels[src];
        rgba[dst + 3] = 255;
        break;
      case 2:
        rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = pixels[src];
        rgba[dst + 3] = pixels[src + 1];
        break;
      case 3:
        rgba[dst] = pixels[src];
        rgba[dst + 1] = pixels[src + 1];
        rgba[dst + 2] = pixels[src + 2];
        rgba[dst + 3] = 255;
        break;
      case 4:
        pixels.copy(rgba, dst, src, src + 4);
        break;
    }
  }
  return { width, height, rgba };
}

/** Encodes straight-alpha RGBA as a minimal 8-bit RGBA PNG (tests and fixtures). */
export function encodePng({ width, height, rgba }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(typeAndData.length + 8);
    out.writeUInt32BE(data.length, 0);
    typeAndData.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(typeAndData), typeAndData.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- DIB ---------------------------------------------------------------------

/**
 * Encodes RGBA as the 32-bit DIB an ICO directory entry embeds: a
 * BITMAPINFOHEADER whose height covers both planes, bottom-up BGRA pixels with
 * straight alpha, then the 1-bit AND mask padded to 32-bit rows.
 */
export function rgbaToDib({ width, height, rgba }) {
  const xorSize = width * height * 4;
  const maskStride = Math.ceil(width / 32) * 4;
  const maskSize = maskStride * height;
  const out = Buffer.alloc(40 + xorSize + maskSize);
  out.writeUInt32LE(40, 0); // biSize
  out.writeInt32LE(width, 4); // biWidth
  out.writeInt32LE(height * 2, 8); // biHeight: colour plane + mask plane
  out.writeUInt16LE(1, 12); // biPlanes
  out.writeUInt16LE(32, 14); // biBitCount
  out.writeUInt32LE(0, 16); // biCompression = BI_RGB
  out.writeUInt32LE(xorSize + maskSize, 20); // biSizeImage
  // biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant stay 0.

  for (let y = 0; y < height; y += 1) {
    const srcRow = height - 1 - y; // DIBs are stored bottom-up
    for (let x = 0; x < width; x += 1) {
      const src = (srcRow * width + x) * 4;
      const dst = 40 + (y * width + x) * 4;
      out[dst] = rgba[src + 2]; // B
      out[dst + 1] = rgba[src + 1]; // G
      out[dst + 2] = rgba[src]; // R
      out[dst + 3] = rgba[src + 3]; // A
      if (rgba[src + 3] === 0) {
        const bit = 40 + xorSize + y * maskStride + (x >> 3);
        out[bit] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

/** Reads back the RGBA plane of a DIB written by `rgbaToDib` (tests and `--check`). */
export function dibToRgba(dib) {
  const width = dib.readInt32LE(4);
  const height = dib.readInt32LE(8) / 2;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const dstRow = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const src = 40 + (y * width + x) * 4;
      const dst = (dstRow * width + x) * 4;
      rgba[dst] = dib[src + 2];
      rgba[dst + 1] = dib[src + 1];
      rgba[dst + 2] = dib[src];
      rgba[dst + 3] = dib[src + 3];
    }
  }
  return { width, height, rgba };
}

// --- ICO ---------------------------------------------------------------------

/** Splits an ICO into its directory entries: `{ width, height, bitCount, data }`. */
export function parseIco(buffer) {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    throw new Error("not an ICO file");
  }
  const count = buffer.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    const size = buffer.readUInt32LE(at + 8);
    const offset = buffer.readUInt32LE(at + 12);
    entries.push({
      width: buffer[at] || 256,
      height: buffer[at + 1] || 256,
      bitCount: buffer.readUInt16LE(at + 6),
      data: buffer.subarray(offset, offset + size),
    });
  }
  return entries;
}

/** Writes an ICO from `{ width, height, data }` entries, each already DIB- or PNG-encoded. */
export function writeIco(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach((entry, i) => {
    const at = 6 + i * 16;
    header[at] = entry.width >= 256 ? 0 : entry.width;
    header[at + 1] = entry.height >= 256 ? 0 : entry.height;
    header[at + 2] = 0; // colour count (no palette)
    header[at + 3] = 0; // reserved
    header.writeUInt16LE(1, at + 4); // planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(entry.data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += entry.data.length;
  });
  return Buffer.concat([header, ...entries.map((entry) => entry.data)]);
}

/**
 * Re-encodes every layer below 256px as a DIB, leaving the 256px layer PNG.
 * Layers already stored as DIBs are passed through untouched.
 */
export function rebuildIco(buffer) {
  return writeIco(
    parseIco(buffer).map((entry) => {
      if (entry.width >= 256 || !isPng(entry.data)) return entry;
      return { ...entry, data: rgbaToDib(decodePng(entry.data)) };
    }),
  );
}

/** Returns the problems with an ICO, or an empty list when it is in the expected shape. */
export function verifyIco(buffer) {
  const problems = [];
  let entries;
  try {
    entries = parseIco(buffer);
  } catch (error) {
    return [error.message];
  }
  const sizes = entries.map((entry) => entry.width);
  if (sizes.join(",") !== expectedLayerSizes.join(",")) {
    problems.push(`layer sizes are [${sizes.join(", ")}], expected [${expectedLayerSizes.join(", ")}]`);
  }
  for (const entry of entries) {
    const label = `${entry.width}px layer`;
    if (entry.width !== entry.height) problems.push(`${label} is not square (${entry.width}x${entry.height})`);
    if (entry.bitCount !== 32) problems.push(`${label} is ${entry.bitCount}-bit, expected 32-bit`);
    if (entry.width >= 256) {
      if (!isPng(entry.data)) problems.push(`${label} must be PNG-compressed`);
    } else if (isPng(entry.data)) {
      problems.push(`${label} is PNG-compressed; only the 256px layer may be (run scripts/icons/build-windows-ico.mjs)`);
    } else if (entry.data.readUInt32LE(0) !== 40 || entry.data.readInt32LE(8) !== entry.height * 2) {
      problems.push(`${label} has a malformed BITMAPINFOHEADER`);
    }
  }
  return problems;
}

// --- CLI ---------------------------------------------------------------------

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function main(argv) {
  const check = argv.includes("--check");
  const target = argv.find((arg) => !arg.startsWith("--")) ?? defaultIcoPath;
  const buffer = fs.readFileSync(target);
  if (check) {
    const problems = verifyIco(buffer);
    if (problems.length > 0) {
      for (const problem of problems) console.error(`${relative(target)}: ${problem}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${relative(target)}: ${expectedLayerSizes.length} layers, small layers are DIBs, 256px is PNG`);
    return;
  }
  const rebuilt = rebuildIco(buffer);
  const problems = verifyIco(rebuilt);
  if (problems.length > 0) throw new Error(`rebuilt ICO is not valid:\n${problems.join("\n")}`);
  fs.writeFileSync(target, rebuilt);
  console.log(`${relative(target)}: rewrote ${buffer.length} -> ${rebuilt.length} bytes`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
