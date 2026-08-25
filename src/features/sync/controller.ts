import type { ProjectCacheWarmReason, ProjectRuntime } from "../../runtime/project/runtime";
import { teamSyncFactsEqual, type GetTeamChangesResult, type TeamSyncStatus } from "./domain";
import type { SyncPort, TeamSyncQuery } from "./port";

export type SyncErrorMapper = (error: unknown) => string;
export type SyncController = ReturnType<typeof createSyncController>;

type InFlight = {
  kind: "local" | "check";
  generation: number;
  promise: Promise<TeamSyncStatus | null>;
};

function keyOf(query: TeamSyncQuery): string {
  return `${query.projectId}\0${query.sessionEpoch}`;
}

/** Owns all sync request generations. Local refresh and explicit network
 * checks share one epoch sequence so neither can overwrite the newer truth. */
export function createSyncController(port: SyncPort) {
  const generations = new Map<string, number>();
  const inFlight = new Map<string, InFlight>();

  const run = (
    runtime: ProjectRuntime,
    query: TeamSyncQuery,
    kind: "local" | "check",
    mapError: SyncErrorMapper,
    markExistingStale = true,
  ): Promise<TeamSyncStatus | null> => {
    const key = keyOf(query);
    const existing = inFlight.get(key);
    if (existing?.kind === "check" || existing?.kind === kind) return existing.promise;

    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    runtime.dispatch({
      type: "startTeamSyncRequest",
      id: query.projectId,
      epoch: query.sessionEpoch,
      generation,
      kind,
      markExistingStale,
    });

    const promise = (kind === "check" ? port.check(query) : port.readLocal(query))
      .then((status) => {
        if (generations.get(key) !== generation) return null;
        const current = runtime.getSnapshot().byId[query.projectId]?.teamSync.status ?? null;
        // A local read immediately after a successful check is expected when
        // shared refs fan out. Keep the fresh session evidence if the facts
        // are identical; otherwise the changed cached relation replaces it.
        const committed =
          kind === "local" && current?.knowledge === "fresh" && teamSyncFactsEqual(current, status)
            ? current
            : status;
        runtime.dispatch({
          type: "applyTeamSyncStatus",
          id: query.projectId,
          epoch: query.sessionEpoch,
          generation,
          status: committed,
        });
        return committed;
      })
      .catch((error: unknown) => {
        if (generations.get(key) !== generation) return null;
        runtime.dispatch({
          type: "applyTeamSyncError",
          id: query.projectId,
          epoch: query.sessionEpoch,
          generation,
          error: mapError(error),
        });
        return null;
      })
      .finally(() => {
        if (inFlight.get(key)?.generation === generation) inFlight.delete(key);
      });
    inFlight.set(key, { kind, generation, promise });
    return promise;
  };

  const supersede = (runtime: ProjectRuntime, query: TeamSyncQuery): void => {
    const key = keyOf(query);
    generations.set(key, (generations.get(key) ?? 0) + 1);
    inFlight.delete(key);
    runtime.dispatch({ type: "markTeamSyncStale", id: query.projectId, epoch: query.sessionEpoch });
  };

  return {
    refreshLocal(runtime: ProjectRuntime, query: TeamSyncQuery, mapError: SyncErrorMapper) {
      return run(runtime, query, "local", mapError);
    },
    check(runtime: ProjectRuntime, query: TeamSyncQuery, mapError: SyncErrorMapper) {
      return run(runtime, query, "check", mapError);
    },
    planGet(query: TeamSyncQuery, onProgress: Parameters<SyncPort["planGet"]>[1]) {
      return port.planGet(query, onProgress);
    },
    get(request: Parameters<SyncPort["get"]>[0]) {
      return port.get(request);
    },
    commitGetResult(
      runtime: ProjectRuntime,
      query: TeamSyncQuery,
      result: GetTeamChangesResult,
    ): void {
      if (result.outcome !== "completed" || !result.syncStatus) return;
      const key = keyOf(query);
      const generation = (generations.get(key) ?? 0) + 1;
      generations.set(key, generation);
      inFlight.delete(key);
      runtime.dispatch({
        type: "commitTeamSyncResult",
        id: query.projectId,
        epoch: query.sessionEpoch,
        generation,
        status: result.syncStatus,
      });
    },
    supersede,
    scheduleWarm(
      runtime: ProjectRuntime,
      query: TeamSyncQuery,
      reason: ProjectCacheWarmReason,
      mapError: SyncErrorMapper,
    ): () => void {
      return runtime.scheduleCacheWarm({
        key: `sync-local:${query.sessionEpoch}`,
        reason,
        run: async () => {
          await run(runtime, query, "local", mapError, reason !== "project-activation");
        },
      });
    },
    close(runtime: ProjectRuntime, query: TeamSyncQuery): void {
      supersede(runtime, query);
      generations.delete(keyOf(query));
      inFlight.delete(keyOf(query));
    },
  };
}
