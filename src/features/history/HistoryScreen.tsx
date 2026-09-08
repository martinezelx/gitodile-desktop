import { useEffect, useMemo } from "react";
import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import type { HistoryController } from "./controller";
import { useActiveHistoryState } from "./hooks";
import { HistoryPanel, type HistoryLineActions } from "./HistoryPanel";

export function HistoryScreen({
  controller,
  projectPath,
  sessionEpoch,
  watcherState,
  lines,
  scopeLineIntent = null,
  onScopeLineIntentHandled,
  selectCommitIntent = null,
  onSelectCommitIntentHandled,
  onViewLine,
  onSwitchLine,
  onCreateLineFromVersion,
  onOpenSettings,
}: {
  controller: HistoryController;
  projectPath: string;
  sessionEpoch: string;
  watcherState: "starting" | "watching" | "off" | "unavailable";
  /** Local version lines, for the scope control. */
  lines?: string[];
  /** A line another screen asked this one to read.
   *
   * One-shot: it is applied once and handed back, never held as a standing
   * prop. Both screens stay mounted for the session, so a target that survived
   * would re-apply on the next render of the composition root and silently
   * revert a scope the reader has since chosen by hand. */
  scopeLineIntent?: string | null;
  onScopeLineIntentHandled?: () => void;
  /** A saved version another screen asked this one to open. One-shot, for the
   * same reason the scope above is: a target that survived would re-select
   * itself over whatever the reader has since clicked. */
  selectCommitIntent?: string | null;
  onSelectCommitIntentHandled?: () => void;
  onViewLine?: (name: string) => void;
  onSwitchLine?: (name: string) => void;
  onCreateLineFromVersion?: HistoryLineActions["onCreateLineFromVersion"];
  onOpenSettings: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveHistoryState(controller, query);
  useEffect(() => {
    if (!scopeLineIntent && !selectCommitIntent) return;
    const commit = selectCommitIntent;
    // The scope first, then the version in it: setting the scope restarts the
    // timeline, and a timeline that restarts picks its own selection when the
    // first page lands. `setScope` resolves once that page is in, so chaining
    // is what makes the asked-for version the one that stays selected.
    const scoped = scopeLineIntent
      ? controller.setScope(query, { kind: "line", name: scopeLineIntent })
      : Promise.resolve();
    void scoped.then(() => {
      if (commit) controller.selectVersion(query, commit);
    });
    if (scopeLineIntent) onScopeLineIntentHandled?.();
    if (commit) onSelectCommitIntentHandled?.();
  }, [
    controller,
    onScopeLineIntentHandled,
    onSelectCommitIntentHandled,
    query,
    scopeLineIntent,
    selectCommitIntent,
  ]);
  const actions = useMemo<HistoryLineActions>(
    () => ({ lines, onViewLine, onSwitchLine, onCreateLineFromVersion }),
    [lines, onCreateLineFromVersion, onSwitchLine, onViewLine],
  );
  return (
    <HistoryPanel
      controller={controller}
      query={query}
      state={state}
      watcherState={watcherState}
      actions={actions}
      onOpenSettings={onOpenSettings}
      error={state.error ? localizeAppError(state.error, t, t.historyErrorLoading) : null}
    />
  );
}
