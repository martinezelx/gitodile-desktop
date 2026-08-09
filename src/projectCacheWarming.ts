import { useEffect } from "react";

import { getDiffStore, warmDiffStore, type DiffCache } from "./diffCache";
import type { VersionLinesController } from "./features/version-lines";
import type { ProjectRuntime } from "./projectRuntime";
import type { ProjectSession } from "./projectSessions";

type ProjectCacheWarmingOptions = {
  runtime: ProjectRuntime;
  hasCompletedSessionRestore: boolean;
  projectPath: string | null;
  session: ProjectSession | null;
  diffCache: DiffCache;
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
  diffCache,
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
    const store = getDiffStore(diffCache, projectPath, session.epoch, session.workingTree);
    return runtime.scheduleCacheWarm({
      key: `working-tree-diffs:${session.epoch}:${session.statusGeneration}`,
      reason: "repository-invalidation",
      run: () => warmDiffStore(store),
    });
  }, [
    diffCache,
    hasCompletedSessionRestore,
    projectPath,
    runtime,
    session?.epoch,
    session?.statusGeneration,
    session?.workingTree,
  ]);
}
