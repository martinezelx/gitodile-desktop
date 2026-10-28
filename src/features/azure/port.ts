import type { TokenConnectionPort } from "../accounts";
export interface AzureConnectionsPort {
  tokenPort(organization: string): TokenConnectionPort;
}
