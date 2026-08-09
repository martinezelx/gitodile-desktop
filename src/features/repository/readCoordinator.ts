import { acceptsRepositoryInvalidation, invalidationNeedsSharedRefresh, type RepositoryInvalidation } from "../../repositoryInvalidation";
import type { ProjectRuntime } from "../../projectRuntime";
import { shouldRefreshOnWatchEvent, type ProjectSessionsState } from "../../projectSessions";
import type { StatusController, StatusErrorMapper } from "../status";
import type { VersionLinesController } from "../version-lines";
import type { RepositoryController } from "./controller";

export type RepositoryReadCoordinator = ReturnType<typeof createRepositoryReadCoordinator>;

/** Coordinates freshness across repository identity, status and dependent
 * read snapshots. Watch bursts and mutation deferral live here rather than in
 * the app shell or a screen. */
export function createRepositoryReadCoordinator(
  repository: RepositoryController,
  status: StatusController,
  versionLines: VersionLinesController,
) {
  const sequences = new Map<string, number>();
  const deferred = new Map<string, boolean>();

  const refreshStatus = async (runtime: ProjectRuntime, state: ProjectSessionsState, path: string, mapError: StatusErrorMapper): Promise<void> => {
    const epoch = state.byId[path]?.epoch;
    if (epoch) await status.refresh(runtime, { projectId: path, sessionEpoch: epoch }, mapError);
  };

  const refreshAll = async (runtime: ProjectRuntime, state: ProjectSessionsState, path: string, mapError: StatusErrorMapper): Promise<void> => {
    const epoch = state.byId[path]?.epoch;
    if (!epoch) return;
    try {
      const project = await repository.open({ selectedPath: path, sessionEpoch: epoch });
      runtime.dispatch({ type: "open", project });
    } catch {
      // Preserve the last truthful identity; other scoped reads still run.
    }
    void versionLines.refresh({ projectId: path, sessionEpoch: epoch });
    await refreshStatus(runtime, state, path, mapError);
  };

  return {
    refreshStatus,
    refreshAll,
    handleInvalidation(runtime: ProjectRuntime, state: ProjectSessionsState, event: RepositoryInvalidation, mapError: StatusErrorMapper): void {
      const key = `${event.projectId}\0${event.sessionEpoch}`;
      const previous = sequences.get(key) ?? 0;
      const session = state.byId[event.projectId];
      if (!acceptsRepositoryInvalidation(session, event, previous)) return;
      sequences.set(key, event.sequence);
      const shared = invalidationNeedsSharedRefresh(event.kind);
      if (!shouldRefreshOnWatchEvent(session)) {
        deferred.set(event.projectId, shared || (deferred.get(event.projectId) ?? false));
        return;
      }
      void (shared
        ? refreshAll(runtime, state, event.projectId, mapError)
        : refreshStatus(runtime, state, event.projectId, mapError));
    },
    finishDeferred(runtime: ProjectRuntime, state: ProjectSessionsState, path: string, mapError: StatusErrorMapper): void {
      const shared = deferred.get(path);
      if (shared === undefined) return;
      deferred.delete(path);
      void (shared ? refreshAll(runtime, state, path, mapError) : refreshStatus(runtime, state, path, mapError));
    },
    discardDeferred(path: string): void {
      deferred.delete(path);
    },
    close(path: string, sessionEpoch: string): void {
      deferred.delete(path);
      sequences.delete(`${path}\0${sessionEpoch}`);
    },
  };
}
