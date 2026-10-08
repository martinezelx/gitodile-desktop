import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  blit,
  brandPngDir,
  buildNsisImages,
  crop,
  decodeBmp,
  encodeBmp,
  flattenBackground,
  images,
  solid,
  windowsDir,
} from "./build-nsis-images.mjs";
import { decodePng, encodePng } from "./build-windows-ico.mjs";

function pixel({ width, rgba }, x, y) {
  const at = (y * width + x) * 4;
  return [...rgba.subarray(at, at + 4)];
}

function square(size, [r, g, b, a]) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let p = 0; p < size * size; p += 1) rgba.set([r, g, b, a], p * 4);
  return { width: size, height: size, rgba };
}

test("BMP round-trips through the built-in encoder and decoder, including padded rows", () => {
  // 3px wide: a 9-byte row that BMP pads to 12, which is where stride bugs hide.
  const image = solid(3, 2, [10, 20, 30]);
  image.rgba.set([200, 100, 50, 255], 0); // top-left
  image.rgba.set([1, 2, 3, 255], (1 * 3 + 2) * 4); // bottom-right
  const bmp = encodeBmp(image);
  assert.equal(bmp.toString("latin1", 0, 2), "BM");
  assert.equal(bmp.readUInt16LE(28), 24);
  assert.equal(bmp.length, 54 + 12 * 2);
  const decoded = decodeBmp(bmp);
  assert.deepEqual(pixel(decoded, 0, 0), [200, 100, 50, 255]);
  assert.deepEqual(pixel(decoded, 2, 1), [1, 2, 3, 255]);
  assert.deepEqual(pixel(decoded, 1, 1), [10, 20, 30, 255]);
});

test("blit blends straight alpha over the canvas and clips at the edges", () => {
  const canvas = solid(4, 4, [0, 0, 0]);
  const layer = square(2, [255, 255, 255, 128]);
  blit(canvas, layer, 3, 3); // only the top-left layer pixel lands on the canvas
  assert.deepEqual(pixel(canvas, 3, 3), [128, 128, 128, 255]);
  assert.deepEqual(pixel(canvas, 2, 2), [0, 0, 0, 255]);
  blit(canvas, square(1, [9, 8, 7, 0]), 0, 0); // fully transparent: no change
  assert.deepEqual(pixel(canvas, 0, 0), [0, 0, 0, 255]);
});

test("crop keeps the top-left corner of the image", () => {
  const image = solid(4, 3, [1, 1, 1]);
  image.rgba.set([9, 9, 9, 255], (1 * 4 + 1) * 4); // (1, 1)
  image.rgba.set([7, 7, 7, 255], (0 * 4 + 3) * 4); // (3, 0), cut away
  const cut = crop(image, 2, 2);
  assert.equal(cut.width, 2);
  assert.equal(cut.height, 2);
  assert.deepEqual(pixel(cut, 1, 1), [9, 9, 9, 255]);
  assert.deepEqual(pixel(cut, 1, 0), [1, 1, 1, 255]);
  assert.throws(() => crop(image, 5, 3), /cannot crop 5x3 from 4x3/);
});

test("buildNsisImages flattens each rendered PNG into the bitmap Modern UI expects", () => {
  const sidebarPng = solid(164, 314, [0x2c, 0x35, 0x42]);
  sidebarPng.rgba.set([0x86, 0xb6, 0x40, 255], (157 * 164 + 82) * 4);
  const headerPng = solid(150, 57, [0x2c, 0x35, 0x42]);
  headerPng.rgba[3] = 0; // a transparent pixel lands on the slate
  const built = buildNsisImages({ sidebar: encodePng(sidebarPng), header: encodePng(headerPng) });

  const sidebar = decodeBmp(built[images.sidebar.file]);
  assert.equal(sidebar.width, 164);
  assert.equal(sidebar.height, 314);
  assert.deepEqual(pixel(sidebar, 0, 0), [0x2c, 0x35, 0x42, 255]);
  assert.deepEqual(pixel(sidebar, 82, 157), [0x86, 0xb6, 0x40, 255]);

  const header = decodeBmp(built[images.header.file]);
  assert.equal(header.width, 150);
  assert.equal(header.height, 57);
  assert.deepEqual(pixel(header, 0, 0), [...flattenBackground, 255]);

  assert.throws(
    () => buildNsisImages({ sidebar: encodePng(solid(128, 128, [0, 0, 0])), header: encodePng(headerPng) }),
    /expected a 164x314 sidebar, got 128x128/,
  );
});

test("the committed installer bitmaps are the sizes Modern UI 2 draws", () => {
  for (const { file, width, height } of Object.values(images)) {
    const decoded = decodeBmp(fs.readFileSync(path.join(windowsDir, file)));
    assert.equal(decoded.width, width, `${file} width`);
    assert.equal(decoded.height, height, `${file} height`);
  }
});

test("the committed installer PNGs are the bitmaps' sizes", () => {
  for (const { source, width, height } of Object.values(images)) {
    const decoded = decodePng(fs.readFileSync(path.join(brandPngDir, source)));
    assert.equal(decoded.width, width, `${source} width`);
    assert.equal(decoded.height, height, `${source} height`);
  }
});
