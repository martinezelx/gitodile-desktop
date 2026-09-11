import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  DEFAULT_DIFF_PREFERENCES,
  isDiffCodeFont,
  isDiffTabWidth,
  type DiffPreferences,
} from "../features/changes";
import {
  isRemoteCheckIntervalMinutes,
  type NavigationPreferences,
  type RemoteCheckIntervalMinutes,
  type ThemePreference,
} from "../features/settings";
import { stopActiveThemeTransition } from "./themeTransition";

const THEME_STORAGE_KEY = "gitodile-theme";
export const REOPEN_LAST_PROJECT_STORAGE_KEY = "gitodile-reopen-last-project";
export const CONFIRM_CLOSE_PROJECT_STORAGE_KEY = "gitodile-confirm-close-project";
export const WATCH_PROJECTS_STORAGE_KEY = "gitodile-watch-projects";
export const REMOTE_CHECK_INTERVAL_STORAGE_KEY = "gitodile-remote-check-interval";
export const RUN_GIT_HOOKS_STORAGE_KEY = "gitodile-run-git-hooks";
export const CONFIRM_DISCARD_STORAGE_KEY = "gitodile-confirm-discard";
export const NOTIFICATIONS_STORAGE_KEY = "gitodile-notifications";
export const REDUCE_MOTION_STORAGE_KEY = "gitodile-reduce-motion";
export const APP_UPDATE_AUTOMATIC_STORAGE_KEY = "gitodile-app-update-automatic";

export const DIFF_PREFERENCES_STORAGE_KEY = "gitodile-diff-preferences";
export const NAVIGATION_PREFERENCES_STORAGE_KEY = "gitodile-navigation-preferences";
export const SIDEBAR_HIDDEN_STORAGE_KEY = "gitodile-sidebar-hidden";
export const FAVOURITE_PROJECTS_STORAGE_KEY = "gitodile-favourite-projects";

/** Named because two places need to agree on them: the hook that seeds the
 * preference and the Settings panel's "reset this section". */
export const REOPEN_LAST_PROJECT_DEFAULT = false;
export const CONFIRM_CLOSE_PROJECT_DEFAULT = true;
/** Both default to on: watching is what makes the screens live, and asking
 * before a destructive change is the safe answer. Turning either off is a
 * deliberate choice, never something the app arrives at on its own. */
export const WATCH_PROJECTS_DEFAULT = true;
/** Named like the rest so the repair below can recognise it, rather than the
 * call site passing a bare `false`. */
export const SIDEBAR_HIDDEN_DEFAULT = false;
export const REMOTE_CHECK_INTERVAL_DEFAULT: RemoteCheckIntervalMinutes = 0;
export const CONFIRM_DISCARD_DEFAULT = true;
/** On, like GitHub Desktop's own default. The centre only records what the app
 * already did — it starts no timer, opens no connection and shows nothing until
 * the bell is opened — so the cost of leaving it on is a badge, and the cost of
 * defaulting it off is that the one surface reporting background outcomes is
 * invisible to everyone who never went looking for a setting.
 *
 * Deliberately absent from `REPAIRABLE_DEFAULTS`: that list exists for keys the
 * eager-write bug had already frozen in storage, and this one is newer than the
 * fix. */
export const NOTIFICATIONS_DEFAULT = true;
/** Off keeps GitOdile's full motion language. The operating system preference
 * is still respected independently, whether or not this app-specific choice
 * has ever been made. */
export const REDUCE_MOTION_DEFAULT = false;
/** Network contact for application updates is an explicit opt-in. */
export const APP_UPDATE_AUTOMATIC_DEFAULT = false;
/** On, because a hook is the project's own rule and skipping it by default
 * would make GitOdile produce commits the same repository would have rejected
 * from a terminal — the same action giving a different result depending on
 * which tool ran it. The people this app is for are the least equipped to work
 * out why CI rejected their work three steps later.
 *
 * The "it runs code from someone else's repository" argument is weaker than it
 * looks: `.git/hooks` is not cloned, so a hook only exists once the user has
 * already run that project's own install step.
 *
 * Turning it off remains a real escape for a slow or broken hook, and then
 * GitOdile passes `--no-verify` to its own commit and push. Nothing is written
 * to the project either way: this changes only what GitOdile's own Git calls
 * do, never what the `git` CLI does. */
export const RUN_GIT_HOOKS_DEFAULT = true;

/**
 * Write a preference to storage when — and only when — it changes.
 *
 * Every hook below used to persist unconditionally from an effect, which meant
 * the *default* was written to storage on the very first render, before the
 * user had chosen anything. From then on that frozen copy outranked the code:
 * changing a default in a later version reached nobody who had ever opened the
 * app, because they all had the old default stored as though they had picked
 * it. That is how the Git-hooks switch kept reporting "off" after its default
 * became "on".
 *
 * So the rule is: storage holds a *choice*, not a state. Nothing is written
 * until the value moves, and an untouched preference keeps following the code.
 *
 * The serialized string is passed in rather than a value plus a serializer:
 * strings compare by value in the dependency list, so an inline serializer
 * cannot cause a write on every render.
 *
 * The condition is a comparison, never a count of effect runs. "Skip the first
 * run" looks equivalent and is not: `StrictMode` mounts, cleans up and remounts
 * the same instance, so the second run sees a spent flag and writes the default
 * anyway — which is exactly the bug this guards against, still happening in
 * development. Comparing the value against storage is idempotent however many
 * times the effect runs.
 */
function usePersistedChoice(key: string, serialized: string): void {
  // What this preference read at mount: either the stored value, or the
  // default when storage held nothing.
  const initial = useRef(serialized);
  useEffect(() => {
    const stored = localStorage.getItem(key);
    // Never chosen: no entry, and still sitting on the value it started with.
    // Writing here is what used to freeze the default.
    if (stored === null && serialized === initial.current) return;
    if (stored === serialized) return;
    localStorage.setItem(key, serialized);
  }, [key, serialized]);
}

const EAGER_DEFAULTS_REPAIRED_KEY = "gitodile-eagerly-stored-defaults-repaired";

/** The scalar preferences the eager-write bug could have created, each with the
 * serialization of the default it would have written. Object stores are left
 * out: their readers already validate field by field, so a new default reaches
 * them without help, and comparing them as strings would depend on key order.
 * Favourites are user data — an empty set is a real answer, not an absent one. */
const REPAIRABLE_DEFAULTS: ReadonlyArray<readonly [string, string]> = [
  [THEME_STORAGE_KEY, "system"],
  [REOPEN_LAST_PROJECT_STORAGE_KEY, String(REOPEN_LAST_PROJECT_DEFAULT)],
  [CONFIRM_CLOSE_PROJECT_STORAGE_KEY, String(CONFIRM_CLOSE_PROJECT_DEFAULT)],
  [WATCH_PROJECTS_STORAGE_KEY, String(WATCH_PROJECTS_DEFAULT)],
  [CONFIRM_DISCARD_STORAGE_KEY, String(CONFIRM_DISCARD_DEFAULT)],
  [SIDEBAR_HIDDEN_STORAGE_KEY, String(SIDEBAR_HIDDEN_DEFAULT)],
  [REMOTE_CHECK_INTERVAL_STORAGE_KEY, String(REMOTE_CHECK_INTERVAL_DEFAULT)],
];

/**
 * One-time repair for values the eager-write bug already put in storage.
 *
 * Two different cases, and only the first needs an exception:
 *
 * - The Git-hooks preference is the one whose default *changed* after being
 *   persisted, so its stored `"false"` no longer matches anything and is
 *   removed outright. It has never shipped — every stored copy came from a
 *   development run of the task that added it — so there is no deliberate
 *   choice to lose.
 * - Every other entry is removed only when it is byte-identical to the default
 *   it would have been written with. Such an entry carries no information:
 *   deleting it changes nothing observable today and lets a future default
 *   reach this machine. Anything the user actually chose differs from the
 *   default and is left alone.
 *
 * It runs once, guarded by its own marker, because a deliberate choice that
 * happens to equal the default is indistinguishable from an eagerly-written one
 * and must survive every launch after this repair. Delete this, its marker and
 * `SIDEBAR_HIDDEN_DEFAULT`'s only other reason to exist once 1.0 has shipped.
 */
export function repairEagerlyStoredDefaults(): void {
  try {
    if (localStorage.getItem(EAGER_DEFAULTS_REPAIRED_KEY) === "true") return;
    localStorage.setItem(EAGER_DEFAULTS_REPAIRED_KEY, "true");
    localStorage.removeItem(RUN_GIT_HOOKS_STORAGE_KEY);
    for (const [key, serializedDefault] of REPAIRABLE_DEFAULTS) {
      if (localStorage.getItem(key) === serializedDefault) localStorage.removeItem(key);
    }
  } catch {
    /* A browser with storage blocked has nothing to repair. */
  }
}

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

  // Applying is not persisting: the attribute has to be written on every
  // render path, while the value is only stored once it has been chosen.
  useEffect(() => applyTheme(theme), [theme]);
  usePersistedChoice(THEME_STORAGE_KEY, theme);

  return [theme, setTheme];
}

function applyReducedMotionPreference(reducedMotion: boolean): void {
  if (reducedMotion) {
    document.documentElement.dataset.reducedMotion = "true";
    stopActiveThemeTransition();
  } else {
    delete document.documentElement.dataset.reducedMotion;
  }
}

/** App-specific motion override. A layout effect applies it before paint so
 * the switch itself cannot animate on the frame that turns motion off. */
export function useReducedMotionPreference(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [reducedMotion, setReducedMotion] = useState(() =>
    readStoredBoolean(REDUCE_MOTION_STORAGE_KEY, REDUCE_MOTION_DEFAULT),
  );

  useLayoutEffect(() => applyReducedMotionPreference(reducedMotion), [reducedMotion]);
  usePersistedChoice(REDUCE_MOTION_STORAGE_KEY, String(reducedMotion));

  return [reducedMotion, setReducedMotion];
}

export function resolveEffectiveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Favourite projects, stored as the canonical worktree roots the session
 * reducer already uses as identity — stable across restarts, path aliases,
 * symlinks and case variants, which a generated session id would not be.
 *
 * A favourite is kept even while its project is closed: closing a project is
 * not un-favouriting it, and the set would otherwise empty itself every time
 * the last window of a project went away. That means the stored set can name
 * projects that are not open, which is why every read filters against what is
 * actually open rather than trusting the list.
 */
export function useStoredFavouriteProjects(): [
  ReadonlySet<string>,
  (id: string) => void,
] {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(FAVOURITE_PROJECTS_STORAGE_KEY) ?? "null",
      );
      return new Set(
        Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [],
      );
    } catch {
      return new Set<string>();
    }
  });

  usePersistedChoice(FAVOURITE_PROJECTS_STORAGE_KEY, JSON.stringify([...ids]));

  const toggle = (id: string): void => {
    setIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  return [ids, toggle];
}

export function useStoredBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [value, setValue] = useState(() => readStoredBoolean(key, defaultValue));
  usePersistedChoice(key, String(value));
  return [value, setValue];
}

export function useStoredRemoteCheckInterval(): [
  RemoteCheckIntervalMinutes,
  Dispatch<SetStateAction<RemoteCheckIntervalMinutes>>,
] {
  const [value, setValue] = useState<RemoteCheckIntervalMinutes>(() => {
    const stored = Number(localStorage.getItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY));
    return isRemoteCheckIntervalMinutes(stored) ? stored : REMOTE_CHECK_INTERVAL_DEFAULT;
  });
  usePersistedChoice(REMOTE_CHECK_INTERVAL_STORAGE_KEY, String(value));
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

  usePersistedChoice(DIFF_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));

  return [preferences, setPreferences];
}

/** The rail order that shipped before History moved up beside Changes. Every
 * session writes the whole snapshot back, so by the time the default changed
 * this exact list was already sitting in storage for everyone who had ever
 * opened the app — including everyone who had never opened Navigation
 * Settings. An order identical to a superseded default is the absence of a
 * choice rather than one, so it adopts the new default; anything else is the
 * user's arrangement and stands. */
const SUPERSEDED_DESTINATION_ORDERS: readonly (readonly string[])[] = [
  ["overview", "changes", "version-lines", "history", "recovery"],
];

function isSupersededOrder(order: readonly string[]): boolean {
  return SUPERSEDED_DESTINATION_ORDERS.some(
    (superseded) =>
      superseded.length === order.length && superseded.every((id, index) => id === order[index]),
  );
}

/** Navigation is stored as one validated snapshot: membership, order and
 * appearance describe one rail, so applying only part of a stale or malformed
 * value would produce a surprising hybrid. Unknown ids are ignored; newly
 * registered destinations are appended without disturbing the user's order. */
export function useStoredNavigationPreferences(
  defaultDestinationIds: readonly string[],
): [NavigationPreferences, Dispatch<SetStateAction<NavigationPreferences>>] {
  const [preferences, setPreferences] = useState<NavigationPreferences>(() => {
    const fallback = (): NavigationPreferences => ({
      visibleDestinationIds: [...defaultDestinationIds],
      destinationOrderIds: [...defaultDestinationIds],
      displayMode: "icons-and-text",
    });
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(NAVIGATION_PREFERENCES_STORAGE_KEY) ?? "null",
      );
      if (stored === null || typeof stored !== "object") return fallback();

      const read = stored as Partial<Record<keyof NavigationPreferences, unknown>>;
      if (!Array.isArray(read.visibleDestinationIds)) return fallback();
      const allowed = new Set(defaultDestinationIds);
      const visibleDestinationIds = Array.from(
        new Set(
          read.visibleDestinationIds.filter(
            (id): id is string => typeof id === "string" && allowed.has(id),
          ),
        ),
      );
      const displayMode =
        read.displayMode === "icons-only" || read.displayMode === "icons-and-text"
          ? read.displayMode
          : "icons-and-text";
      const storedOrder = Array.isArray(read.destinationOrderIds)
        ? read.destinationOrderIds.filter(
            (id): id is string => typeof id === "string" && allowed.has(id),
          )
        : [];
      const destinationOrderIds = isSupersededOrder(storedOrder)
        ? [...defaultDestinationIds]
        : Array.from(new Set([...storedOrder, ...defaultDestinationIds]));
      return { visibleDestinationIds, destinationOrderIds, displayMode };
    } catch {
      return fallback();
    }
  });

  usePersistedChoice(NAVIGATION_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));

  return [preferences, setPreferences];
}
