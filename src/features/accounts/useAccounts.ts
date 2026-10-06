import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_ACCOUNT_CATALOG, type AccountCatalog } from "./domain";
import type { AccountsPort } from "./port";

/** Last local receipt per port, so a remounted section (switching between
 * provider sections) renders the known accounts at once instead of an empty
 * frame. It is a snapshot of local metadata, refreshed by the read below. */
const lastReceipts = new WeakMap<AccountsPort, AccountCatalog>();

/** Reads local receipts only. Verification is the launch sync (ADR 0027) or
 * an explicit check.
 * `loaded` is false until a receipt (cached or read) exists, so callers can
 * avoid presenting an empty catalog that is merely unread. */
export function useAccounts(port: AccountsPort, visible: boolean) {
  const [catalog, setReceipt] = useState(() => lastReceipts.get(port) ?? EMPTY_ACCOUNT_CATALOG);
  const [loaded, setLoaded] = useState(() => lastReceipts.has(port));
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [generation, setGeneration] = useState(0);
  const revision = useRef(0);
  const mounted = useRef(false);
  const running = useRef(false);
  const isVisible = useRef(visible);
  isVisible.current = visible;
  const setCatalog = useCallback((next: AccountCatalog) => {
    lastReceipts.set(port, next); setReceipt(next); setLoaded(true);
  }, [port]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!visible) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      const before = revision.current;
      try {
        const next = await port.readCatalog();
        if (stopped || before !== revision.current || running.current) return;
        setCatalog(next); setFailed(false);
        if (next.busy) timer = setTimeout(() => void poll(), 500);
      } catch { if (!stopped && before === revision.current) {
        setFailed(true); setLoaded(true);
        setReceipt(previous => ({ ...previous, busy: false }));
      } }
    };
    void poll();
    return () => { stopped = true; if (timer !== undefined) clearTimeout(timer); };
  }, [port, visible, generation, setCatalog]);
  const check = useCallback(async (provider: string): Promise<void> => {
    if (running.current) return;
    running.current = true; revision.current += 1;
    setPending(true); setFailed(false);
    try {
      const next = await port.check(provider);
      if (mounted.current && isVisible.current) setCatalog(next);
    } catch { if (mounted.current) setFailed(true); }
    finally { running.current = false; if (mounted.current) { setPending(false); setGeneration(value => value + 1); } }
  }, [port, setCatalog]);
  const reload = useCallback(() => setGeneration(value => value + 1), []);
  return { catalog, loaded, failed, pending, check, reload };
}
