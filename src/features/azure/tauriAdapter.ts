import { invoke } from "@tauri-apps/api/core";
import type { AzureConnectionsPort } from "./port";
export const azureConnectionsPort: AzureConnectionsPort = {
  tokenPort: organization => ({
    add: (token, requestId) => invoke("add_azure_token", { organization, token, requestId }),
    remove: accountId => invoke("remove_azure_token", { accountId }),
    cancel: requestId => invoke("cancel_azure_request", { requestId }),
  }),
};
