/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("product identity", () => {
  it("keeps JavaScript, Rust, desktop and browser names aligned", () => {
    const packageJson = JSON.parse(readSource("package.json")) as { name: string };
    const tauri = JSON.parse(readSource("src-tauri/tauri.conf.json")) as {
      productName: string;
      identifier: string;
      app: { windows: Array<{ title: string }> };
    };
    const cargo = readSource("src-tauri/Cargo.toml");

    expect(packageJson.name).toBe("gitodile");
    expect(cargo).toMatch(/\[package\]\s+name = "gitodile"/);
    expect(cargo).toMatch(/\[lib\]\s+name = "gitodile_lib"/);
    expect(readSource("src-tauri/src/main.rs")).toContain("gitodile_lib::run()");
    expect(tauri.productName).toBe("GitOdile");
    expect(tauri.identifier).toBe("app.gitodile.desktop");
    expect(tauri.app.windows.map((window) => window.title)).toEqual(["GitOdile"]);
    expect(readSource("index.html")).toContain("<title>GitOdile</title>");
  });

  it("targets the renamed official repository for issue reporting", () => {
    const menu = readSource("src/app/TitlebarMenu.tsx");
    expect(menu).toContain(
      'const ISSUES_URL = "https://github.com/martinezelx/project-gitodile/issues/new";',
    );
  });
});
