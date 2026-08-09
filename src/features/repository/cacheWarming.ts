import { useEffect } from "react";

import type { ChangesController } from "../changes";
import type { VersionLinesController } from "../version-lines";
import type { ProjectRuntime } from "../../projectRuntime";
import type { ProjectSession } from "../../projectSessions";

type ProjectCacheWarmingOptions = {
  runtime: ProjectRuntime;
  hasCompletedSessionRestore: boolean;
  projectPath: string | null;
  session: ProjectSession | null;
  changesController: ChangesController;
  versionLinesController: VersionLinesController;
};

/**
 * App-level cache coordination for an active project incarnation. Feature
 * screens only consume these caches; visibility is deliberately absent from
 * this API so arriving on a screen cannot become an invalidation signal.
 */
export function useProjectCacheWarming({
  runtime,
  hasCompletedSessionRestore,
  projectPath,
  session,
  changesController,
  versionLinesController,
}: ProjectCacheWarmingOptions): void {
  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath || !session?.epoch) {
      return undefined;
    }
    return versionLinesController.scheduleWarm(
      runtime,
      { projectId: projectPath, sessionEpoch: session.epoch },
      "project-activation",
    );
  }, [hasCompletedSessionRestore, projectPath, runtime, session?.epoch, versionLinesController]);

  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath || !session?.workingTree) {
      return undefined;
    }
    return changesController.scheduleWarm(
      runtime,
      projectPath,
      session.epoch,
      session.workingTree,
      "repository-invalidation",
    );
  }, [
    changesController,
    hasCompletedSessionRestore,
    projectPath,
    runtime,
    session?.epoch,
    session?.statusGeneration,
    session?.workingTree,
  ]);
}
