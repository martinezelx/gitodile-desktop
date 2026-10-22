import { invoke } from "@tauri-apps/api/core";
import type { GitLabAuthPort } from "./port";
import type { GitLabTokenPort } from "./tokenPort";
import type { HostingToolingPort } from "../settings";
export const gitlabAuthPort: GitLabAuthPort = {
  readState: () => invoke("get_gitlab_auth_state"), check: () => invoke("check_gitlab_auth"),
  login: () => invoke("start_gitlab_login"), logout: accountId => invoke("logout_gitlab_account", { accountId }),
  cancel: operationId => invoke("cancel_gitlab_auth", { operationId }),
};
export const gitlabTokenPort: GitLabTokenPort = {
  add: (token, requestId) => invoke("add_gitlab_token", { token, requestId }),
  remove: accountId => invoke("remove_gitlab_token", { accountId }),
  cancel: requestId => invoke("cancel_hosting_request", { requestId }),
};
export const gitlabToolingPort: HostingToolingPort = {
  readDiagnostics: () => invoke("glab_diagnostics"), checkUpdate: () => invoke("check_glab_update"),
  install: () => invoke("install_glab"), update: () => invoke("update_glab"),
};
