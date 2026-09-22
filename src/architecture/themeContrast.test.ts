/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_IDS } from "../shared/theme";

/** ADR 0012: a theme is admitted only if its text stays readable and its
 * accents stay distinguishable. This reads `styles/themes.css` - the real
 * shipping values - rather than the registry, so a hand-edited colour is what
 * the guard sees. Community palettes bring their own syntax/diff colours,
 * which are the palette's editor pairing and are deliberately not measured
 * here; the roles below are the ones the app uses for words, icons and state. */

const THEMES_CSS = readFileSync(resolve(process.cwd(), "src", "styles", "themes.css"), "utf8");

/** Every token a theme must define, so switching leaves no value behind. */
const REQUIRED_TOKENS = [
  "--surface-app",
  "--surface-panel",
  "--surface-raised",
  "--surface-code",
  "--surface-hover",
  "--surface-active",
  "--surface-control",
  "--border-control",
  "--text-primary-color",
  "--text-secondary-color",
  "--border-subtle",
  "--border-divider",
  "--accent-primary",
  "--accent-primary-contrast",
  "--accent-primary-fill",
  "--status-success",
  "--status-warning",
  "--status-danger",
  "--status-danger-contrast",
  "--status-renamed",
  "--accent-heart",
  "--diff-added",
  "--diff-removed",
  "--syntax-comment",
  "--syntax-string",
  "--syntax-number",
  "--syntax-keyword",
  "--syntax-type",
  "--syntax-property",
  "--focus-ring",
  "--overlay",
  "--shadow-sm",
  "--shadow-md",
  "--shadow-lg",
] as const;

type Block = { id: string; tokens: Record<string, string> };

function parseBlock(body: string): Record<string, string> {
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

function readThemeBlocks(): Block[] {
  return [...THEMES_CSS.matchAll(/\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g)].map((match) => ({
    id: match[1],
    tokens: parseBlock(match[2]),
  }));
}

function toRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((character) => character + character)
          .join("")
      : value;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const channel = (component: number): number => {
    const value = component / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

const HEX = /^#[0-9a-fA-F]{3,6}$/;

describe("theme contrast contract", () => {
  const blocks = readThemeBlocks();

  it("covers every registered theme exactly once", () => {
    expect(blocks.map((block) => block.id).sort()).toEqual([...THEME_IDS].sort());
  });

  it("defines every required token in every theme", () => {
    for (const block of blocks) {
      const missing = REQUIRED_TOKENS.filter((token) => block.tokens[token] === undefined);
      expect(missing, `${block.id} is missing ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("keeps body text at 4.5:1 and accents at 3:1 on every surface", () => {
    const failures: string[] = [];
    const surfaces = ["--surface-app", "--surface-panel", "--surface-raised", "--surface-code"];
    const textTokens = ["--text-primary-color", "--text-secondary-color"];
    const accentTokens = [
      "--accent-primary",
      "--status-success",
      "--status-warning",
      "--status-danger",
      "--status-renamed",
      "--diff-added",
      "--diff-removed",
      "--focus-ring",
    ];
    // Accent-on-panel only; the accent is never body copy on the code well.
    const accentSurfaces = ["--surface-app", "--surface-panel", "--surface-raised"];

    for (const block of blocks) {
      const read = (token: string): string | null => {
        const value = block.tokens[token];
        return value !== undefined && HEX.test(value) ? value : null;
      };
      for (const text of textTokens) {
        const foreground = read(text);
        if (foreground === null) continue;
        for (const surface of surfaces) {
          const background = read(surface);
          if (background === null) continue;
          const ratio = contrast(foreground, background);
          if (ratio < 4.5) {
            failures.push(`${block.id}: ${text} on ${surface} is ${ratio.toFixed(2)}:1`);
          }
        }
      }
      for (const accent of accentTokens) {
        const foreground = read(accent);
        if (foreground === null) continue;
        for (const surface of accentSurfaces) {
          const background = read(surface);
          if (background === null) continue;
          const ratio = contrast(foreground, background);
          if (ratio < 3) {
            failures.push(`${block.id}: ${accent} on ${surface} is ${ratio.toFixed(2)}:1`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps accent text readable on the accent fill", () => {
    const failures: string[] = [];
    for (const block of blocks) {
      for (const [fill, contrastToken] of [
        ["--accent-primary-fill", "--accent-primary-contrast"],
        ["--status-danger", "--status-danger-contrast"],
      ]) {
        const background = block.tokens[fill];
        const foreground = block.tokens[contrastToken];
        if (!HEX.test(background ?? "") || !HEX.test(foreground ?? "")) continue;
        const ratio = contrast(foreground, background);
        // Large/bold labels on a solid fill: AA large text is the floor.
        if (ratio < 3) {
          failures.push(`${block.id}: ${contrastToken} on ${fill} is ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
