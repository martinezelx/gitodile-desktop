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
  "./features/project-settings/project-settings.css",
  "./features/notifications/notifications.css",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), "src", relativePath), "utf8");
}

type CssRule = { selector: string; body: string };

function readRules(relativePath: string): CssRule[] {
  return [...readSource(relativePath).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim().replace(/\s+/g, " "),
    body: match[2],
  }));
}

function ruleBody(relativePath: string, selector: string): string {
  const rule = readRules(relativePath).find((candidate) => candidate.selector === selector);
  if (!rule) throw new Error(`${relativePath} does not define ${selector}`);
  return rule.body;
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
    expect(settings).toContain(".git-install__status");
    expect(settings).toContain("@media (max-width: 800px)");
    // The panel chrome is shared by both settings panels (task 098), so it
    // belongs to the primitives sheet; only one of them may define it.
    expect(settings).not.toContain(".settings-layout {");
    const primitiveChrome = readSource("shared/ui/primitives.css");
    expect(primitiveChrome).toContain(".settings-layout {");
    // Stacked option cards are shared by line endings and the per-project
    // identity, so exactly one sheet may define them.
    expect(primitiveChrome).toContain(".choice-list__option {");
    expect(settings).not.toContain(".choice-list");
    expect(settings).toContain(".line-endings__caveat");
    expect(readSource("features/project-settings/project-settings.css"))
      .toContain(".project-settings-remote");

    // The reference badge is History's vocabulary and Overview renders it
    // inside its own rows, so exactly one sheet may define it — the later one,
    // or the two definitions start racing in the cascade.
    const history = readSource("features/history/history.css");
    const overview = readSource("features/overview/overview.css");
    expect(EXPECTED_IMPORTS.indexOf("./features/history/history.css"))
      .toBeGreaterThan(EXPECTED_IMPORTS.indexOf("./features/overview/overview.css"));
    expect(history).toContain(".history-ref-badge {");
    expect(overview).not.toContain(".history-ref-badge {");

    const appShell = readSource("app/app-shell.css");
    expect(appShell).toContain(".settings-dialog");
    expect(appShell).not.toContain(".settings-layout");
    expect(appShell).toContain(".project-settings-dialog__project");
    expect(settings).not.toContain(".settings-dialog");
    // The mark is the whole identity in the window furniture: no wordmark
    // beside it, at any width.
    expect(appShell).toContain(".window-titlebar__mark");
    expect(appShell).not.toContain(".window-titlebar__name");
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
    expect(primitives).toContain('url("../../assets/gitodile-mark.svg")');
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

  it("keeps audited shape roles and concentric menu insets explicit", () => {
    const expectedDeclarations = [
      ["app/app-shell.css", ".titlebar-menu__list", "padding: var(--space-2)"],
      ["app/app-shell.css", ".palette-list", "padding: var(--space-2)"],
      ["app/app-shell.css", ".project-switcher-compact__popover", "padding: var(--space-2)"],
      ["app/app-shell.css", ".sidebar-project__badge", "border-radius: var(--radius-pill)"],
      ["features/clone/clone.css", ".clone-dialog__progress li > span", "border-radius: var(--radius-round)"],
      ["features/initialize-project/initialize-project.css", ".initialize-dialog__progress li > svg, .initialize-dialog__progress li > span", "border-radius: var(--radius-round)"],
      ["features/overview/overview.css", ".pending-versions__node", "border-radius: var(--radius-round)"],
      ["features/overview/overview.css", ".overview-history__node", "border-radius: var(--radius-round)"],
      ["features/sync/sync.css", ".team-changes__endpoint > svg", "border-radius: var(--radius-round)"],
      ["features/settings/settings.css", ".identity-block__confirm", "border-radius: var(--radius-surface)"],
      ["features/version-lines/version-lines.css", ".version-line-row__details-toggle", "border-radius: var(--radius-pill)"],
      ["features/version-lines/version-lines.css", ".version-lines-filter__clear", "border-radius: var(--radius-item)"],
      ["features/version-lines/version-lines.css", ".version-lines-quick-switch__see-all", "border-radius: var(--radius-item)"],
    ] as const;

    for (const [file, selector, declaration] of expectedDeclarations) {
      expect(ruleBody(file, selector), `${file}: ${selector}`).toContain(declaration);
    }
    expect(ruleBody("features/version-lines/version-lines.css", ".version-lines-filter__clear"))
      .not.toContain("border-top");
  });

  it("keeps badges and chips capsule-shaped", () => {
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        if (!/(?:badge|chip)/.test(rule.selector) || !/border-radius:/.test(rule.body)) continue;
        if (!rule.body.includes("border-radius: var(--radius-pill)")) {
          offenders.push(`${relativePath}: ${rule.selector}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("does not give button-like controls a link cursor", () => {
    const pointerRules: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        if (/cursor:\s*pointer/.test(rule.body)) {
          pointerRules.push(`${relativePath}: ${rule.selector}`);
        }
      }
    }

    // This is deliberately styled as an underlined inline disclosure link;
    // every ordinary button keeps the platform arrow cursor.
    expect(pointerRules).toEqual([
      "features/save-version/save-version.css: .save-version-detail__toggle",
    ]);
  });

  it("keeps element defaults and layout-property motion out of the cascade", () => {
    const primitives = readSource("shared/ui/primitives.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(primitives).not.toMatch(/(?:^|})\s*nav\s*\{/m);

    const offenders: string[] = [];
    const layoutProperty = /\b(?:width|height|top|right|bottom|left|margin|padding|gap|grid-template|flex-basis)\b/;
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        for (const transition of rule.body.matchAll(/transition(?:-property)?:\s*([^;}]+)/g)) {
          if (layoutProperty.test(transition[1])) {
            offenders.push(`${relativePath}: ${rule.selector} — ${transition[1].trim()}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
