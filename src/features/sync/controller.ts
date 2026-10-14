import type { ProjectCacheWarmReason, ProjectRuntime } from "../../runtime/project/runtime";
import {
  applyUpstreamGoneEvidence,
  teamSyncFactsEqual,
  upstreamGoneEvidenceOf,
  type GetTeamChangesResult,
  type TeamSyncStatus,
  type UpstreamGoneEvidence,
} from "./domain";
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
  /** Per session, the lines a check found gone, kept by line so switching
   * away and back does not turn a deleted branch into "up to date". A check
   * of the line, or a publish to it, replaces its entry. */
  const goneEvidence = new Map<string, Map<string, UpstreamGoneEvidence>>();

  const recordCheck = (key: string, status: TeamSyncStatus): void => {
    if (!status.localBranch) return;
    const evidence = upstreamGoneEvidenceOf(status);
    const lines = goneEvidence.get(key) ?? new Map<string, UpstreamGoneEvidence>();
    if (evidence) lines.set(status.localBranch, evidence);
    else lines.delete(status.localBranch);
    goneEvidence.set(key, lines);
  };

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
        if (kind === "check") recordCheck(key, status);
        const read = kind === "local" && status.localBranch
          ? applyUpstreamGoneEvidence(status, goneEvidence.get(key)?.get(status.localBranch))
          : status;
        // A local read immediately after a successful check is expected when
        // shared refs fan out. Keep the fresh session evidence if the facts
        // are identical; otherwise the changed cached relation replaces it.
        const committed =
          kind === "local" && current?.knowledge === "fresh" && teamSyncFactsEqual(current, read)
            ? current
            : read;
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
    /** The check Get project changes waits on. It records its result like
     * `check`, but a failure rejects with the mapped reason: the dialog must
     * say the remote could not be asked instead of reading the silence as
     * "nothing new". A superseded check still resolves to null. */
    async checkBeforeGet(runtime: ProjectRuntime, query: TeamSyncQuery, mapError: SyncErrorMapper) {
      const status = await run(runtime, query, "check", mapError);
      if (status) return status;
      const error = runtime.getSnapshot().byId[query.projectId]?.teamSync.error ?? null;
      if (error !== null) throw new Error(error);
      return null;
    },
    planGet(query: TeamSyncQuery) {
      return port.planGet(query);
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
      recordCheck(key, result.syncStatus);
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
    /** A publish created the line's remote branch again: what a check said
     * about it being gone no longer holds. */
    publishedTo(query: TeamSyncQuery, line: string): void {
      goneEvidence.get(keyOf(query))?.delete(line);
    },
    /** Forgets the remote branch the current line tracks — the way out the
     * card offers once that branch is gone. Commits the line's new status (no
     * upstream) under a fresh generation, so no earlier read can replace it. */
    async stopTracking(runtime: ProjectRuntime, query: TeamSyncQuery): Promise<TeamSyncStatus> {
      const status = await port.stopTracking(query);
      const key = keyOf(query);
      const generation = (generations.get(key) ?? 0) + 1;
      generations.set(key, generation);
      inFlight.delete(key);
      runtime.dispatch({
        type: "commitTeamSyncResult",
        id: query.projectId,
        epoch: query.sessionEpoch,
        generation,
        status,
      });
      return status;
    },
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
      goneEvidence.delete(keyOf(query));
    },
  };
}
