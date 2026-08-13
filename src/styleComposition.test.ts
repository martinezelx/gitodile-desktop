/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const EXPECTED_IMPORTS = [
  "./styles/tokens.css",
  "./styles/base.css",
  "./styles/theme-transition.css",
  "./app/app-shell.css",
  "./shared/ui/primitives.css",
  "./features/overview/overview.css",
  "./features/status/status.css",
  "./features/changes/changes.css",
  "./features/save-version/save-version.css",
  "./features/publish/publish.css",
  "./features/version-lines/version-lines.css",
  "./features/settings/settings.css",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), "src", relativePath), "utf8");
}

describe("production style composition", () => {
  it("keeps the eager cascade order explicit and deterministic", () => {
    const styleEntry = readSource("styles.css");
    const imports = [...styleEntry.matchAll(/@import\s+"([^"]+)";/g)].map((match) => match[1]);
    expect(imports).toEqual(EXPECTED_IMPORTS);
    expect(readSource("app/app-shell.css")).toContain(".app-shell");
  });

  it("keeps closed visual contracts with their feature owners", () => {
    expect(readSource("features/overview/overview.css")).toContain(".project-hero");
    expect(readSource("features/status/status.css")).toContain(".status-breakdown");
    const changes = readSource("features/changes/changes.css");
    expect(changes).toContain(".changes-file-item__type-icon");
    expect(changes).toContain(".diff-code--accessible");
    expect(changes).toContain("background: var(--surface-code)");
    expect(changes).toContain("@media (max-width: 1024px)");

    const versionLines = readSource("features/version-lines/version-lines.css");
    expect(versionLines).toContain(".version-lines-filter__popup");
    expect(versionLines).toContain("max-height: min(420px, calc(100vh - 300px))");

    const settings = readSource("features/settings/settings.css");
    expect(settings).toContain(".settings-layout");
    expect(settings).toContain(".git-install__status");
    expect(settings).toContain("@media (max-width: 800px)");

    const appShell = readSource("app/app-shell.css");
    expect(appShell).toContain(".settings-dialog");
    expect(appShell).not.toContain(".settings-layout");
    expect(settings).not.toContain(".settings-dialog");
  });

  it("loads shared app menus before feature alignment overrides", () => {
    const primitives = readSource("shared/ui/primitives.css");
    const changes = readSource("features/changes/changes.css");
    const versionLines = readSource("features/version-lines/version-lines.css");

    expect(primitives).toContain(".app-menu {");
    expect(changes).toContain(".changes-view-picker__menu { right: auto; left: 0;");
    expect(versionLines).not.toMatch(/^\s*\.app-menu(?:\s|,|\{)/m);
  });

  it("retains theme, focus, reduced-motion and forced-color foundations", () => {
    expect(readSource("styles/tokens.css")).toContain(':root[data-theme="light"]');
    expect(readSource("styles/tokens.css")).toContain(':root[data-theme="dark"]');
    expect(readSource("styles/base.css")).toContain("@media (prefers-reduced-motion: reduce)");

    // Theme-change choreography is its own sheet: base.css stays the reset,
    // body and focus foundations rather than the larger half of an effect.
    const themeTransition = readSource("styles/theme-transition.css");
    expect(themeTransition).toContain('[data-theme-transition="reveal"]::view-transition-new(root)');
    expect(themeTransition).toContain('[data-theme-transition="fade"]::view-transition-new(root)');
    expect(themeTransition).toContain("@keyframes theme-reveal");
    expect(readSource("styles/base.css")).not.toContain("view-transition");
    const primitives = readSource("shared/ui/primitives.css");
    expect(primitives).toContain(":focus-visible");
    expect(primitives).toContain("@media (forced-colors: active)");
    expect(primitives).toContain('url("../../assets/gitodrile-mark.svg")');
  });
});
