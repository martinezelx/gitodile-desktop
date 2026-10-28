import type { AppError } from "../../shared/i18n";
/** Shared account/access contract. Secrets never cross this boundary. */
export type HostingAccount = {
  id: string; provider: string; host: string; login: string;
  avatarDataUrl: string | null; available: boolean;
  unavailableReason?: AppError["code"] | null;
};
export type HostingKind = "github" | "gitlab" | "bitbucket" | "azure";
/** A picture as the native side encodes it (ADR 0038): a bounded raster data
 * URL. Anything else is refused before it reaches an `<img>`. */
export function isPictureDataUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length <= 350_000
    && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
/** One provider instance: github.com, gitlab.com, bitbucket.org, or a
 * user-added company server. `host` is the exact HTTPS authority, including a
 * non-default port. */
export type HostingProvider = { id: string; host: string; kind: HostingKind; builtIn: boolean; scopePath?: string | null };
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
      const provider = providers.find(p => hostName(p.host) === url.hostname && (!p.scopePath || url.pathname.split("/")[1] === p.scopePath));
      if (url.protocol === "http:" && provider && !issues.has(provider.id)) issues.set(provider.id, { issue: "insecure", host: provider.host });
    } catch { /* SSH, SCP-like and local remotes never use a selected account. */ }
  }
  return issues;
}
export function providerForSource(source: string, providers: AccountCatalog["providers"]): string | null {
  try {
    const url = new URL(source.trim());
    if (url.protocol !== "https:" || (url.username && url.hostname !== "dev.azure.com") || url.password || url.search) return null;
    return providers.find(provider => provider.host === url.host && (!provider.scopePath || azureCloneOrganization(source) === provider.scopePath))?.id ?? null;
  } catch { return null; }
}

/** Azure Repos Services: organization/project/_git/repo, including the
 * default-project shorthand. Match original segments before URL dot folding. */
export function azureCloneOrganization(source: string): string | null {
  try {
    const url = new URL(source.trim());
    if (url.protocol !== "https:" || url.host !== "dev.azure.com" || url.password || url.search || url.hash) return null;
    const authorityAndPath = source.trim().split("://")[1] ?? "";
    const rawPath = authorityAndPath.slice(authorityAndPath.indexOf("/") + 1);
    const parts = rawPath?.replace(/\/+$/, "").split("/").map(decodeURIComponent) ?? [];
    if ((parts.length !== 3 && parts.length !== 4) || parts.at(-2) !== "_git" || parts.some(part => !part || part === "." || part === ".." || /[\x00-\x1f\x7f/\\%?#]/.test(part))) return null;
    const org = parts[0].toLowerCase();
    if (rawPath.split("/")[0].toLowerCase() !== org) return null;
    return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(org) ? org : null;
  } catch { return null; }
}
export function providerLabel(provider: HostingProvider): string {
  return provider.scopePath ? `${provider.host}/${provider.scopePath}` : provider.host;
}
