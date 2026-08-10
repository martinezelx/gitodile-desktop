import { useEffect, useState } from "react";

import type { GitDiagnostics, GitUpdateStatus } from "./domain";
import type { SettingsPort } from "./port";

export type GitToolingState = {
  diagnostics: GitDiagnostics | null;
  isRefreshingDiagnostics: boolean;
  updateStatus: GitUpdateStatus | null;
  isCheckingUpdate: boolean;
  refreshDiagnostics: () => Promise<void>;
  checkUpdate: () => Promise<void>;
};

/** Whether Git is usable is an application-level fact, not a Settings-panel
 * detail: it is read once after first paint so a missing installation is known
 * before the user goes looking for it, and the panel renders whatever this
 * already found. The read runs in an effect, never during render, which is what
 * keeps task 023's "no Git process before the first content frame" budget true.
 *
 * `null` diagnostics mean "not answered yet" and render as checking; they are
 * not an error state. A failed check is reported as `check_failed` so the panel
 * never has to distinguish a rejected promise from a negative answer. */
export function useGitTooling(port: SettingsPort): GitToolingState {
  const [diagnostics, setDiagnostics] = useState<GitDiagnostics | null>(null);
  const [isRefreshingDiagnostics, setIsRefreshingDiagnostics] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<GitUpdateStatus | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const refreshDiagnostics = async (): Promise<void> => {
    setIsRefreshingDiagnostics(true);
    try {
      const result = await port.readDiagnostics();
      setDiagnostics(result);
      // An unusable Git makes any previous update answer meaningless rather
      // than merely stale, so it is dropped instead of left on screen.
      if (result.state !== "available") {
        setUpdateStatus(null);
      }
    } catch {
      setDiagnostics({ state: "check_failed", version: null });
    } finally {
      setIsRefreshingDiagnostics(false);
    }
  };

  useEffect(() => {
    void refreshDiagnostics();
  }, []);

  const checkUpdate = async (): Promise<void> => {
    setIsCheckingUpdate(true);
    setUpdateStatus({ state: "checking", cached: false });
    try {
      setUpdateStatus(await port.checkUpdate());
    } catch {
      setUpdateStatus({ state: "failed", cached: false });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return {
    diagnostics,
    isRefreshingDiagnostics,
    updateStatus,
    isCheckingUpdate,
    refreshDiagnostics,
    checkUpdate,
  };
}
