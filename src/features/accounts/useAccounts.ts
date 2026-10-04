import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_ACCOUNT_CATALOG } from "./domain";
import type { AccountsPort } from "./port";
/** Reads local receipts only. Verification requires an explicit click. */
export function useAccounts(port: AccountsPort, visible: boolean) {
  const [catalog, setCatalog] = useState(EMPTY_ACCOUNT_CATALOG);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState(0);
  const revision = useRef(0);
  const mounted = useRef(false);
  const running = useRef(false);
  const isVisible = useRef(visible);
  isVisible.current = visible;
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
        setFailed(true);
        setCatalog(previous => ({ ...previous, busy: false }));
      } }
    };
    void poll();
    return () => { stopped = true; if (timer !== undefined) clearTimeout(timer); };
  }, [port, visible, receipt]);
  const check = useCallback(async (provider: string): Promise<void> => {
    if (running.current) return;
    running.current = true; revision.current += 1;
    setPending(true); setFailed(false);
    try {
      const next = await port.check(provider);
      if (mounted.current && isVisible.current) setCatalog(next);
    } catch { if (mounted.current) setFailed(true); }
    finally { running.current = false; if (mounted.current) { setPending(false); setReceipt(value => value + 1); } }
  }, [port]);
  const reload = useCallback(() => setReceipt(value => value + 1), []);
  return { catalog, failed, pending, check, reload };
}
