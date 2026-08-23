import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  DEFAULT_DIFF_PREFERENCES,
  isDiffCodeFont,
  isDiffTabWidth,
  type DiffPreferences,
} from "../features/changes";
import type { ThemePreference } from "../features/settings";

const THEME_STORAGE_KEY = "gitodrile-theme";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "gitodrile-sidebar-collapsed";
export const REOPEN_LAST_PROJECT_STORAGE_KEY = "gitodrile-reopen-last-project";
export const CONFIRM_CLOSE_PROJECT_STORAGE_KEY = "gitodrile-confirm-close-project";
export const WATCH_PROJECTS_STORAGE_KEY = "gitodrile-watch-projects";
export const CONFIRM_DISCARD_STORAGE_KEY = "gitodrile-confirm-discard";

export const DIFF_PREFERENCES_STORAGE_KEY = "gitodrile-diff-preferences";

/** Named because two places need to agree on them: the hook that seeds the
 * preference and the Settings panel's "reset this section". */
export const REOPEN_LAST_PROJECT_DEFAULT = false;
export const CONFIRM_CLOSE_PROJECT_DEFAULT = true;
/** Both default to on: watching is what makes the screens live, and asking
 * before a destructive change is the safe answer. Turning either off is a
 * deliberate choice, never something the app arrives at on its own. */
export const WATCH_PROJECTS_DEFAULT = true;
export const CONFIRM_DISCARD_DEFAULT = true;

export function readStoredBoolean(key: string, defaultValue: boolean): boolean {
  const stored = localStorage.getItem(key);
  return stored === null ? defaultValue : stored === "true";
}

function readStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** Exported so the titlebar reveal can pin the attribute inside its view
 * transition callback: the hook below applies it from a passive effect, which
 * is not guaranteed to have run by the time the transition captures the DOM. */
export function applyTheme(theme: ThemePreference): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function useThemePreference(): [ThemePreference, Dispatch<SetStateAction<ThemePreference>>] {
  const [theme, setTheme] = useState<ThemePreference>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}

export function resolveEffectiveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useStoredBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [value, setValue] = useState(() => readStoredBoolean(key, defaultValue));
  useEffect(() => localStorage.setItem(key, String(value)), [key, value]);
  return [value, setValue];
}

/** Stored as one JSON object rather than four keys: they are read together on
 * every diff render, and a partly-written set would be meaningless. Every
 * field is validated individually so a stored value from an older shape — or
 * a hand-edited one — degrades to that field's default instead of taking the
 * whole set down with it. */
export function useStoredDiffPreferences(): [DiffPreferences, Dispatch<SetStateAction<DiffPreferences>>] {
  const [preferences, setPreferences] = useState<DiffPreferences>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(DIFF_PREFERENCES_STORAGE_KEY) ?? "null");
      if (stored === null || typeof stored !== "object") {
        return DEFAULT_DIFF_PREFERENCES;
      }
      const read = stored as Partial<Record<keyof DiffPreferences, unknown>>;
      const boolean = (value: unknown, fallback: boolean): boolean =>
        typeof value === "boolean" ? value : fallback;
      return {
        wrapLines: boolean(read.wrapLines, DEFAULT_DIFF_PREFERENCES.wrapLines),
        ignoreWhitespace: boolean(read.ignoreWhitespace, DEFAULT_DIFF_PREFERENCES.ignoreWhitespace),
        tabWidth: isDiffTabWidth(read.tabWidth) ? read.tabWidth : DEFAULT_DIFF_PREFERENCES.tabWidth,
        syntaxHighlighting: boolean(read.syntaxHighlighting, DEFAULT_DIFF_PREFERENCES.syntaxHighlighting),
        codeFont: isDiffCodeFont(read.codeFont) ? read.codeFont : DEFAULT_DIFF_PREFERENCES.codeFont,
      };
    } catch {
      return DEFAULT_DIFF_PREFERENCES;
    }
  });

  useEffect(() => {
    localStorage.setItem(DIFF_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  return [preferences, setPreferences];
}

