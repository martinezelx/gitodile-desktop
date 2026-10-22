import type { AccountCatalog, HostingKind, TokenConnectionPort } from "../accounts";
import type { GitHubAuthPort } from "../github";
import type { GitLabAuthPort } from "../gitlab";

/** Company servers (GitHub Enterprise Server, GitLab Self-Managed). Adding one
 * contacts only the address the user typed; tokens never return from native. */
export interface HostingServersPort {
  add(kind: HostingKind, address: string, requestId: string): Promise<AccountCatalog>;
  remove(provider: string): Promise<AccountCatalog>;
  cancel(requestId: string): Promise<void>;
  tokenPort(provider: string): TokenConnectionPort;
  githubAuthPort(provider: string, host: string): GitHubAuthPort;
  gitlabAuthPort(provider: string): GitLabAuthPort;
}
