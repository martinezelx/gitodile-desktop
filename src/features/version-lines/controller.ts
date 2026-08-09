import type { RepositoryInvalidation } from "../../repositoryInvalidation";
import type { ProjectRuntime, ProjectCacheWarmReason } from "../../projectRuntime";
import type { VersionLinesSnapshot } from "./domain";
import type { VersionLinesPort, VersionLinesQuery } from "./port";
import { EMPTY_VERSION_LINES_STATE, versionLinesSnapshotsEqual, type VersionLinesState } from "./store";

type Listener = () => void;
type Entry = {
  state: VersionLinesState;
  listeners: Set<Listener>;
  inFlight: { generation: number; promise: Promise<void> } | null;
  lastUsed: number;
};

const MAX_PROJECT_SNAPSHOTS = 8;

function keyOf(query: VersionLinesQuery): string {
  return `${query.projectId}\0${query.sessionEpoch}`;
}

export type VersionLinesController = ReturnType<typeof createVersionLinesController>;

export function createVersionLinesController(port: VersionLinesPort) {
  const entries = new Map<string, Entry>();
  let clock = 0;

  const publish = (entry: Entry, next: VersionLinesState): void => {
    if (Object.is(entry.state, next)) return;
    entry.state = next;
    for (const listener of [...entry.listeners]) listener();
  };

  const evictOverflow = (protectedKey: string): void => {
    if (entries.size <= MAX_PROJECT_SNAPSHOTS) return;
    const candidate = [...entries.entries()]
      .filter(([key, entry]) => key !== protectedKey && entry.listeners.size === 0 && !entry.inFlight)
      .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
    if (candidate) entries.delete(candidate[0]);
  };

  const entryFor = (query: VersionLinesQuery): Entry => {
    const key = keyOf(query);
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        state: { ...EMPTY_VERSION_LINES_STATE, ...query },
        listeners: new Set(),
        inFlight: null,
        lastUsed: ++clock,
      };
      entries.set(key, entry);
      evictOverflow(key);
    }
    entry.lastUsed = ++clock;
    return entry;
  };

  const refresh = (query: VersionLinesQuery): Promise<void> => {
    const entry = entryFor(query);
    if (entry.inFlight) return entry.inFlight.promise;
    const generation = entry.state.generation + 1;
    if (!entry.state.snapshot) {
      publish(entry, { ...entry.state, isLoading: true, error: null, generation });
    } else {
      publish(entry, { ...entry.state, generation });
    }
    const promise = port
      .read(query)
      .then((snapshot) => {
        if (entry.state.generation !== generation) return;
        const unchanged = versionLinesSnapshotsEqual(entry.state.snapshot, snapshot);
        publish(entry, {
          ...entry.state,
          snapshot: unchanged ? entry.state.snapshot : snapshot,
          error: null,
          isLoading: false,
        });
      })
      .catch((error: unknown) => {
        if (entry.state.generation !== generation) return;
        publish(entry, { ...entry.state, error, isLoading: false });
      })
      .finally(() => {
        if (entry.inFlight?.generation === generation) entry.inFlight = null;
      });
    entry.inFlight = { generation, promise };
    return promise;
  };

  const commit = (query: VersionLinesQuery, snapshot: VersionLinesSnapshot): void => {
    const entry = entryFor(query);
    const unchanged = versionLinesSnapshotsEqual(entry.state.snapshot, snapshot);
    publish(entry, {
      ...entry.state,
      snapshot: unchanged ? entry.state.snapshot : snapshot,
      error: null,
      isLoading: false,
      generation: entry.state.generation + 1,
    });
    entry.inFlight = null;
  };

  return {
    port,
    getSnapshot(query: VersionLinesQuery): VersionLinesState {
      return entryFor(query).state;
    },
    subscribe(query: VersionLinesQuery, listener: Listener): () => void {
      const entry = entryFor(query);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    refresh,
    commit,
    scheduleWarm(runtime: ProjectRuntime, query: VersionLinesQuery, reason: ProjectCacheWarmReason): () => void {
      return runtime.scheduleCacheWarm({
        key: `version-lines:${query.sessionEpoch}`,
        reason,
        run: () => refresh(query),
      });
    },
    invalidate(runtime: ProjectRuntime, event: RepositoryInvalidation): void {
      if (event.kind === "worktree") return;
      const query = { projectId: event.projectId, sessionEpoch: event.sessionEpoch };
      void runtime.scheduleCacheWarm({
        key: `version-lines:${query.sessionEpoch}`,
        reason: "repository-invalidation",
        run: () => refresh(query),
      });
    },
    close(query: VersionLinesQuery): void {
      const entry = entries.get(keyOf(query));
      if (!entry) return;
      entry.state = { ...entry.state, generation: entry.state.generation + 1 };
      entry.inFlight = null;
      entries.delete(keyOf(query));
    },
    size(): number {
      return entries.size;
    },
  };
}
