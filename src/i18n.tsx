import React, { createContext, useContext, useEffect, useState } from "react";
import { locale as getOsLocale } from "@tauri-apps/plugin-os";
import { appTranslations } from "./app/translations";
import { changesTranslations } from "./features/changes/translations";
import { cloneTranslations } from "./features/clone/translations";
import { overviewTranslations } from "./features/overview/translations";
import { publishTranslations } from "./features/publish/translations";
import { saveVersionTranslations } from "./features/save-version/translations";
import { settingsTranslations } from "./features/settings/translations";
import { statusTranslations } from "./features/status/translations";
import { syncTranslations } from "./features/sync/translations";
import { versionLinesTranslations } from "./features/version-lines/translations";
import { sharedTranslations } from "./shared/i18n";

export type Language = "en" | "es";
export type LanguagePreference = "system" | Language;

const LANGUAGE_STORAGE_KEY = "gitodrile-language";

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
  overview: overviewTranslations,
  status: statusTranslations,
  sync: syncTranslations,
  changes: changesTranslations,
  saveVersion: saveVersionTranslations,
  settings: settingsTranslations,
  publish: publishTranslations,
  versionLines: versionLinesTranslations,
} as const;

const en = {
  ...appTranslations.en,
  ...sharedTranslations.en,
  ...cloneTranslations.en,
  ...overviewTranslations.en,
  ...statusTranslations.en,
  ...syncTranslations.en,
  ...changesTranslations.en,
  ...saveVersionTranslations.en,
  ...settingsTranslations.en,
  ...publishTranslations.en,
  ...versionLinesTranslations.en,
};

export type Translations = typeof en;

const es: Translations = {
  ...appTranslations.es,
  ...sharedTranslations.es,
  ...cloneTranslations.es,
  ...overviewTranslations.es,
  ...statusTranslations.es,
  ...syncTranslations.es,
  ...changesTranslations.es,
  ...saveVersionTranslations.es,
  ...settingsTranslations.es,
  ...publishTranslations.es,
  ...versionLinesTranslations.es,
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

interface LanguageContextValue {
  languagePreference: LanguagePreference;
  setLanguagePreference: (preference: LanguagePreference) => void;
  language: Language;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>(() =>
    readStoredLanguagePreference(),
  );
  const [systemLanguage, setSystemLanguage] = useState<Language>(() => readNavigatorLanguage());

  useEffect(() => {
    getOsLocale()
      .then((value) => {
        if (value) setSystemLanguage(resolveLanguage(value));
      })
      .catch(() => undefined);
  }, []);

  const setLanguagePreference = (preference: LanguagePreference): void => {
    setLanguagePreferenceState(preference);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  };

  const language: Language = languagePreference === "system" ? systemLanguage : languagePreference;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <LanguageContext.Provider
      value={{ languagePreference, setLanguagePreference, language, t: translations[language] }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider");
  return context;
}
