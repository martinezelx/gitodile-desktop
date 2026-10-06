import type { HostingKind, HostingProvider } from "../accounts";
/** Remote reads start only after editing the address/account or pressing Retry.
 * Never on overlay visibility; every obsolete timer and receipt is discarded. */
export type CloneSourceAccess = {
  source: string;
  accountId: string | null;
  status: "idle" | "checking" | "accessible" | "unavailable" | "unconfirmed";
};
export type CloneSourceAccessPort = {
  checkSource(source: string, accountId: string | null, requestId: string): Promise<"accessible" | "unavailable">;
  cancelSourceCheck(requestId: string): Promise<void>;
};

const BUILT_IN_PROVIDERS: HostingProvider[] = [
  { id: "github", host: "github.com", kind: "github", builtIn: true },
  { id: "gitlab", host: "gitlab.com", kind: "gitlab", builtIn: true },
];
export type HostingCloneAddress = { https: boolean; provider: HostingKind; providerId: string };
/** Mirrors the native clone-source check: HTTPS matches an exact registered
 * authority; SSH matches the host name (a nonstandard port only for a company
 * server). GitHub paths are owner/name, GitLab paths may nest groups. */
export function hostingCloneAddress(source: string, providers: readonly HostingProvider[] = BUILT_IN_PROVIDERS): HostingCloneAddress | null {
  const value = source.trim();
  const validPath = (path: string, provider: HostingKind): boolean => {
    const parts = path.replace(/\/+$/, "").split("/");
    return parts.length >= 2 && parts.length <= 32 && (provider === "gitlab" || parts.length === 2) && parts.every(p => /^[\w.-]+$/.test(p) && p !== "." && p !== "..") && parts.at(-1) !== ".git";
  };
  const named = (name: string): HostingProvider[] => providers.filter(provider => provider.host.replace(/:\d+$/, "") === name.toLowerCase());
  const scp = /^git@([^/@:]+):(.*)$/.exec(value);
  if (scp) {
    const provider = named(scp[1])[0];
    return provider && validPath(scp[2], provider.kind) ? { https: false, provider: provider.kind, providerId: provider.id } : null;
  }
  try {
    const url = new URL(value);
    if (url.password || url.search || url.hash) return null;
    const provider = url.protocol === "https:" && !url.username
      ? providers.find(candidate => candidate.host === url.host)
      : url.protocol === "ssh:" && url.username === "git"
        ? named(url.hostname).find(candidate => !url.port || !candidate.builtIn) : undefined;
    if (!provider || !validPath(url.pathname.slice(1), provider.kind)) return null;
    return { https: url.protocol === "https:", provider: provider.kind, providerId: provider.id };
  } catch { /* Local paths and incomplete addresses never contact a provider. */ }
  return null;
}

export function cloneSourceSummary(source: string): string {
  const raw = source.trim();
  // A Windows drive and local filename punctuation are not URL components.
  if (/^[a-z]:[\\/]/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    url.username = ""; url.password = "";
    url.search = ""; url.hash = "";
    return url.toString();
  } catch {
    const urlLike = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
    const clean = urlLike ? raw.split(/[?#]/)[0] : raw;
    return clean.replace(/^([a-z][a-z\d+.-]*:\/\/)[^/\s]*@/i, "$1")
      .replace(/^([^/:@\s]+):[^@\s]+@/, "$1@");
  }
}

export function cloneSuggestedName(source: string): string {
  const leaf = cloneSourceSummary(source).replace(/[\\/]+$/, "").split(/[\\/:]/).pop() ?? "";
  try { return decodeURIComponent(leaf).replace(/\.git$/, ""); }
  catch { return leaf.replace(/\.git$/, ""); }
}

export function createCloneSourceAccess(port: CloneSourceAccessPort) {
  let state: CloneSourceAccess = { source: "", accountId: null, status: "idle" };
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let requestId: string | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: CloneSourceAccess): void => { state = next; listeners.forEach(fn => fn()); };
  const stop = (): void => {
    generation++;
    clearTimeout(timer);
    if (requestId) void port.cancelSourceCheck(requestId).catch(() => undefined);
    requestId = null;
  };
  return {
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    snapshot: () => state,
    cancel: (): void => { stop(); publish({ ...state, status: "idle" }); },
    reset: (): void => { stop(); publish({ source: "", accountId: null, status: "idle" }); },
    update: (source: string, accountId: string | null, providers?: readonly HostingProvider[]): void => {
      stop();
      const address = hostingCloneAddress(source, providers);
      // A saved HTTPS identity cannot be applied to SSH.
      if (!address || (!address.https && accountId) || (accountId && !accountId.startsWith(`${address.providerId}:`))) { publish({ source, accountId, status: "idle" }); return; }
      const current = generation;
      publish({ source, accountId, status: "checking" });
      timer = setTimeout(() => {
        const id = crypto.randomUUID().replaceAll("-", "");
        requestId = id;
        void port.checkSource(source, accountId, id).then(status => {
          if (current === generation) publish({ source, accountId, status });
        }, () => {
          if (current === generation) publish({ source, accountId, status: "unconfirmed" });
        }).finally(() => { if (current === generation) requestId = null; });
      }, 550);
    },
  };
}

export function githubCloneAddress(source: string): { https: boolean } | null { const address = hostingCloneAddress(source); return address?.provider === "github" ? { https: address.https } : null; }
