import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { locale as getOsLocale } from "@tauri-apps/plugin-os";
import { appTranslations } from "../app/translations";
import { changesTranslations } from "../features/changes/translations";
import { cloneTranslations } from "../features/clone/translations";
import { initializeProjectTranslations } from "../features/initialize-project/translations";
import { notificationsTranslations } from "../features/notifications/translations";
import { historyTranslations } from "../features/history/translations";
import { overviewTranslations } from "../features/overview/translations";
import { projectSettingsTranslations } from "../features/project-settings/translations";
import { publishTranslations } from "../features/publish/translations";
import { saveVersionTranslations } from "../features/save-version/translations";
import { settingsTranslations } from "../features/settings/translations";
import { statusTranslations } from "../features/status/translations";
import { syncTranslations } from "../features/sync/translations";
import { versionLinesTranslations } from "../features/version-lines/translations";
import { workbenchTranslations } from "../features/workbench/translations";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_NUMBER_FORMAT,
  formatDate,
  formatNumber,
  isDateFormatPreference,
  isNumberFormatPreference,
  sharedTranslations,
  type DateFormatPreference,
  type DateStyle,
  type LocaleFormats,
  type NumberFormatPreference,
} from "../shared/i18n";

export type Language = "en" | "es";
export type LanguagePreference = "system" | Language;

const LANGUAGE_STORAGE_KEY = "gitodile-language";
/* Dates and numbers are stored beside the language and read by the same
   provider: they answer the same question — how this interface reads — and a
   surface that has one always wants the others. */
const DATE_FORMAT_STORAGE_KEY = "gitodile-date-format";
const NUMBER_FORMAT_STORAGE_KEY = "gitodile-number-format";

// Names of the languages themselves are shown in their own language
// regardless of the active UI language, so they stay outside the dictionaries.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
};

export const translationNamespaces = {
  app: appTranslations,
  shared: sharedTranslations,
  clone: cloneTranslations,
  initializeProject: initializeProjectTranslations,
  notifications: notificationsTranslations,
  history: historyTranslations,
  overview: overviewTranslations,
  status: statusTranslations,
  sync: syncTranslations,
  changes: changesTranslations,
  saveVersion: saveVersionTranslations,
  settings: settingsTranslations,
  projectSettings: projectSettingsTranslations,
  publish: publishTranslations,
  versionLines: versionLinesTranslations,
  workbench: workbenchTranslations,
} as const;

const en = {
  ...appTranslations.en,
  ...sharedTranslations.en,
  ...cloneTranslations.en,
  ...initializeProjectTranslations.en,
  ...notificationsTranslations.en,
  ...historyTranslations.en,
  ...overviewTranslations.en,
  ...statusTranslations.en,
  ...syncTranslations.en,
  ...changesTranslations.en,
  ...saveVersionTranslations.en,
  ...settingsTranslations.en,
  ...projectSettingsTranslations.en,
  ...publishTranslations.en,
  ...versionLinesTranslations.en,
  ...workbenchTranslations.en,
};

export type Translations = typeof en;

const es: Translations = {
  ...appTranslations.es,
  ...sharedTranslations.es,
  ...cloneTranslations.es,
  ...initializeProjectTranslations.es,
  ...notificationsTranslations.es,
  ...historyTranslations.es,
  ...overviewTranslations.es,
  ...statusTranslations.es,
  ...syncTranslations.es,
  ...changesTranslations.es,
  ...saveVersionTranslations.es,
  ...settingsTranslations.es,
  ...projectSettingsTranslations.es,
  ...publishTranslations.es,
  ...versionLinesTranslations.es,
  ...workbenchTranslations.es,
};

/** All namespaces are composed eagerly so lazy screens never paint keys or a fallback locale. */
export const translations: Record<Language, Translations> = { en, es };

// Pure on purpose: unknown languages fall back to English.
export function resolveLanguage(locale: string | null | undefined): Language {
  if (!locale) return "en";
  const primarySubtag = locale.split(/[-_]/)[0]?.toLowerCase();
  return primarySubtag === "es" ? "es" : "en";
}

function readStoredLanguagePreference(): LanguagePreference {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === "en" || stored === "es" ? stored : "system";
}

function readNavigatorLanguage(): Language {
  return resolveLanguage(typeof navigator === "undefined" ? null : navigator.language);
}

function readStoredDateFormat(): DateFormatPreference {
  const stored = localStorage.getItem(DATE_FORMAT_STORAGE_KEY);
  return isDateFormatPreference(stored) ? stored : DEFAULT_DATE_FORMAT;
}

function readStoredNumberFormat(): NumberFormatPreference {
  const stored = localStorage.getItem(NUMBER_FORMAT_STORAGE_KEY);
  return isNumberFormatPreference(stored) ? stored : DEFAULT_NUMBER_FORMAT;
}

interface LanguageContextValue {
  languagePreference: LanguagePreference;
  setLanguagePreference: (preference: LanguagePreference) => void;
  language: Language;
  t: Translations;
  /** The active language plus both display formats, as one value to pass
   * down. Surfaces that formatted with `language` alone now pass this. */
  formats: LocaleFormats;
  setDateFormat: (format: DateFormatPreference) => void;
  setNumberFormat: (format: NumberFormatPreference) => void;
  /** Bound to `formats`, so a caller never has to remember to pass it. */
  formatDate: (date: Date, style?: DateStyle) => string;
  formatNumber: (value: number) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>(() =>
    readStoredLanguagePreference(),
  );
  const [systemLanguage, setSystemLanguage] = useState<Language>(() => readNavigatorLanguage());
  const [dateFormat, setDateFormatState] = useState<DateFormatPreference>(() =>
    readStoredDateFormat(),
  );
  const [numberFormat, setNumberFormatState] = useState<NumberFormatPreference>(() =>
    readStoredNumberFormat(),
  );

  useEffect(() => {
    getOsLocale()
      .then((value) => {
        if (value) setSystemLanguage(resolveLanguage(value));
      })
      .catch(() => undefined);
  }, []);

  const setLanguagePreference = useCallback((preference: LanguagePreference): void => {
    setLanguagePreferenceState(preference);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  }, []);

  const setDateFormat = useCallback((format: DateFormatPreference): void => {
    setDateFormatState(format);
    localStorage.setItem(DATE_FORMAT_STORAGE_KEY, format);
  }, []);

  const setNumberFormat = useCallback((format: NumberFormatPreference): void => {
    setNumberFormatState(format);
    localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, format);
  }, []);

  const language: Language = languagePreference === "system" ? systemLanguage : languagePreference;
  /* Kept stable across renders because it is a prop, not just a context value:
     History passes it down to memoized, virtualized rows, and a fresh object
     every render would re-render all of them whenever this provider re-rendered
     for an unrelated reason — the OS-locale read at startup resolving to the
     language already in use, for one. */
  const formats: LocaleFormats = useMemo(
    () => ({ language, dateFormat, numberFormat }),
    [language, dateFormat, numberFormat],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({
      languagePreference,
      setLanguagePreference,
      language,
      t: translations[language],
      formats,
      setDateFormat,
      setNumberFormat,
      formatDate: (date: Date, style?: DateStyle) => formatDate(date, formats, style),
      formatNumber: (input: number) => formatNumber(input, formats),
    }),
    [formats, language, languagePreference, setDateFormat, setLanguagePreference, setNumberFormat],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider");
  return context;
}
