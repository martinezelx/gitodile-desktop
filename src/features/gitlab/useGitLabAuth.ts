import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_GITLAB_AUTH, type GitLabAuthSnapshot } from "./domain";
import type { GitLabAuthPort } from "./port";
/** Cached receipts only on visibility; explicit actions own network activity. */
export function useGitLabAuth(port: GitLabAuthPort, visible: boolean) {
  const [snapshot, setSnapshot] = useState(EMPTY_GITLAB_AUTH);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const state = useRef(snapshot);
  const generation = useRef(0);
  const running = useRef(false);
  const mounted = useRef(false);
  const apply = useCallback((receipt: GitLabAuthSnapshot) => { state.current = receipt; setSnapshot(receipt); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  const request = async (action: "check" | "login" | "logout" | "cancel", id?: string): Promise<void> => {
    if (running.current) return;
    running.current = true;
    const before = ++generation.current;
    setPending(true);
    try {
      const result = await (action === "check" ? port.check() : action === "login" ? port.login() : action === "logout" ? port.logout(id!) : port.cancel(id!));
      if (mounted.current && before === generation.current) apply(result);
    } catch {
      if (mounted.current && before === generation.current) apply({ ...state.current, state: "failed", needsCheck: true });
    } finally {
      running.current = false;
      if (mounted.current) { setPending(false); setRevision(value => value + 1); }
    }
  };
  useEffect(() => {
    if (!visible || pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const before = generation.current;
    const poll = async (): Promise<void> => {
      try {
        const result = await port.readState();
        if (stopped || before !== generation.current) return;
        apply(result);
        if (result.operationId) timer = setTimeout(() => void poll(), 1000);
      } catch {
        if (stopped || before !== generation.current) return;
        if (state.current.operationId) timer = setTimeout(() => void poll(), 1000);
        else apply({ ...state.current, state: "failed", needsCheck: true });
      }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [apply, port, visible, pending, revision]);
  return { snapshot, pending, check: () => request("check"), connect: () => request("login"),
    disconnect: (accountId: string) => request("logout", accountId), cancel: () => snapshot.operationId ? request("cancel", snapshot.operationId) : Promise.resolve() };
}
export type GitLabAuthController = ReturnType<typeof useGitLabAuth>;
