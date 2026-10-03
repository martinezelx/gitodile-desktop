import { useEffect, useRef, useState } from "react";

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

/** Whether Git or the optional GitHub CLI is usable is an application-level fact, not a Settings-panel
 * detail: it is read once after first paint so a missing installation is known
 * before the user goes looking for it, and the panel renders whatever this
 * already found. The read runs in an effect, never during render, which is what
 * keeps task 023's "no Git process before the first content frame" budget true.
 *
 * `null` diagnostics mean "not answered yet" and render as checking; they are
 * not an error state. A failed check is reported as `check_failed` so the panel
 * never has to distinguish a rejected promise from a negative answer. */
export function useGitTooling(port: SettingsPort, tool: "git" | "gh" = "git"): GitToolingState {
  const [diagnostics, setDiagnostics] = useState<GitDiagnostics | null>(null);
  const [isRefreshingDiagnostics, setIsRefreshingDiagnostics] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<GitUpdateStatus | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const refreshing = useRef(false);
  const checking = useRef(false);
  const installedVersion = useRef<string | null>(null);

  const refreshDiagnostics = async (): Promise<void> => {
    if (refreshing.current || checking.current) return;
    refreshing.current = true;
    setIsRefreshingDiagnostics(true);
    try {
      const result = await (tool === "git" ? port.readDiagnostics() : port.readGhDiagnostics());
      setDiagnostics(result);
      // Update answers describe one installed version; a new version or a
      // failed local check must not retain the previous version's action.
      if (result.state !== "available" || result.version !== installedVersion.current) {
        setUpdateStatus(null);
      }
      installedVersion.current = result.version;
    } catch {
      setDiagnostics({ state: "check_failed", version: null });
      installedVersion.current = null;
      setUpdateStatus(null);
    } finally {
      refreshing.current = false;
      setIsRefreshingDiagnostics(false);
    }
  };

  useEffect(() => {
    void refreshDiagnostics();
  }, []);

  const checkUpdate = async (): Promise<void> => {
    if (refreshing.current || checking.current) return;
    checking.current = true;
    setIsCheckingUpdate(true);
    setUpdateStatus({ state: "checking", cached: false });
    try {
      setUpdateStatus(await (tool === "git" ? port.checkUpdate() : port.checkGhUpdate()));
    } catch {
      setUpdateStatus({ state: "failed", cached: false });
    } finally {
      checking.current = false;
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
