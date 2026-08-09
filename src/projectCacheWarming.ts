import { useEffect, useRef } from "react";

import { getDiffStore, warmDiffStore, type DiffCache } from "./diffCache";
import type { ProjectRuntime } from "./projectRuntime";
import type { ProjectSession } from "./projectSessions";

type ProjectCacheWarmingOptions = {
  runtime: ProjectRuntime;
  hasCompletedSessionRestore: boolean;
  projectPath: string | null;
  session: ProjectSession | null;
  diffCache: DiffCache;
  refreshVersionLines: (path: string) => Promise<void>;
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
  refreshVersionLines,
}: ProjectCacheWarmingOptions): void {
  const refreshVersionLinesRef = useRef(refreshVersionLines);
  refreshVersionLinesRef.current = refreshVersionLines;

  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath) {
      return undefined;
    }
    return runtime.scheduleCacheWarm({
      key: `version-lines:${session?.epoch ?? "closed"}`,
      reason: "project-activation",
      run: () => refreshVersionLinesRef.current(projectPath),
    });
  }, [hasCompletedSessionRestore, projectPath, runtime, session?.epoch]);

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
