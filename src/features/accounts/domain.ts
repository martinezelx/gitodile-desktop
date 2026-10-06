import type { AppError } from "../../shared/i18n";
/** Shared account/access contract. Secrets never cross this boundary. */
export type HostingAccount = {
  id: string; provider: string; host: string; login: string;
  avatarDataUrl: string | null; available: boolean;
  unavailableReason?: AppError["code"] | null;
};
export type HostingKind = "github" | "gitlab" | "bitbucket";
/** One provider instance: github.com, gitlab.com, bitbucket.org, or a
 * user-added company server. `host` is the exact HTTPS authority, including a
 * non-default port. */
export type HostingProvider = { id: string; host: string; kind: HostingKind; builtIn: boolean };
export type AccountCatalog = {
  providers: HostingProvider[];
  accounts: HostingAccount[]; busy: boolean;
};
export type AccountProject = { path: string; sessionEpoch: string };
export type ProjectAccount = { accountId: string | null };
export const EMPTY_ACCOUNT_CATALOG: AccountCatalog = { providers: [], accounts: [], busy: false };
/** The product of a provider instance; unknown IDs fall back to their name. */
export function providerKind(providers: AccountCatalog["providers"], id: string): string {
  return providers.find(provider => provider.id === id)?.kind ?? id;
}
/** `host[:port]` as the native side normalizes it (the URL parser already
 * lowercases the host and drops the default port). */
function hostName(authority: string): string {
  return authority.replace(/:\d+$/, "");
}
export type RemoteAccountIssue = "sign-in" | "insecure";
/** Remotes the native transfer guard refuses while an account is selected:
 * stored sign-in details (displayed redacted) or plain HTTP to a provider host. */
export function remoteAccountIssues(remoteUrls: readonly string[], signInRemoteUrls: readonly string[],
  providers: AccountCatalog["providers"]): Map<string, { issue: RemoteAccountIssue; host: string }> {
  const issues = new Map<string, { issue: RemoteAccountIssue; host: string }>();
  for (const url of signInRemoteUrls) {
    const provider = providers.find(p => p.id === providerForSource(url, providers));
    if (provider) issues.set(provider.id, { issue: "sign-in", host: provider.host });
  }
  for (const source of remoteUrls) {
    try {
      const url = new URL(source.trim());
      const provider = providers.find(p => hostName(p.host) === url.hostname);
      if (url.protocol === "http:" && provider && !issues.has(provider.id)) issues.set(provider.id, { issue: "insecure", host: provider.host });
    } catch { /* SSH, SCP-like and local remotes never use a selected account. */ }
  }
  return issues;
}
export function providerForSource(source: string, providers: AccountCatalog["providers"]): string | null {
  try {
    const url = new URL(source.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search) return null;
    return providers.find(provider => provider.host === url.host)?.id ?? null;
  } catch { return null; }
}
