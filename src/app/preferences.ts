import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { isSettingsSection, type SettingsSection, type ThemePreference } from "../features/settings";

const THEME_STORAGE_KEY = "gitodrile-theme";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "gitodrile-sidebar-collapsed";
export const REOPEN_LAST_PROJECT_STORAGE_KEY = "gitodrile-reopen-last-project";
export const CONFIRM_CLOSE_PROJECT_STORAGE_KEY = "gitodrile-confirm-close-project";
export const SETTINGS_SECTION_STORAGE_KEY = "gitodrile-settings-section";

/** Named because two places need to agree on them: the hook that seeds the
 * preference and the Settings panel's "reset this section". */
export const REOPEN_LAST_PROJECT_DEFAULT = false;
export const CONFIRM_CLOSE_PROJECT_DEFAULT = true;

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

/** Which Settings section to reopen on. Stored rather than reset because a user
 * who came back for the Git section almost always wants it twice: closing the
 * dialog is not an instruction to forget where they were. */
export function useSettingsSection(): [SettingsSection, Dispatch<SetStateAction<SettingsSection>>] {
  const [section, setSection] = useState<SettingsSection>(() => {
    const stored = localStorage.getItem(SETTINGS_SECTION_STORAGE_KEY);
    return isSettingsSection(stored) ? stored : "general";
  });
  useEffect(() => localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, section), [section]);
  return [section, setSection];
}
