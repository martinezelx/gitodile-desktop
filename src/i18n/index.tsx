import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { locale as getOsLocale } from "@tauri-apps/plugin-os";
import type { en as englishDictionary } from "./en";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_NUMBER_FORMAT,
  formatDate,
  formatNumber,
  isDateFormatPreference,
  isNumberFormatPreference,
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

/* What each language card in Settings shows under its name: the product's own
   words in that language, so a reader judges the language by how GitOdile
   reads in it. Outside the dictionaries for the same reason as the names, and
   because only the active dictionary is loaded. */
export const LANGUAGE_SPECIMENS: Record<Language, string> = {
  en: "Everything is saved · Publish changes",
  es: "Todo está guardado · Publicar cambios",
};

export type Translations = typeof englishDictionary;

/* Each language is its own chunk, so launch evaluates only the active one
   (task 209). The bootstrap awaits `loadTranslations(initialLanguage())`
   before the first render, which keeps the first frame free of keys and of a
   fallback language; a later switch keeps the current copy until the other
   dictionary has loaded. */
const dictionaryLoaders: Record<Language, () => Promise<Translations>> = {
  en: () => import("./en").then((module) => module.en),
  es: () => import("./es").then((module) => module.es),
};
const loadedDictionaries: Partial<Record<Language, Translations>> = {};
const pendingDictionaries: Partial<Record<Language, Promise<Translations>>> = {};

export function loadTranslations(language: Language): Promise<Translations> {
  const loaded = loadedDictionaries[language];
  if (loaded) return Promise.resolve(loaded);
  pendingDictionaries[language] ??= dictionaryLoaders[language]().then(
    (dictionary) => {
      loadedDictionaries[language] = dictionary;
      return dictionary;
    },
    (error: unknown) => {
      // Let a later switch try again instead of caching the failure.
      delete pendingDictionaries[language];
      throw error;
    },
  );
  return pendingDictionaries[language];
}

/** The language the first frame shows: the stored choice, or the webview's
 * locale until the OS locale answers. The provider starts from the same
 * answer, so the dictionary the bootstrap awaited is the one it renders. */
export function initialLanguage(): Language {
  const preference = readStoredLanguagePreference();
  return preference === "system" ? readNavigatorLanguage() : preference;
}

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
  /** The language "system" resolves to, for Settings to show beside it. */
  systemLanguage: Language;
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

interface LanguageProviderProps {
  children: React.ReactNode;
  /** Wraps the commit of a language the user picked, once its dictionary is
   * loaded, so the composition can animate it. Without one the change lands at
   * once, which is what tests and the bootstrap's fallback want. */
  animateLanguageChange?: (applyLanguage: () => void) => void;
}

export function LanguageProvider({ children, animateLanguageChange }: LanguageProviderProps): React.JSX.Element {
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

  const setDateFormat = useCallback((format: DateFormatPreference): void => {
    setDateFormatState(format);
    localStorage.setItem(DATE_FORMAT_STORAGE_KEY, format);
  }, []);

  const setNumberFormat = useCallback((format: NumberFormatPreference): void => {
    setNumberFormatState(format);
    localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, format);
  }, []);

  const requestedLanguage: Language = languagePreference === "system" ? systemLanguage : languagePreference;
  /* The language on screen. It follows the request as soon as that
     dictionary is loaded and keeps the previous one until then, so a switch
     (or the OS locale answering differently) never paints keys. */
  const [shownLanguage, setShownLanguage] = useState<Language>(() =>
    loadedDictionaries[requestedLanguage]
      ? requestedLanguage
      : ((Object.keys(loadedDictionaries) as Language[])[0] ?? requestedLanguage),
  );
  const language: Language = loadedDictionaries[requestedLanguage] ? requestedLanguage : shownLanguage;
  useEffect(() => {
    if (language === requestedLanguage) {
      setShownLanguage(requestedLanguage);
      return undefined;
    }
    let current = true;
    loadTranslations(requestedLanguage).then(
      () => {
        if (current) setShownLanguage(requestedLanguage);
      },
      // A dictionary that fails to load leaves the current language in place.
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [language, requestedLanguage]);
  /* A change that alters the words on screen waits for the dictionary before
     it starts animating, so the outgoing frame is captured while the old words
     are still shown and the fade never covers a load. A change that keeps the
     words (to "system" resolving to the same language) commits at once. Only
     the latest pick commits: a load that answers after a newer pick would
     otherwise put back the language the user just left. */
  const latestLanguagePick = useRef(0);
  const setLanguagePreference = useCallback(
    (preference: LanguagePreference): void => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
      const pick = ++latestLanguagePick.current;
      const commit = (): void => {
        if (pick === latestLanguagePick.current) setLanguagePreferenceState(preference);
      };
      const next: Language = preference === "system" ? systemLanguage : preference;
      if (!animateLanguageChange || next === language) {
        commit();
        return;
      }
      loadTranslations(next).then(
        () => animateLanguageChange(commit),
        // The provider keeps the current language until a dictionary loads.
        commit,
      );
    },
    [animateLanguageChange, language, systemLanguage],
  );
  const t = loadedDictionaries[language];
  if (!t) {
    throw new Error(`The ${language} dictionary must be loaded with loadTranslations before the first render.`);
  }
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
      systemLanguage,
      t,
      formats,
      setDateFormat,
      setNumberFormat,
      formatDate: (date: Date, style?: DateStyle) => formatDate(date, formats, style),
      formatNumber: (input: number) => formatNumber(input, formats),
    }),
    [
      formats,
      language,
      languagePreference,
      setDateFormat,
      setLanguagePreference,
      setNumberFormat,
      systemLanguage,
      t,
    ],
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
