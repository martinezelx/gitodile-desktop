/** Application settings and Git tooling readiness.
 *
 * These types describe what the Settings overlay shows and changes. They are
 * wire-shaped because the Rust side owns their vocabulary, but the feature —
 * not the composition root — owns their meaning. */

/** The user's stored preference, which is not the resolved theme: `system`
 * follows the OS and only resolves at render time. */
export type ThemePreference = "system" | "light" | "dark";

/** The panel's sections, in rail order. The list is the feature's to define,
 * but the *selection* is app state: it persists between openings and the
 * dialog header can steer it, so it arrives as a prop. */
export const SETTINGS_SECTIONS = ["general", "appearance", "reading", "git", "line-endings"] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function isSettingsSection(value: unknown): value is SettingsSection {
  return SETTINGS_SECTIONS.includes(value as SettingsSection);
}

/** The rail label for a section. Exported because the command palette offers
 * one entry per section and must name them exactly as the rail does. */
export function settingsSectionLabel(
  section: SettingsSection,
  t: {
    settingsGeneralTitle: string;
    settingsInterfaceTitle: string;
    settingsReadingTitle: string;
    settingsGitTitle: string;
    settingsLineEndingsTitle: string;
  },
): string {
  return section === "general"
    ? t.settingsGeneralTitle
    : section === "appearance"
      ? t.settingsInterfaceTitle
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
