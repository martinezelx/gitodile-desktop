import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  blit,
  buildNsisImages,
  centred,
  decodeBmp,
  encodeBmp,
  headerBackground,
  icoLayer,
  images,
  sidebarBackground,
  solid,
  windowsDir,
} from "./build-nsis-images.mjs";
import { encodePng, rgbaToDib, writeIco } from "./build-windows-ico.mjs";

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

test("centred places the layer in the middle of the canvas", () => {
  const image = centred(10, 6, [1, 1, 1], square(2, [250, 0, 0, 255]));
  assert.deepEqual(pixel(image, 4, 2), [250, 0, 0, 255]);
  assert.deepEqual(pixel(image, 5, 3), [250, 0, 0, 255]);
  assert.deepEqual(pixel(image, 3, 2), [1, 1, 1, 255]);
  assert.deepEqual(pixel(image, 6, 3), [1, 1, 1, 255]);
});

test("icoLayer reads both DIB and PNG layers", () => {
  const ico = writeIco([
    { width: 16, height: 16, data: rgbaToDib(square(16, [1, 2, 3, 255])) },
    { width: 48, height: 48, data: encodePng(square(48, [4, 5, 6, 255])) },
  ]);
  assert.deepEqual(pixel(icoLayer(ico, 16), 0, 0), [1, 2, 3, 255]);
  assert.deepEqual(pixel(icoLayer(ico, 48), 47, 47), [4, 5, 6, 255]);
  assert.throws(() => icoLayer(ico, 32), /no 32px layer/);
});

test("buildNsisImages composes both bitmaps at the sizes Modern UI expects", () => {
  const tile = encodePng(square(128, [0x80, 0xdc, 0x2e, 255]));
  const ico = writeIco([{ width: 48, height: 48, data: rgbaToDib(square(48, [0, 0, 0, 255])) }]);
  const built = buildNsisImages({ tile, ico });

  const sidebar = decodeBmp(built[images.sidebar.file]);
  assert.equal(sidebar.width, 164);
  assert.equal(sidebar.height, 314);
  assert.deepEqual(pixel(sidebar, 0, 0), [...sidebarBackground, 255]);
  assert.deepEqual(pixel(sidebar, 82, 157), [0x80, 0xdc, 0x2e, 255]);

  const header = decodeBmp(built[images.header.file]);
  assert.equal(header.width, 150);
  assert.equal(header.height, 57);
  assert.deepEqual(pixel(header, 0, 0), [...headerBackground, 255]);
  assert.deepEqual(pixel(header, 75, 28), [0, 0, 0, 255]);

  assert.throws(() => buildNsisImages({ tile: encodePng(square(64, [0, 0, 0, 255])), ico }), /128x128/);
});

test("the committed installer bitmaps are the sizes Modern UI 2 draws", () => {
  for (const { file, width, height } of Object.values(images)) {
    const decoded = decodeBmp(fs.readFileSync(path.join(windowsDir, file)));
    assert.equal(decoded.width, width, `${file} width`);
    assert.equal(decoded.height, height, `${file} height`);
  }
});
