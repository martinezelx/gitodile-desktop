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
  onViewLine?: (name: string) => void;
  onSwitchLine?: (name: string) => void;
  onCreateLineFromVersion?: HistoryLineActions["onCreateLineFromVersion"];
  onOpenSettings: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveHistoryState(controller, query);
  useEffect(() => {
    if (!scopeLineIntent) return;
    void controller.setScope(query, { kind: "line", name: scopeLineIntent });
    onScopeLineIntentHandled?.();
  }, [controller, onScopeLineIntentHandled, query, scopeLineIntent]);
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
