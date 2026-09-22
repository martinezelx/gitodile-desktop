/** The colour themes GitOdile ships.
 *
 * See ADR 0012 and DESIGN.md § Theming. Two layers decide the colours:
 * the brand identity (declared once in `styles/tokens.css`) and the
 * per-theme colour tokens (declared in `styles/themes.css`). A record here
 * names a theme and its scheme; it never carries the values, and it never
 * touches the brand layer.
 *
 * Only palettes with a canonical, attributable source are admitted as
 * community themes. Each `[data-theme]` block in `styles/themes.css` maps the
 * palette's published colours onto GitOdile's semantic tokens; the mapping is
 * ours and is guarded by a contrast test. */

export const THEME_IDS = [
  "gitodile-light",
  "gitodile-dark",
  "catppuccin-mocha",
  "catppuccin-latte",
  "catppuccin-macchiato",
  "catppuccin-frappe",
  "nord",
  "tokyo-night",
  "dracula",
  "solarized-dark",
  "solarized-light",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** Which side of the light/dark divide a theme belongs to. Used for native
 * `color-scheme` and the titlebar toggle's direction — never for picking
 * specific token values. */
export type ThemeScheme = "light" | "dark";

/** `official` records carry GitOdile's own palette and are the ones the
 * titlebar toggle and "match device" cycle through. `community` records map a
 * canonical third-party palette. */
export type ThemeSource = "official" | "community";

export type ThemeRecord = {
  id: ThemeId;
  /** A proper name, shown as-is in every language. */
  name: string;
  scheme: ThemeScheme;
  source: ThemeSource;
};

export const THEMES: readonly ThemeRecord[] = [
  { id: "gitodile-light", name: "GitOdile Light", scheme: "light", source: "official" },
  { id: "gitodile-dark", name: "GitOdile Dark", scheme: "dark", source: "official" },
  // Canonical palettes: catppuccin.com/palette, nordtheme.com, Tokyo Night
  // (enkia/tokyo-night-vscode-theme), draculatheme.com, Solarized
  // (ethanschoonover.com/solarized).
  { id: "catppuccin-mocha", name: "Catppuccin Mocha", scheme: "dark", source: "community" },
  { id: "catppuccin-latte", name: "Catppuccin Latte", scheme: "light", source: "community" },
  { id: "catppuccin-macchiato", name: "Catppuccin Macchiato", scheme: "dark", source: "community" },
  { id: "catppuccin-frappe", name: "Catppuccin Frappé", scheme: "dark", source: "community" },
  { id: "nord", name: "Nord", scheme: "dark", source: "community" },
  { id: "tokyo-night", name: "Tokyo Night", scheme: "dark", source: "community" },
  { id: "dracula", name: "Dracula", scheme: "dark", source: "community" },
  { id: "solarized-dark", name: "Solarized Dark", scheme: "dark", source: "community" },
  { id: "solarized-light", name: "Solarized Light", scheme: "light", source: "community" },
];

/** The official pair, in the order the picker and the toggle present them. */
export const OFFICIAL_THEMES: readonly ThemeRecord[] = THEMES.filter(
  (theme) => theme.source === "official",
);

/** Community themes, in declaration order. */
export const COMMUNITY_THEMES: readonly ThemeRecord[] = THEMES.filter(
  (theme) => theme.source === "community",
);

/** The user's stored preference. `system` is not a theme: it resolves to one
 * of the official records from the operating-system colour scheme. */
export type ThemePreference = "system" | ThemeId;

const THEME_ID_SET: ReadonlySet<string> = new Set(THEME_IDS);

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_ID_SET.has(value);
}

export function themeById(id: ThemeId): ThemeRecord {
  const record = THEMES.find((theme) => theme.id === id);
  if (!record) {
    // Unreachable while `id` is a ThemeId; the throw keeps a future cast from
    // silently returning undefined.
    throw new Error(`Unknown theme id: ${id}`);
  }
  return record;
}

/** True for the two records that carry GitOdile's own palette, which are the
 * ones "match device" resolves between and the quick toggle flips between. */
export function isOfficialTheme(id: ThemeId): boolean {
  return themeById(id).source === "official";
}
