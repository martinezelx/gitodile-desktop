import type { ProjectRuntime } from "../../projectRuntime";
import type { StatusPort, StatusQuery } from "./port";
import { workingTreeSnapshotsEqual } from "./domain";

function pendingSnapshotsEqual(left: ReturnType<ProjectRuntime["getSnapshot"]>["byId"][string]["pendingVersions"] | undefined, right: Awaited<ReturnType<StatusPort["readPendingVersions"]>>): boolean {
  if (left === right) return true;
  if (!left || left.totalCount !== right.totalCount || left.isTruncated !== right.isTruncated || left.versions.length !== right.versions.length) return false;
  return left.versions.every((version, index) => {
    const other = right.versions[index];
    return version.commit === other.commit && version.shortCommit === other.shortCommit && version.title === other.title &&
      version.description === other.description && version.committedAt === other.committedAt && version.author === other.author;
  });
}

export type StatusErrorMapper = (error: unknown, area: "working-tree" | "pending-versions") => string;
export type StatusController = ReturnType<typeof createStatusController>;

/** Owns request generations, concurrent reads and stale epoch rejection. The
 * reducer remains the atomic project snapshot; this controller is the only
 * frontend owner of status IPC orchestration. */
export function createStatusController(port: StatusPort, now: () => number = Date.now) {
  const generations = new Map<string, number>();
  const inFlight = new Map<string, Promise<void>>();
  const keyOf = (query: StatusQuery): string => `${query.projectId}\0${query.sessionEpoch}`;

  const refresh = (runtime: ProjectRuntime, query: StatusQuery, mapError: StatusErrorMapper): Promise<void> => {
    const key = keyOf(query);
    const existing = inFlight.get(key);
    if (existing) return existing;
    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    runtime.dispatch({ type: "startStatusCheck", id: query.projectId, generation, epoch: query.sessionEpoch });

    const promise = Promise.allSettled([
      port.readWorkingTree(query),
      port.readPendingVersions(query),
    ]).then(([workingTree, pendingVersions]) => {
      if (generations.get(key) !== generation) return;
      if (workingTree.status === "fulfilled") {
        const current = runtime.getSnapshot().byId[query.projectId]?.workingTree ?? null;
        runtime.dispatch({
          type: "applyWorkingTree",
          id: query.projectId,
          epoch: query.sessionEpoch,
          generation,
          workingTree: workingTreeSnapshotsEqual(current, workingTree.value) ? current! : workingTree.value,
          checkedAt: now(),
        });
      } else {
        runtime.dispatch({
          type: "applyWorkingTreeError",
          id: query.projectId,
          epoch: query.sessionEpoch,
          generation,
          error: mapError(workingTree.reason, "working-tree"),
        });
      }
      if (pendingVersions.status === "fulfilled") {
        const current = runtime.getSnapshot().byId[query.projectId]?.pendingVersions;
        runtime.dispatch({
          type: "applyPendingVersions",
          id: query.projectId,
          epoch: query.sessionEpoch,
          generation,
          result: pendingSnapshotsEqual(current, pendingVersions.value) ? current! : pendingVersions.value,
        });
      } else {
        runtime.dispatch({
          type: "applyPendingVersionsError",
          id: query.projectId,
          epoch: query.sessionEpoch,
          generation,
          error: mapError(pendingVersions.reason, "pending-versions"),
        });
      }
    }).finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  };

  const supersede = (query: StatusQuery): void => {
    const key = keyOf(query);
    generations.set(key, (generations.get(key) ?? 0) + 1);
    inFlight.delete(key);
  };

  return {
    refresh,
    commitPublishedResult(runtime: ProjectRuntime, query: StatusQuery, remaining: number): void {
      supersede(query);
      runtime.dispatch({
        type: "commitPublishedVersions",
        id: query.projectId,
        epoch: query.sessionEpoch,
        generation: generations.get(keyOf(query))!,
        remaining,
      });
    },
    /** A successful mutation is authoritative over reads that started before
     * it. Advance the generation before the single follow-up refresh. */
    supersede,
    scheduleWarm(runtime: ProjectRuntime, query: StatusQuery, mapError: StatusErrorMapper): () => void {
      return runtime.scheduleCacheWarm({
        key: `status:${query.sessionEpoch}`,
        reason: "project-activation",
        run: () => refresh(runtime, query, mapError),
      });
    },
    close(query: StatusQuery): void {
      supersede(query);
    },
  };
}
