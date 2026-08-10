import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import type { SettingsPort } from "./port";

/** Only this adapter knows the stable IPC command names and payload casing. */
export const settingsPort: SettingsPort = {
  readDiagnostics: () => invoke("git_diagnostics"),
  checkUpdate: () => invoke("check_git_update"),
  installGit: () => invoke("install_git"),
  updateGit: () => invoke("update_git"),
  getIdentity: () => invoke("get_git_identity"),
  setIdentity: ({ name, email }) => invoke("set_git_identity", { name, email }),
  openGuidance: (url) => openUrl(url),
};
