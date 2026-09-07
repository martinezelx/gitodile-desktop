import { useCallback, useMemo } from "react";

import { localizeAppError } from "../../shared/i18n";
import { useLanguage } from "../../i18n";
import type { VersionLinesController } from "./controller";
import { useActiveVersionLinesState } from "./hooks";
import { VersionLinesPanel } from "./VersionLinesPanel";

export type VersionLinesScreenProps = {
  controller: VersionLinesController;
  projectPath: string;
  sessionEpoch: string;
  watcherState: "starting" | "watching" | "off" | "unavailable";
  onOpenSettings: () => void;
  onChanged: () => void;
  onSaveVersion: () => void;
  onOpenChanges?: () => void;
  onOpenHistory?: () => void;
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
  autoOpenCreate?: boolean;
  onAutoOpenCreateHandled?: () => void;
};

export function VersionLinesScreen({
  controller,
  projectPath,
  sessionEpoch,
  watcherState,
  onOpenSettings,
  ...callbacks
}: VersionLinesScreenProps): React.JSX.Element {
  const { t } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveVersionLinesState(controller, query);
  /* Stable identities: the panel's effect depends on these, and a new function
     every render would re-run it — which for a read means asking Git again on
     every keystroke that re-renders the screen. */
  const readHistory = useCallback(
    (name: string, tipCommit: string) => controller.readHistory(query, name, tipCommit),
    [controller, query],
  );
  const peekHistory = useCallback(
    (name: string, tipCommit: string) => controller.peekHistory(query, name, tipCommit),
    [controller, query],
  );
  return (
    <VersionLinesPanel
      projectPath={projectPath}
      sessionEpoch={sessionEpoch}
      snapshot={state.snapshot}
      error={state.error ? localizeAppError(state.error, t, t.versionLinesErrorLoading) : null}
      isLoading={state.isLoading}
      watcherState={watcherState}
      onOpenSettings={onOpenSettings}
      onRefresh={() => void controller.refresh(query)}
      onSnapshot={(snapshot) => controller.commit(query, snapshot)}
      readHistory={readHistory}
      peekHistory={peekHistory}
      {...callbacks}
    />
  );
}
