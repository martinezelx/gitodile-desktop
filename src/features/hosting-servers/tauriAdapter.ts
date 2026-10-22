import { invoke } from "@tauri-apps/api/core";
import type { HostingServersPort } from "./port";

export const hostingServersPort: HostingServersPort = {
  add: (kind, address, requestId) => invoke("add_hosting_server", { kind, address, requestId }),
  remove: provider => invoke("remove_hosting_server", { provider }),
  cancel: requestId => invoke("cancel_hosting_request", { requestId }),
  tokenPort: provider => ({
    add: (token, requestId) => invoke("add_hosting_token", { provider, token, requestId }),
    remove: accountId => invoke("remove_hosting_token", { accountId }),
    cancel: requestId => invoke("cancel_hosting_request", { requestId }),
  }),
  githubAuthPort: (provider, host) => ({
    readState: () => invoke("get_hosting_cli_state", { provider }),
    check: () => invoke("check_hosting_cli", { provider }),
    login: () => invoke("start_hosting_cli_login", { provider }),
    logout: login => invoke("logout_hosting_cli", { provider, account: login }),
    // gh's active account does not choose GitOdile's identity, so company
    // servers do not offer switching it.
    switchAccount: () => Promise.reject(new Error("Switching is not offered for company servers.")),
    cancel: operationId => invoke("cancel_hosting_cli", { provider, operationId }),
    // The renderer's opener scope is fixed; native derives this page itself.
    openBrowser: () => invoke("open_hosting_device_page", { provider }),
    deviceUrl: `https://${host}/login/device`,
  }),
  gitlabAuthPort: provider => ({
    readState: () => invoke("get_hosting_cli_state", { provider }),
    check: () => invoke("check_hosting_cli", { provider }),
    login: () => invoke("start_hosting_cli_login", { provider }),
    logout: accountId => invoke("logout_hosting_cli", { provider, account: accountId }),
    cancel: operationId => invoke("cancel_hosting_cli", { provider, operationId }),
  }),
};
