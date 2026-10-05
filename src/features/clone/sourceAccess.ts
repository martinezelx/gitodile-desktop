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

export function githubCloneAddress(source: string): { https: boolean } | null {
  const value = source.trim();
  const validPath = (path: string): boolean => {
    const parts = path.replace(/\/+$/, "").split("/");
    return parts.length === 2 && parts.every(p => /^[\w.-]+$/.test(p) && p !== "." && p !== "..") && parts[1] !== ".git";
  };
  if (value.startsWith("git@github.com:")) return validPath(value.slice(15)) ? { https: false } : null;
  try {
    const url = new URL(value);
    if (url.hostname !== "github.com" || url.port || url.password || url.search || url.hash ||
        !validPath(url.pathname.slice(1))) return null;
    if (url.protocol === "https:" && !url.username) return { https: true };
    if (url.protocol === "ssh:" && url.username === "git") return { https: false };
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
    update: (source: string, accountId: string | null): void => {
      stop();
      const address = githubCloneAddress(source);
      // A saved HTTPS identity cannot be applied to SSH.
      if (!address || (!address.https && accountId)) { publish({ source, accountId, status: "idle" }); return; }
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
