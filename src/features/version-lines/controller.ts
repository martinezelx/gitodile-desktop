import type { RepositoryInvalidation } from "../../runtime/project/invalidation";
import type { ProjectRuntime, ProjectCacheWarmReason } from "../../runtime/project/runtime";
import type { VersionLineHistory, VersionLinesSnapshot } from "./domain";
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

/** How many lines' histories stay resolved at once. A history is two Git
 * processes, so re-reading one the user has already looked at is exactly the
 * kind of work the session cache exists to prevent; the cap keeps a long
 * browsing session from holding every branch it ever touched. */
const MAX_LINE_HISTORIES = 24;

function keyOf(query: VersionLinesQuery): string {
  return `${query.projectId}\0${query.sessionEpoch}`;
}

export type VersionLinesController = ReturnType<typeof createVersionLinesController>;

export function createVersionLinesController(port: VersionLinesPort) {
  const entries = new Map<string, Entry>();
  /* Keyed by the line's *tip*, not just its name: a line whose tip has moved
     is a different answer, and one whose tip has not is the same answer no
     matter how many times the screen is left and come back to. That is what
     lets the detail render from cache on arrival instead of asking Git again
     merely because it became visible. */
  const histories = new Map<string, VersionLineHistory>();
  const historyRequests = new Map<string, Promise<VersionLineHistory>>();
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
    // Cached content remains rendered, but consumers still need the busy bit:
    // the contextual Update action uses it to confirm the click, prevent a
    // duplicate request, and keep its progress animation truthful.
    publish(entry, { ...entry.state, isLoading: true, error: null, generation });
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

  const historyKeyOf = (query: VersionLinesQuery, name: string, tipCommit: string): string =>
    `${keyOf(query)}\0${name}\0${tipCommit}`;

  const readHistory = (
    query: VersionLinesQuery,
    name: string,
    tipCommit: string,
  ): Promise<VersionLineHistory> => {
    const key = historyKeyOf(query, name, tipCommit);
    const cached = histories.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = historyRequests.get(key);
    if (pending) return pending;
    const request = port
      .readHistory({ ...query, name })
      .then((history) => {
        histories.set(key, history);
        if (histories.size > MAX_LINE_HISTORIES) {
          // Insertion order is oldest-first, which is close enough to
          // least-recently-read for a cache this small.
          const oldest = histories.keys().next();
          if (!oldest.done) histories.delete(oldest.value);
        }
        return history;
      })
      .finally(() => {
        historyRequests.delete(key);
      });
    historyRequests.set(key, request);
    return request;
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
    readHistory,
    /** The resolved answer if it is already held, so the detail can render on
     * arrival without a loading frame. Never starts a read. */
    peekHistory(query: VersionLinesQuery, name: string, tipCommit: string): VersionLineHistory | null {
      return histories.get(historyKeyOf(query, name, tipCommit)) ?? null;
    },
    supersede(query: VersionLinesQuery): void {
      const entry = entryFor(query);
      publish(entry, { ...entry.state, generation: entry.state.generation + 1 });
      entry.inFlight = null;
    },
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
      const prefix = `${keyOf(query)}\0`;
      for (const key of [...histories.keys()]) {
        if (key.startsWith(prefix)) histories.delete(key);
      }
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
