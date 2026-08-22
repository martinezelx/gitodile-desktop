import { useMemo } from "react";
import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import type { HistoryController } from "./controller";
import { useActiveHistoryState } from "./hooks";
import { HistoryPanel } from "./HistoryPanel";

export function HistoryScreen({
  controller,
  projectPath,
  sessionEpoch,
}: {
  controller: HistoryController;
  projectPath: string;
  sessionEpoch: string;
}): React.JSX.Element {
  const { t } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveHistoryState(controller, query);
  return (
    <HistoryPanel
      controller={controller}
      query={query}
      state={state}
      error={state.error ? localizeAppError(state.error, t, t.historyErrorLoading) : null}
    />
  );
}
