import { invoke } from "@tauri-apps/api/core";
import type { AccountsPort } from "./port";
export const accountsPort: AccountsPort = {
  readCatalog: () => invoke("get_account_catalog"),
  check: provider => invoke("check_account_catalog", { provider }),
  readProject: ({ path, sessionEpoch }, provider) => invoke("read_project_account", { path, sessionEpoch, provider }),
  selectProject: ({ path, sessionEpoch }, provider, accountId, expectedAccountId) =>
    invoke("set_project_account", { path, sessionEpoch, provider, accountId, expectedAccountId }),
};
