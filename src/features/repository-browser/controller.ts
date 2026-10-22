import type { RepositoryBrowserPort } from "./port";
import type { RepositoryBrowserState, RepositoryPage } from "./domain";
import type { HostingAccount } from "../accounts";

/** Session-only, one bounded page per identity. Every network read is explicit.
 * Switching accounts immediately removes the old identity's visible results. */
export function createRepositoryBrowserController(port: RepositoryBrowserPort) {
  let state: RepositoryBrowserState = { accountId: null, page: null, pending: false, error: null };
  const cache = new Map<string, RepositoryPage>();
  const listeners = new Set<() => void>();
  let sequence = 0;
  let request: string | null = null;
  const publish = (next: RepositoryBrowserState): void => { state = next; listeners.forEach(listener => listener()); };
  const stop = (): void => {
    sequence += 1;
    if (request) void port.cancel(request).catch(() => undefined);
    request = null;
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => state,
    select: (accountId: string | null): void => {
      if (state.accountId === accountId) return;
      stop(); publish({ accountId, page: accountId ? cache.get(accountId) ?? null : null, pending: false, error: null });
    },
    reconcile: (accounts: HostingAccount[]): void => {
      const available = new Set(accounts.filter(account => account.available).map(account => account.id));
      for (const id of cache.keys()) if (!available.has(id)) cache.delete(id);
      if (state.accountId && !available.has(state.accountId)) {
        stop(); publish({ ...state, page: null, pending: false, error: null });
      }
    },
    cancel: (): void => { stop(); publish({ ...state, pending: false }); },
    load: async (page = 1): Promise<void> => {
      const accountId = state.accountId;
      if (!accountId || state.pending) return;
      const before = ++sequence;
      const requestId = `repos_${crypto.randomUUID().replaceAll("-", "")}`;
      request = requestId;
      publish({ ...state, pending: true, error: null });
      try {
        const receipt = await port.list(accountId, page, requestId);
        if (before !== sequence || state.accountId !== accountId) return;
        if (receipt.accountId !== accountId || receipt.page !== page) throw new Error("Repository response identity mismatch");
        cache.set(accountId, receipt);
        // Account catalog is bounded natively; do not grow a renderer cache if
        // a custom adapter violates that limit.
        if (cache.size > 16) cache.delete(cache.keys().next().value!);
        publish({ accountId, page: receipt, pending: false, error: null });
      } catch (error) {
        if (before !== sequence || state.accountId !== accountId) return;
        cache.delete(accountId);
        publish({ accountId, page: null, pending: false, error });
      } finally { if (before === sequence) request = null; }
    },
  };
}
export type RepositoryBrowserController = ReturnType<typeof createRepositoryBrowserController>;
