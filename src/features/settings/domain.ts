/** Application settings and Git tooling readiness.
 *
 * These types describe what the Settings overlay shows and changes. They are
 * wire-shaped because the Rust side owns their vocabulary, but the feature —
 * not the composition root — owns their meaning. */

/** The user's stored preference, which is not the resolved theme: `system`
 * follows the OS and only resolves at render time. */
export type ThemePreference = "system" | "light" | "dark";

/** Network polling is opt-in. Zero means manual checks only, and the presets
 * are the answers most people want without thinking about it.
 *
 * The cadence used to be *only* these four, on the reasoning that a shorter
 * one is background credential and network churn for no safety gain. That
 * reasoning still holds as a default; it was never a reason to refuse someone
 * who knows their remote and wants five minutes — or who finds even an hour
 * too eager and wants five. So the stored value is a plain minute count, the
 * presets are shortcuts into it, and the bounds are the only rule. */
export const REMOTE_CHECK_PRESETS = [0, 15, 30, 60] as const;
export const REMOTE_CHECK_MIN_MINUTES = 1;
/** A day. Past this the timer is indistinguishable from "never" for a session
 * that is rarely open that long, and the number stops meaning anything. */
export const REMOTE_CHECK_MAX_MINUTES = 24 * 60;

/** Minutes between automatic checks; `0` is off. Not a union of the presets:
 * any whole number in range is a real answer. */
export type RemoteCheckIntervalMinutes = number;

export function isRemoteCheckIntervalMinutes(value: unknown): value is RemoteCheckIntervalMinutes {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (value === 0 ||
      (value >= REMOTE_CHECK_MIN_MINUTES && value <= REMOTE_CHECK_MAX_MINUTES))
  );
}

export function isRemoteCheckPreset(minutes: number): boolean {
  return REMOTE_CHECK_PRESETS.some((preset) => preset === minutes);
}

/** Minutes or hours, so "every 5 hours" is typed as `5` rather than as `300`
 * and read back the same way. */
export const REMOTE_CHECK_UNITS = ["minutes", "hours"] as const;
export type RemoteCheckUnit = (typeof REMOTE_CHECK_UNITS)[number];

/** The stored minute count as the pair the custom field shows. Hours only when
 * the count is a whole number of them, so 90 minutes stays 90 minutes instead
 * of becoming an unrepresentable 1.5 hours. */
export function splitRemoteCheckInterval(minutes: number): {
  value: number;
  unit: RemoteCheckUnit;
} {
  return minutes >= 60 && minutes % 60 === 0
    ? { value: minutes / 60, unit: "hours" }
    : { value: minutes, unit: "minutes" };
}

/** The typed pair back to a minute count, or `null` when it is not one this
 * app will accept. The caller keeps showing what was typed and reports the
 * problem rather than silently clamping to a cadence nobody asked for. */
export function combineRemoteCheckInterval(
  value: number,
  unit: RemoteCheckUnit,
): RemoteCheckIntervalMinutes | null {
  if (!Number.isInteger(value) || value <= 0) return null;
  const minutes = unit === "hours" ? value * 60 : value;
  return isRemoteCheckIntervalMinutes(minutes) && minutes !== 0 ? minutes : null;
}

/** The project rail keeps its width in both modes. "Icons only" compacts the
 * destinations vertically by removing their labels, while preserving the
 * same pointer target and the accessible name. */
export type NavigationDisplayMode = "icons-and-text" | "icons-only";

/** App-local interface preference. Destination ids are strings on purpose:
 * Settings receives the current registry from the composition root instead
 * of importing the screen registry and crossing the feature boundary. */
export type NavigationPreferences = {
  visibleDestinationIds: string[];
  destinationOrderIds: string[];
  displayMode: NavigationDisplayMode;
};

/** The panel's sections, in rail order. The list is the feature's to define,
 * but the *selection* is app state: opening lands on General unless a caller
 * names a section, and the dialog header can steer it, so it arrives as a
 * prop. */
export const SETTINGS_SECTIONS = [
  "general",
  "appearance",
  "navigation",
  "reading",
  "git",
  "line-endings",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** The rail label for a section. Exported because the command palette offers
 * one entry per section and must name them exactly as the rail does. */
export function settingsSectionLabel(
  section: SettingsSection,
  t: {
    settingsGeneralTitle: string;
    settingsInterfaceTitle: string;
    settingsNavigationTitle: string;
    settingsReadingTitle: string;
    settingsGitTitle: string;
    settingsLineEndingsTitle: string;
  },
): string {
  return section === "general"
    ? t.settingsGeneralTitle
    : section === "appearance"
      ? t.settingsInterfaceTitle
      : section === "navigation"
        ? t.settingsNavigationTitle
        : section === "reading"
          ? t.settingsReadingTitle
          : section === "git"
            ? t.settingsGitTitle
            : t.settingsLineEndingsTitle;
}

export type GitDiagnostics = {
  state: "available" | "missing" | "unusable" | "check_failed";
  version: string | null;
};

export type GitInstallationResult = {
  outcome: "started" | "guidance" | "already_starting" | "failed";
  platform: "windows" | "macos" | "linux" | "unsupported";
  guidanceUrl: string | null;
};

export type GitUpdateStatus = {
  state: "checking" | "unavailable" | "up_to_date" | "update_available" | "failed" | "timed_out";
  cached: boolean;
};

export type GitUpdateLaunchResult = {
  outcome: "started" | "already_starting" | "unavailable" | "failed";
};

export type GitIdentity = { name: string | null; email: string | null };

/** The name Git gives a new project's first version line, from the global
 * `init.defaultBranch`. `null` means the key is unset and Git's own built-in
 * default applies — a state to report, not a name to claim. */
export type GitDefaultBranch = { name: string | null };

/** The two names offered as one-click choices. Anything else is typed, which
 * is the point: this is a preference, not an allow-list. */
export const DEFAULT_BRANCH_SUGGESTIONS = ["main", "master"] as const;

/** The name GitOdrile gives a new project when `init.defaultBranch` is unset.
 *
 * Git's own fallback in that case is `master`, but GitOdrile is the thing
 * creating the project — it writes the initial ref itself — so `main` is what
 * actually happens, and the panel shows it selected rather than showing nothing
 * and leaving the reader to guess. It is still not written to the user's config
 * until they pick an option; the panel says so. */
export const DEFAULT_BRANCH_FALLBACK = "main";

/** What Git is doing to line endings, named by behaviour rather than by the
 * `core.autocrlf` value behind it. The panel never has to say "autocrlf", and
 * only the adapter and Rust know which config value each choice writes. */
export type LineEndingMode = "windows_checkout" | "normalize" | "keep_as_is" | "not_set";

/** The three the user can pick: "not set" is a state to report, never a choice
 * to offer, because writing it back is a deletion rather than a setting. */
export const LINE_ENDING_CHOICES = ["windows_checkout", "normalize", "keep_as_is"] as const;

export type LineEndingChoice = (typeof LINE_ENDING_CHOICES)[number];

export type GitLineEndings = {
  mode: LineEndingMode;
  /** Where the value in effect came from. `project` means the open project
   * answers differently from the global config, so the global value is not the
   * one applying here. */
  source: "global" | "project" | "unset";
  eol: string | null;
  /** The open project carries `.gitattributes` rules about text or line
   * endings, which take precedence over any of these choices for the files
   * they match. */
  projectAttributes: boolean;
};

/** The choice that suits the platform, offered as a recommendation rather than
 * applied silently: on Windows, keeping CRLF in the working tree is what stops
 * other Windows tools from tripping, while everywhere else there is nothing to
 * convert on the way out. An unknown platform recommends nothing rather than
 * guessing, so no one is nudged towards the wrong one. */
export function recommendedLineEndingChoice(platform: string | null): LineEndingChoice | null {
  return platform === null ? null : platform === "windows" ? "windows_checkout" : "normalize";
}
