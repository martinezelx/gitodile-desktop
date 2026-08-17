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
