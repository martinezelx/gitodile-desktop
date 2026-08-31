import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { platform } from "@tauri-apps/plugin-os";

import type { SettingsPort } from "./port";

/** Only this adapter knows the stable IPC command names and payload casing. */
export const settingsPort: SettingsPort = {
  readDiagnostics: () => invoke("git_diagnostics"),
  checkUpdate: () => invoke("check_git_update"),
  installGit: () => invoke("install_git"),
  updateGit: () => invoke("update_git"),
  getIdentity: () => invoke("get_git_identity"),
  setIdentity: ({ name, email }) => invoke("set_git_identity", { name, email }),
  getDefaultBranch: () => invoke("get_default_branch"),
  setDefaultBranch: (name) => invoke("set_default_branch", { name }),
  readLineEndings: (project) =>
    invoke("get_line_endings", {
      path: project?.path ?? null,
      sessionEpoch: project?.sessionEpoch ?? null,
    }),
  setLineEndings: (mode) => invoke("set_line_endings", { mode }),
  /* Synchronous and throwing, like the rest of plugin-os: a `pnpm dev` run in a
     plain browser has no Tauri global, and that must not take the panel down. */
  readPlatform: () => {
    try {
      return platform();
    } catch {
      return null;
    }
  },
  openGuidance: (url) => openUrl(url),
};
