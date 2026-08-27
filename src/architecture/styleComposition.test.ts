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
  "./features/clone/clone.css",
  "./features/initialize-project/initialize-project.css",
  "./features/status/status.css",
  "./features/changes/changes.css",
  "./features/save-version/save-version.css",
  "./features/publish/publish.css",
  "./features/sync/sync.css",
  "./features/version-lines/version-lines.css",
  "./features/history/history.css",
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
    expect(readSource("features/clone/clone.css")).toContain(".clone-dialog");
    expect(readSource("features/initialize-project/initialize-project.css")).toContain(".initialize-dialog");
    expect(readSource("features/status/status.css")).toContain(".status-breakdown");
    expect(readSource("features/sync/sync.css")).toContain(".team-changes");
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

  // DESIGN.md § Shape: radius states a role, never a size. A raw length here is
  // how buttons ended up spread across three different values before, so the
  // rule is only worth writing down if something keeps new ones from appearing.
  it("expresses every border-radius as a role token", () => {
    // `0`, `inherit` and the 2px underline/highlight are not shape tiers: they
    // are squaring a corner off, following a parent, or drawing a 2px bar.
    const allowedLiterals = new Set(["0", "inherit", "2px", "2px 2px 0 0"]);
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      const source = readSource(relativePath);
      for (const match of source.matchAll(/border-radius:\s*([^;}]+)/g)) {
        const value = match[1].trim();
        if (allowedLiterals.has(value)) continue;
        // Every remaining declaration must be built only from radius tokens,
        // optionally with `0` corners for a shape squared off on one side.
        const withoutTokens = value.replace(/var\(--radius-[a-z]+\)/g, "").replace(/\b0\b/g, "").trim();
        if (withoutTokens !== "") {
          offenders.push(`${relativePath}: border-radius: ${value}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // DESIGN.md § Shape: a square shape must read as clearly rounded or as a
  // circle, never as a failed circle. This caught three real regressions when
  // it was first run — a 32px copy button that had picked up the surface
  // radius from its container's name, and two project avatars left square
  // while the same avatar was round in the rail.
  it("keeps every square shape out of the failed-circle band", () => {
    const scale: Record<string, number> = { item: 10, control: 14, surface: 18 };
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      const source = readSource(relativePath);
      for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const [, selector, body] = rule;
        const token = body.match(/border-radius:\s*var\(--radius-(item|control|surface)\)/);
        // Only rules that pin their own box can be judged; the rest depend on
        // content. The lookbehind has to reject any hyphenated prefix, not just
        // min-/max-: `\b` matches between the hyphen and the word, so a bare
        // `\bwidth` also finds `stroke-width` and `\bheight` finds `line-height`.
        const width = body.match(/(?<![\w-])width:\s*(\d+)px/);
        const height = body.match(/(?<![\w-])height:\s*(\d+)px/);
        if (!token || !width || !height) continue;

        const side = Math.min(Number(width[1]), Number(height[1]));
        const ratio = scale[token[1]] / side;
        if (ratio >= 0.43) {
          offenders.push(
            `${relativePath}: ${selector.trim().split("\n").pop()?.trim()} ` +
              `— ${side}px at --radius-${token[1]} is ${ratio.toFixed(2)} of its side`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the radius roles a concentric chain", () => {
    const tokens = readSource("styles/tokens.css");
    const read = (name: string): number => {
      const match = tokens.match(new RegExp(`--radius-${name}:\\s*(\\d+)px`));
      if (!match) throw new Error(`--radius-${name} is not defined`);
      return Number(match[1]);
    };
    const item = read("item");
    const control = read("control");
    const surface = read("surface");

    // The values are only allowed to move together: a container has to stay
    // the radius of the thing it wraps plus that thing's inset, or every
    // toolbar and menu in the app starts pinching at the corners.
    expect(control).toBe(item + 4);
    expect(surface).toBe(item + 8);
    expect(surface).toBe(control + 4);
  });
});
