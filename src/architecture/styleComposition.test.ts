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
    expect(readSource("styles/base.css")).toContain(':root[data-reduced-motion="true"] *');

    // Theme-change choreography is its own sheet: base.css stays the reset,
    // body and focus foundations rather than the larger half of an effect.
    const themeTransition = readSource("styles/theme-transition.css");
    expect(themeTransition).toContain('[data-theme-transition="fade"]::view-transition-new(root)');
    // One animation for every theme control. The titlebar toggle had a second,
    // origin-anchored one; it was withdrawn, and this keeps its geometry from
    // creeping back in beside the fade rather than replacing it.
    expect(themeTransition).not.toContain("theme-reveal");
    expect(readSource("styles/tokens.css")).not.toContain("--duration-theme-reveal");
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

  // DESIGN.md § Size. The button primitive used to declare padding and radius
  // and nothing else, so its height fell out of `line-height: normal` over the
  // browser's default 16px — a number nobody chose, different per platform.
  // Height and type size are one decision and both belong here.
  it("keeps the labelled button primitive sized from tokens", () => {
    const tokens = readSource("styles/tokens.css");
    const read = (name: string): number => {
      const match = tokens.match(new RegExp(`--control-height-${name}:\\s*(\\d+)px`));
      if (!match) throw new Error(`--control-height-${name} is not defined`);
      return Number(match[1]);
    };
    expect(read("sm")).toBeLessThan(read("md"));
    // `lg` is the coarse-pointer accommodation, so it is the only tier allowed
    // to exceed the house size, and it has to clear the 44px touch target.
    expect(read("lg")).toBeGreaterThanOrEqual(44);
    expect(tokens).toMatch(/--control-font-sm:/);
    expect(tokens).toMatch(/--control-font-md:/);

    const primitive = ruleBody("shared/ui/primitives.css", ".primary-button, .secondary-button");
    expect(primitive).toMatch(/min-height:\s*var\(--control-height-md\)/);
    expect(primitive).toMatch(/font-size:\s*var\(--control-font-md\)/);
  });

  // The drift this replaced: five features had each pinned their own button
  // height (38, 39, 42, 43 and 44px), and four of them shipped the 44px
  // coarse-pointer size to every mouse user by writing it as a fixed
  // `min-height`. A feature may restyle a button; it may not resize one.
  it("keeps feature CSS from resizing the button primitive", () => {
    // DESIGN.md § Size names this the one exception: the diff panes are a code
    // surface with their own type scale, and their footer control runs at 30px.
    const documentedExceptions = new Set([".history-diff-pane__footer .secondary-button"]);
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "shared/ui/primitives.css") continue;
      for (const rule of readRules(relativePath)) {
        // The button itself, not something inside it: `... .secondary-button svg`
        // sizing its own glyph is the feature's business, so only a selector
        // whose final compound *is* the button counts.
        const targetsButton = rule.selector
          .split(",")
          .some((one) => /(?:primary|secondary)-button[\w-]*(?::[\w-]+(?:\([^)]*\))?)*$/.test(one.trim()));
        if (!targetsButton) continue;
        if (documentedExceptions.has(rule.selector)) continue;
        const size = rule.body.match(/(?<![\w-])(min-height|height|font-size):\s*(\d[\d.]*)px/);
        if (size) {
          offenders.push(`${relativePath}: ${rule.selector} — ${size[1]}: ${size[2]}px`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // The drift this replaced: History had reached for 630, 680 and 760 while
  // every other screen sat on 600/650/700, and eight of its surfaces used a
  // bare `<strong>` — which the browser renders at 700, the loudest step the
  // app owns. One screen read as bold throughout and no single rule looked
  // wrong. A weight is a role now, and a role has a token.
  it("keeps font weight on the scale", () => {
    const tokens = readSource("styles/tokens.css");
    for (const step of ["normal", "medium", "strong", "heading", "title"]) {
      expect(tokens).toMatch(new RegExp(`--weight-${step}:\\s*\\d`));
    }
    // `<strong>` is semantic, so it must not inherit the browser's 700.
    expect(readSource("styles/base.css")).toMatch(
      /strong,\s*b\s*\{[^}]*font-weight:\s*var\(--weight-strong\)/,
    );

    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      for (const rule of readRules(relativePath)) {
        const literal = rule.body.match(/(?<![\w-])font-weight:\s*(\d[\d.]*)/);
        if (literal) offenders.push(`${relativePath}: ${rule.selector} — font-weight: ${literal[1]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  // The type scale is the same idea one axis over. It is not yet a guard —
  // most screens still carry sizes that predate it — so this only holds the
  // steps themselves in place for the code that has moved onto them.
  it("keeps the type scale defined", () => {
    const tokens = readSource("styles/tokens.css");
    for (const step of ["display", "title", "subtitle", "lead", "body", "label", "caption", "micro"]) {
      expect(tokens).toMatch(new RegExp(`--text-${step}:\\s*\\d`));
    }
    // DESIGN.md § Size states that a label and the control it names agree, so
    // the two pairs are the same number. Nothing but this stops them drifting
    // apart the next time one of the four is edited on its own.
    const step = (name: string) => tokens.match(new RegExp(`${name}:\s*([\d.]+)px`))?.[1];
    expect(step("--control-font-md")).toBe(step("--text-body"));
    expect(step("--control-font-sm")).toBe(step("--text-label"));

    // Whole pixels: every ramp this one was calibrated against (macOS, Fluent,
    // VS Code, GitHub Desktop) uses integers, and the halves we used to carry
    // were the mark of one step too many rather than a decision.
    for (const declaration of tokens.matchAll(/--(?:text|control-font)-[\w-]+:\s*([\d.]+)px/g)) {
      expect(Number(declaration[1]) % 1).toBe(0);
    }
  });

  // Every sheet in the eager cascade is on the scale now, so this is the whole
  // app rather than one screen's guard. The drift it replaced: 248 literal
  // sizes across fourteen sheets, spread over twenty-two distinct values —
  // 14.5, 16, 18, 20 and 21 among them, each reasonable where it was written
  // and none of them agreeing with the next sheet over.
  it("keeps font size on the scale", () => {
    // DESIGN.md § Typography names both: a numeral inside a 14px status dot,
    // and the label inside a miniature drawing of the navigation rail. Neither
    // is text anyone reads, and neither fits the floor.
    const documentedExceptions = new Set([
      ".sidebar-project__badge-count",
      ".navigation-display__preview small",
    ]);
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        if (documentedExceptions.has(rule.selector)) continue;
        // `font-size: 0` hides a label rather than sizing one — it is how the
        // diff pane's footer drops its button text at narrow widths.
        const literal = rule.body.match(/(?<![\w-])font-size:\s*([\d.]+)px/);
        if (literal) offenders.push(`${relativePath}: ${rule.selector} — font-size: ${literal[1]}px`);
        // The `font:` shorthand carries the size and the weight inside itself,
        // so neither this guard nor the weight one could see it: six rules hid
        // there, one of them still on 11.5px after the whole cascade had moved.
        const shorthand = rule.body.match(/(?<![\w-])font:\s*(?!inherit)([^;]*)/);
        if (shorthand && /(?:^|\s)\d[\d.]*(?:px|\/|$)|\/\s*\d|(?:^|\s)[1-9]00(?:\s|$)/.test(shorthand[1])) {
          offenders.push(`${relativePath}: ${rule.selector} — font: ${shorthand[1].trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // `--text-*` used to mean two unrelated things: nine sizes and two colors.
  // The colors carry a `-color` suffix now, which is only worth the rename if
  // something keeps the two halves from leaking back into each other.
  it("keeps --text-* a size and --text-*-color a color", () => {
    const tokens = readSource("styles/tokens.css");
    expect(tokens).not.toMatch(/--text-(?:primary|secondary):/);
    expect(tokens).toMatch(/--text-primary-color:/);
    expect(tokens).toMatch(/--text-secondary-color:/);

    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      for (const rule of readRules(relativePath)) {
        for (const use of rule.body.matchAll(/font-size:\s*var\((--text-[\w-]+)\)/g)) {
          if (use[1].endsWith("-color")) {
            offenders.push(`${relativePath}: ${rule.selector} sizes text with ${use[1]}`);
          }
        }
        for (const use of rule.body.matchAll(/(?<![\w-])color:\s*var\((--text-[\w-]+)\)/g)) {
          if (!use[1].endsWith("-color")) {
            offenders.push(`${relativePath}: ${rule.selector} colors text with ${use[1]}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // The fifth typographic axis, and the last one still repeating itself: the
  // monospace stack was written out verbatim twelve times across the cascade.
  // TypeScript had already named it; CSS was the half that never did.
  it("keeps the font stacks named once", () => {
    const tokens = readSource("styles/tokens.css");
    const step = (name: string) => tokens.match(new RegExp(`${name}:\\s*([\\d.]+)px`))?.[1];
    expect(tokens).toMatch(/--font-sans:\s*\S/);
    expect(tokens).toMatch(/--font-mono:\s*\S/);

    // `diffPreferences.tsx` builds the diff's font preference in TypeScript and
    // has to spell the fallback stack out. The two copies must stay in step.
    const token = tokens.match(/--font-mono:\s*([^;]+);/)?.[1].trim();
    const constant = readSource("features/changes/diffPreferences.tsx")
      .match(/const SYSTEM_MONO_STACK = '([^']+)'/)?.[1];
    expect(constant).toBe(token);

    // The same shape one file over. `DiffResultView` seeds its row-height
    // estimate with `.diff-code`'s line box before the first measurement lands,
    // and it can only spell that out. It said 20 — "matching the CSS's
    // `font: 12.5px/1.6`" — through a move to 13px and then to 12px, so the
    // number and the comment explaining it were both wrong for two scale
    // changes running. It is written as the two factors now, and this is what
    // makes the next one fail loudly.
    const seed = readSource("features/changes/DiffResultView.tsx")
      .match(/const FALLBACK_LINE_HEIGHT = ([\d.]+) \* ([\d.]+);/);
    expect(seed).not.toBeNull();
    const diffCode = ruleBody("features/changes/changes.css", ".diff-code");
    expect(diffCode).toContain("font-size: var(--text-label)");
    expect(diffCode).toContain("line-height: var(--leading-code)");
    expect(seed?.[1]).toBe(step("--text-label"));
    expect(seed?.[2]).toBe(tokens.match(/--leading-code:\s*([\d.]+)/)?.[1]);

    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      for (const rule of readRules(relativePath)) {
        if (/ui-monospace|ui-sans-serif/.test(rule.body)) {
          offenders.push(`${relativePath}: ${rule.selector} spells out a font stack`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // The two axes the size and weight passes had left alone. Twelve line heights
  // for four roles plus code, and eleven tracking values including −0.005,
  // −0.012 and −0.018em — differences of a fifth of a pixel at the sizes they
  // were written on, which is to say differences nobody could see.
  it("keeps leading and tracking on their scales", () => {
    const tokens = readSource("styles/tokens.css");
    for (const step of ["none", "tight", "snug", "normal", "code"]) {
      expect(tokens).toMatch(new RegExp(`--leading-${step}:\\s*\\d`));
    }
    for (const step of ["hero", "tight", "wide", "caps"]) {
      expect(tokens).toMatch(new RegExp(`--tracking-${step}:\\s*-?[\\d.]`));
    }

    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      for (const rule of readRules(relativePath)) {
        const leading = rule.body.match(/(?<![\w-])line-height:\s*([\d.]+)/);
        if (leading) offenders.push(`${relativePath}: ${rule.selector} — line-height: ${leading[1]}`);
        // `letter-spacing: 0` is a reset, not a value someone picked: the
        // tooltip uses it to shed whatever tracking it was rendered inside of.
        const tracking = rule.body.match(/(?<![\w-])letter-spacing:\s*(-?[\d.]*[\d]e?m)/);
        if (tracking) offenders.push(`${relativePath}: ${rule.selector} — letter-spacing: ${tracking[1]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  // The other way a feature invents a size: not by overriding a button, but by
  // declaring a control-height variable of its own. The Changes toolbar had one
  // at 34px and the History diff workspace overrode it to 32 — one control
  // wearing two heights, invisible to a guard that only watches button rules.
  it("keeps control-height variables derived from the scale", () => {
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      for (const declaration of readSource(relativePath).matchAll(
        /(--[\w-]*control-height[\w-]*):\s*([^;}]+)/g,
      )) {
        const [, name, value] = declaration;
        if (!value.includes("var(--control-height-")) {
          offenders.push(`${relativePath}: ${name} is ${value.trim()}, not derived from the scale`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // A control-height variable is scoped to whichever container declares it, so
  // a control shared between two screens depends on each host remembering to.
  // The History diff toolbar reuses `DiffViewSelector` from outside
  // `.changes-layout`; when it stopped declaring the variable, the `height`
  // became invalid at computed-value time and the trigger collapsed from 32px
  // to its text. A fallback makes that failure land on the row tier instead of
  // on nothing.
  it("keeps control-height variable reads fallback-safe", () => {
    // A token on `:root` is always in scope and needs no fallback. Only the
    // feature-scoped variables — the ones a host has to remember to declare —
    // are at risk here.
    const tokens = readSource("styles/tokens.css");
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const use of readSource(relativePath).matchAll(
        /(?<![\w-])(?:min-)?height:\s*var\((--[\w-]*control-height[\w-]*)([^)]*)\)/g,
      )) {
        const [, name, rest] = use;
        if (tokens.includes(`${name}:`)) continue;
        if (!rest.includes(",")) {
          offenders.push(`${relativePath}: height: var(${name}) has no fallback`);
        }
      }
    }

    expect(offenders).toEqual([]);
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
