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
export const SETTINGS_SECTIONS = ["general", "appearance", "reading", "git"] as const;

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
  },
): string {
  return section === "general"
    ? t.settingsGeneralTitle
    : section === "appearance"
      ? t.settingsInterfaceTitle
      : section === "reading"
        ? t.settingsReadingTitle
        : t.settingsGitTitle;
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
