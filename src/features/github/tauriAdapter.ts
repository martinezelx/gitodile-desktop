import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { GITHUB_DEVICE_URL } from "./domain";
import type { GitHubAuthPort } from "./port";

export const githubAuthPort: GitHubAuthPort = {
  readState: () => invoke("get_github_auth_state"),
  check: () => invoke("check_github_auth"),
  login: () => invoke("start_github_login"),
  logout: (login) => invoke("logout_github_account", { login }),
  switchAccount: (login) => invoke("switch_github_account", { login }),
  cancel: (operationId) => invoke("cancel_github_auth", { operationId }),
  openBrowser: () => openUrl(GITHUB_DEVICE_URL),
};
