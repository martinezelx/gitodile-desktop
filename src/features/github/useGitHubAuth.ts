import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_GITHUB_AUTH, GITHUB_DEVICE_URL, githubAccountRows, isGitHubAuthBusy, type GitHubAuthSnapshot } from "./domain";
import type { GitHubAuthPort } from "./port";

export type GitHubAuthController = {
  snapshot: GitHubAuthSnapshot;
  pending: boolean;
  browserFailed: boolean;
  check: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: (login: string) => Promise<void>;
  activate: (login: string) => Promise<void>;
  cancel: () => Promise<void>;
  openBrowser: () => Promise<void>;
};

/** The composition root owns this cache. Opening Settings reads native memory
 * only, and polling stops when it is hidden. Network actions are explicit. */
export function useGitHubAuth(port: GitHubAuthPort, visible: boolean): GitHubAuthController {
  const [snapshot, setSnapshot] = useState(EMPTY_GITHUB_AUTH);
  const [pending, setPending] = useState(false);
  const [receiptRevision, setReceiptRevision] = useState(0);
  const [browserFailed, setBrowserFailed] = useState(false);
  const state = useRef(snapshot);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const openedOperation = useRef<string | null>(null);

  const openBrowser = useCallback(async () => {
    try { await port.openBrowser(); setBrowserFailed(false); }
    catch { setBrowserFailed(true); }
  }, [port]);

  const apply = useCallback((next: GitHubAuthSnapshot) => {
    state.current = next;
    setSnapshot(next);
    if (next.state === "awaiting_browser" && next.deviceCode && next.operationId
      && next.verificationUrl === (port.deviceUrl ?? GITHUB_DEVICE_URL) && openedOperation.current !== next.operationId) {
      openedOperation.current = next.operationId;
      void openBrowser();
    }
  }, [openBrowser, port.deviceUrl]);

  const request = async (kind: "check" | "connect" | "cancel" | "disconnect" | "activate", login?: string): Promise<void> => {
    if (inFlight.current || (kind !== "cancel" && isGitHubAuthBusy(state.current.state))) return;
    const operationId = state.current.operationId;
    if (kind === "cancel" && !operationId) return;
    if ((kind === "connect" || kind === "disconnect" || kind === "activate")
      && (state.current.state === "cli_unsupported" || state.current.state === "environment_controlled")) return;
    if (kind === "disconnect" || kind === "activate") {
      const target = githubAccountRows(state.current).find(account => account.login === login);
      if (!target || target.storage === "environment" || state.current.account?.storage === "environment"
        || state.current.needsCheck || (kind === "activate" && target.active)) return;
    }
    inFlight.current = true;
    setPending(true);
    setBrowserFailed(false);
    revision.current += 1;
    try {
      apply(await (kind === "cancel" ? port.cancel(operationId!) : kind === "connect" ? port.login()
        : kind === "disconnect" ? port.logout(login!) : kind === "activate" ? port.switchAccount(login!) : port.check()));
    } catch {
      // A lost receipt may follow a successful native launch. Recover through
      // the cached state endpoint before describing the action as failed.
      try { apply(await port.readState()); }
      catch { apply({ ...state.current, state: "failed", needsCheck: state.current.needsCheck || kind === "connect" || kind === "disconnect" || kind === "activate" }); }
    } finally {
      inFlight.current = false;
      setPending(false);
      // Fast IPC can batch pending=true/false into one render. Always restart
      // cached receipt polling after an explicit action, including cancellation.
      setReceiptRevision((value) => value + 1);
    }
  };

  useEffect(() => {
    if (!visible) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      const before = revision.current;
      try {
        const next = await port.readState();
        if (stopped || before !== revision.current || inFlight.current) return;
        apply(next);
        if (isGitHubAuthBusy(next.state)) timer = setTimeout(() => void poll(), 500);
      } catch {
        if (!stopped && before === revision.current && !inFlight.current) {
          // Keep an active operation cancellable and retry its cached receipt.
          if (isGitHubAuthBusy(state.current.state)) timer = setTimeout(() => void poll(), 1000);
          else apply({ ...state.current, state: "failed" });
        }
      }
    };
    void poll();
    return () => { stopped = true; if (timer !== undefined) clearTimeout(timer); };
  }, [apply, port, visible, pending, receiptRevision]);

  return { snapshot, pending, browserFailed, check: () => request("check"), connect: () => request("connect"),
    disconnect: (login) => request("disconnect", login),
    activate: (login) => request("activate", login),
    cancel: () => request("cancel"), openBrowser };
}
