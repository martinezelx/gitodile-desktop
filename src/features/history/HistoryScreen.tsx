import { useEffect, useMemo } from "react";
import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import type { HistoryController } from "./controller";
import { useActiveHistoryState } from "./hooks";
import { HistoryPanel, type HistoryBranchActions } from "./HistoryPanel";

export function HistoryScreen({
  tabs,
  controller,
  projectPath,
  sessionEpoch,
  watcherState,
  branches,
  scopeBranchIntent = null,
  onScopeBranchIntentHandled,
  selectCommitIntent = null,
  onSelectCommitIntentHandled,
  onViewBranch,
  onSwitchBranch,
  onCreateBranchFromVersion,
  onPublish,
  onOpenSettings,
  selfEmail = null,
  upstreamGoneBranch = null,
}: {
  /** The Work screen's tab pair; see `HistoryPanel`. */
  tabs: React.ReactNode;
  controller: HistoryController;
  projectPath: string;
  sessionEpoch: string;
  watcherState: "starting" | "watching" | "off" | "unavailable";
  /** Local branches, for the scope control. */
  branches?: string[];
  /** A branch another screen asked this one to read.
   *
   * One-shot: it is applied once and handed back, never held as a standing
   * prop. Both screens stay mounted for the session, so a target that survived
   * would re-apply on the next render of the composition root and silently
   * revert a scope the reader has since chosen by hand. */
  scopeBranchIntent?: string | null;
  onScopeBranchIntentHandled?: () => void;
  /** A saved version another screen asked this one to open. One-shot, for the
   * same reason the scope above is: a target that survived would re-select
   * itself over whatever the reader has since clicked. */
  selectCommitIntent?: string | null;
  onSelectCommitIntentHandled?: () => void;
  onViewBranch?: (name: string) => void;
  onSwitchBranch?: (name: string) => void;
  onCreateBranchFromVersion?: HistoryBranchActions["onCreateBranchFromVersion"];
  onPublish?: () => void;
  onOpenSettings: () => void;
  /** The user's own Git email; see `HistoryPanel`. */
  selfEmail?: string | null;
  /** See `HistoryPanel`. */
  upstreamGoneBranch?: string | null;
}): React.JSX.Element {
  const { t } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveHistoryState(controller, query);
  useEffect(() => {
    if (!scopeBranchIntent && !selectCommitIntent) return;
    const commit = selectCommitIntent;
    // The scope first, then the version in it: setting the scope restarts the
    // timeline, and a timeline that restarts picks its own selection when the
    // first page lands. `setScope` resolves once that page is in, so chaining
    // is what makes the asked-for version the one that stays selected.
    const scoped = scopeBranchIntent
      ? controller.setScope(query, { kind: "branch", name: scopeBranchIntent })
      : Promise.resolve();
    void scoped.then(() => {
      if (commit) controller.selectVersion(query, commit);
    });
    if (scopeBranchIntent) onScopeBranchIntentHandled?.();
    if (commit) onSelectCommitIntentHandled?.();
  }, [
    controller,
    onScopeBranchIntentHandled,
    onSelectCommitIntentHandled,
    query,
    scopeBranchIntent,
    selectCommitIntent,
  ]);
  const actions = useMemo<HistoryBranchActions>(
    () => ({ branches, onViewBranch, onSwitchBranch, onCreateBranchFromVersion, onPublish }),
    [branches, onCreateBranchFromVersion, onPublish, onSwitchBranch, onViewBranch],
  );
  return (
    <HistoryPanel
      tabs={tabs}
      controller={controller}
      query={query}
      state={state}
      watcherState={watcherState}
      actions={actions}
      selfEmail={selfEmail}
      upstreamGoneBranch={upstreamGoneBranch}
      onOpenSettings={onOpenSettings}
      error={state.error ? localizeAppError(state.error, t, t.historyErrorLoading) : null}
    />
  );
}
