/** Application settings and Git tooling readiness.
 *
 * These types describe what the Settings overlay shows and changes. They are
 * wire-shaped because the Rust side owns their vocabulary, but the feature —
 * not the composition root — owns their meaning. */

/** The user's stored preference, which is not the resolved theme: `system`
 * follows the OS and only resolves at render time. */
export type ThemePreference = "system" | "light" | "dark";

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
