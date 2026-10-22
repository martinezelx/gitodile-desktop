import { invoke } from "@tauri-apps/api/core";
import type { TokenConnectionPort } from "../accounts";
export const bitbucketTokenPort: TokenConnectionPort = {
  add: (token, requestId) => invoke("add_bitbucket_token", { token, requestId }),
  remove: accountId => invoke("remove_bitbucket_token", { accountId }),
  cancel: requestId => invoke("cancel_hosting_request", { requestId }),
};
