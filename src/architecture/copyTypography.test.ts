/// <reference types="node" />

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(process.cwd(), "src");

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/* English copy uses the straight apostrophe (DESIGN.md, Content design). The
   curly one looks the same on screen, so a mix goes unnoticed until a test
   queries the text with the other one. Tests are scanned too: they spell the
   copy they look for. */
describe("copy typography", () => {
  it("never uses a curly apostrophe", () => {
    const offenders = sources(SOURCE_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(String.fromCharCode(0x2019)))
      .map((path) => relative(process.cwd(), path));
    expect(offenders).toEqual([]);
  });

  /* Copy is one paragraph that wraps where the width runs out. Splitting it
     by hand, one line per sentence or clause, left uneven lines that read as
     a list (DESIGN.md, Typography); a hint that wraps badly is shortened. */
  it("never breaks copy into lines by hand", () => {
    const offenders = sources(SOURCE_ROOT)
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => /<br\s*\/?>|sentence-?lines?/i.test(readFileSync(path, "utf8")))
      .map((path) => relative(process.cwd(), path));
    expect(offenders).toEqual([]);
  });
});
