import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ThemePreference } from "../features/settings";

const THEME_STORAGE_KEY = "gitodrile-theme";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "gitodrile-sidebar-collapsed";
export const REOPEN_LAST_PROJECT_STORAGE_KEY = "gitodrile-reopen-last-project";
export const CONFIRM_CLOSE_PROJECT_STORAGE_KEY = "gitodrile-confirm-close-project";

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
