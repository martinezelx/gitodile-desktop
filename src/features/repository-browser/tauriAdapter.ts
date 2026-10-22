import { invoke } from "@tauri-apps/api/core";
import type { RepositoryBrowserPort } from "./port";
export const repositoryBrowserPort: RepositoryBrowserPort = {
  list: (accountId, page, requestId) => invoke("list_hosting_repositories", { accountId, page, requestId }),
  cancel: requestId => invoke("cancel_hosting_request", { requestId }),
};
