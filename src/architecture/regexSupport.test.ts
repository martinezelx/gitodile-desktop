/// <reference types="node" />

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(process.cwd(), "src");

function productionSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return productionSources(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/* The macOS build targets Safari 13 (`vite.config.ts`). esbuild lowers syntax
   for that target but cannot lower a regular-expression feature, and Safari
   before 16.4 rejects a lookbehind assertion when the module is parsed — so a
   single one takes down every screen that imports its module, on exactly the
   machines nobody here develops on. Named groups are older and fine. */
describe("regular expressions the oldest supported WebView can parse", () => {
  it("never uses a lookbehind assertion in production code", () => {
    const offenders = productionSources(SOURCE_ROOT)
      .filter((path) => /\(\?<[=!]/.test(readFileSync(path, "utf8")))
      .map((path) => relative(process.cwd(), path));
    expect(offenders).toEqual([]);
  });
});
