import type { GitLabTranslations } from "./translations";

export const en: GitLabTranslations = {
  gitlabAuthRepairDetails: "How to repair this connection",
  gitlabAuthRepairHint: "Repair or remove this server's browser session with GitLab CLI (glab), then check connections here. Token connections are independent.",
  gitlabAuthCancel: "Cancel connection",
  gitlabAuthConfirm: "Continue in browser",
  gitlabAuthDisconnect: "Sign out",
  gitlabAuthAccountName: "GitLab account",
  gitlabAuthChip: { connected: "Connected", saved: "Saved", unchecked: "Not checked yet", signed_out: "Not connected", checking: "In progress", invalid: "Needs attention", unavailable: "Unavailable", environment: "Managed externally" },
  gitlabAuthLogoutConsent: "Removes @{login} from GitLab CLI on this computer, for every tool that uses it.",
  gitlabAuthLogoutBrowser: "Your browser session, projects and Git settings don't change.",
  gitlabAuthShared: "It's shared with GitLab CLI, so signing out here also signs out the tools that use it.",
  gitlabAuthStorageConsent: "GitLab CLI saves and renews it, in your system's secure store or in a plain-text file if that fails.",
  gitlabAuthPermissions: "GitLab opens in your browser to authorize GitLab CLI (read_user, api and write_repository).",
  gitlabAuthNeedsCheck: "GitLab CLI may have changed. Check the accounts before trying again.",
  gitlabAuthStatus: {
    unchecked: "Account not checked", checking: "Checking your GitLab account…", signed_out: "No GitLab account connected",
    connected: "Connected", invalid: "The browser connection to GitLab is no longer valid.",
    offline: "Couldn't reach GitLab. Check your connection and try again.", login_starting: "Preparing browser connection…",
    signing_out: "Signing out of GitLab CLI…",
    switching: "Switching the active GitLab CLI account…",
    awaiting_browser: "Waiting for GitLab authorization…", cancelling: "Cancelling connection…", cancelled: "Connection cancelled",
    timed_out: "The connection took too long. Check its state or try again.", failed: "Couldn't complete the connection. Check its state or try again.",
    cli_missing: "GitLab CLI couldn't be found. Check the installation below.",
    cli_unsupported: "Update glab to 1.120.0 or later. This connection requires its native credential interface.",
    environment_controlled: "An environment variable controls GitLab CLI authentication. Manage it outside GitOdile.",
  },
};

