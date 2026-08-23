import React, { createContext, useContext } from "react";

/** How a diff should be read. Owned by this feature because it describes the
 * diff viewer, not the app shell — Settings only edits it, and the app only
 * stores it.
 *
 * Delivered through context rather than props because the two consumers are
 * far apart: the Changes screen and the pending-versions list under Overview,
 * which reach `DiffResultView` through entirely different panels. */
export type DiffPreferences = {
  /** Off puts long lines on one row with horizontal scrolling. */
  wrapLines: boolean;
  /** Collapses an add/remove pair whose contents differ only in whitespace
   * back into the single unchanged line it really is. */
  ignoreWhitespace: boolean;
  tabWidth: DiffTabWidth;
  syntaxHighlighting: boolean;
  /** Which monospaced family code is drawn in. */
  codeFont: DiffCodeFont;
};

/** The families on offer, in rail order. Deliberately short and deliberately
 * ligature-free: in a diff, a `!=` fused into a single glyph hides the very
 * character that changed. `system` is a real choice rather than only a
 * fallback — it is the answer for anyone who wants code here to look like code
 * everywhere else on their machine. */
export const DIFF_CODE_FONTS = ["atkinson", "jetbrains", "plex", "system"] as const;

export type DiffCodeFont = (typeof DIFF_CODE_FONTS)[number];

export function isDiffCodeFont(value: unknown): value is DiffCodeFont {
  return DIFF_CODE_FONTS.includes(value as DiffCodeFont);
}

/** Every stack ends in the same system fallbacks, so a face that fails to load
 * degrades to a monospaced font rather than to the UI sans-serif — which would
 * silently break the column alignment the diff depends on. */
const SYSTEM_MONO_STACK = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';

export const DIFF_CODE_FONT_STACKS: Record<DiffCodeFont, string> = {
  atkinson: `"Atkinson Hyperlegible Mono", ${SYSTEM_MONO_STACK}`,
  jetbrains: `"JetBrains Mono", ${SYSTEM_MONO_STACK}`,
  plex: `"IBM Plex Mono", ${SYSTEM_MONO_STACK}`,
  system: SYSTEM_MONO_STACK,
};

export const DIFF_TAB_WIDTHS = [2, 4, 8] as const;

export type DiffTabWidth = (typeof DIFF_TAB_WIDTHS)[number];

export function isDiffTabWidth(value: unknown): value is DiffTabWidth {
  return DIFF_TAB_WIDTHS.includes(value as DiffTabWidth);
}

/** Every default reproduces what the viewer did before it was configurable.
 * `tabWidth: 8` in particular is CSS's initial `tab-size`, which is what the
 * diff has always rendered with — see the task-058 decision. */
export const DEFAULT_DIFF_PREFERENCES: DiffPreferences = {
  wrapLines: true,
  ignoreWhitespace: false,
  tabWidth: 8,
  syntaxHighlighting: true,
  codeFont: "atkinson",
};

const DiffPreferencesContext = createContext<DiffPreferences>(DEFAULT_DIFF_PREFERENCES);

export function DiffPreferencesProvider({
  value,
  children,
}: {
  value: DiffPreferences;
  children: React.ReactNode;
}): React.JSX.Element {
  return <DiffPreferencesContext.Provider value={value}>{children}</DiffPreferencesContext.Provider>;
}

/** Falls back to the defaults with no provider above, so a diff rendered
 * outside the app shell — a test, or a future embed — still renders. */
export function useDiffPreferences(): DiffPreferences {
  return useContext(DiffPreferencesContext);
}
