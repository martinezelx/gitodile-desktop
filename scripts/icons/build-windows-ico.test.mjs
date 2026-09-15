import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  decodePng,
  defaultIcoPath,
  dibToRgba,
  encodePng,
  expectedLayerSizes,
  isPng,
  parseIco,
  rebuildIco,
  rgbaToDib,
  verifyIco,
  writeIco,
} from "./build-windows-ico.mjs";

function gradient(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = (y * size + x) * 4;
      rgba[at] = (x * 255) / Math.max(size - 1, 1);
      rgba[at + 1] = (y * 255) / Math.max(size - 1, 1);
      rgba[at + 2] = 0x2e;
      rgba[at + 3] = x === 0 && y === 0 ? 0 : 255; // one transparent corner pixel
    }
  }
  return { width: size, height: size, rgba };
}

function tauriStyleIco(sizes = expectedLayerSizes) {
  // Mirrors what `tauri icon` emits: every layer PNG-compressed, 32px first.
  return writeIco(sizes.map((size) => ({ width: size, height: size, data: encodePng(gradient(size)) })));
}

test("PNG round-trips through the built-in encoder and decoder", () => {
  const image = gradient(7);
  const decoded = decodePng(encodePng(image));
  assert.equal(decoded.width, 7);
  assert.equal(decoded.height, 7);
  assert.ok(decoded.rgba.equals(image.rgba));
});

test("DIB encoding keeps the pixels, stores them bottom-up and masks transparent pixels", () => {
  const image = gradient(5);
  const dib = rgbaToDib(image);
  assert.equal(dib.readUInt32LE(0), 40);
  assert.equal(dib.readInt32LE(4), 5);
  assert.equal(dib.readInt32LE(8), 10);
  assert.equal(dib.readUInt16LE(14), 32);
  assert.equal(dib.length, 40 + 5 * 5 * 4 + 4 * 5); // header + BGRA + 1bpp mask rows padded to 4 bytes
  // Top-left source pixel lands on the last stored row, and it is the only masked one.
  const mask = dib.subarray(40 + 5 * 5 * 4);
  assert.equal(mask[4 * 4], 0x80);
  assert.equal(mask.subarray(0, 16).every((byte) => byte === 0), true);
  assert.ok(dibToRgba(dib).rgba.equals(image.rgba));
});

test("rebuildIco converts the small layers to DIBs and leaves the 256px layer as PNG", () => {
  const original = tauriStyleIco();
  assert.deepEqual(verifyIco(original).length, expectedLayerSizes.length - 1);

  const rebuilt = rebuildIco(original);
  assert.deepEqual(verifyIco(rebuilt), []);
  const entries = parseIco(rebuilt);
  assert.deepEqual(
    entries.map((entry) => entry.width),
    expectedLayerSizes,
  );
  for (const entry of entries) {
    if (entry.width === 256) {
      assert.ok(isPng(entry.data));
    } else {
      assert.ok(!isPng(entry.data));
      assert.ok(dibToRgba(entry.data).rgba.equals(gradient(entry.width).rgba), `${entry.width}px pixels differ`);
    }
  }
  // Rebuilding an already-rebuilt ICO is a no-op.
  assert.ok(rebuildIco(rebuilt).equals(rebuilt));
});

test("verifyIco reports order, shape and encoding problems", () => {
  assert.deepEqual(verifyIco(Buffer.from("nope")), ["not an ICO file"]);
  const reordered = rebuildIco(tauriStyleIco([16, 32, 24, 48, 64, 256]));
  assert.match(verifyIco(reordered)[0], /layer sizes are \[16, 32, 24, 48, 64, 256\]/);
  const missing256 = rebuildIco(tauriStyleIco([32, 16, 24, 48, 64]));
  assert.match(verifyIco(missing256)[0], /expected \[32, 16, 24, 48, 64, 256\]/);
});

test("the committed icon.ico is in the expected shape", () => {
  assert.deepEqual(verifyIco(fs.readFileSync(defaultIcoPath)), []);
});
