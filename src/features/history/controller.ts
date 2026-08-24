import type { ProjectCacheWarmReason, ProjectRuntime } from "../../projectRuntime";
import { isAppError } from "../../shared/i18n";
import type { FileDiff } from "../changes";
import type {
  CachedDetail,
  CachedDiff,
  HistoryPage,
  HistoryState,
  SavedVersionDetail,
} from "./domain";
import type { HistoryPort, HistoryQuery } from "./port";

type Listener = () => void;
type Entry = {
  state: HistoryState;
  listeners: Set<Listener>;
  firstPageRequest: { generation: number; promise: Promise<void> } | null;
  moreRequest: { generation: number; cursor: string; promise: Promise<void> } | null;
  detailRequests: Map<string, Promise<void>>;
  diffRequests: Map<string, Promise<void>>;
  details: Map<string, CachedDetail>;
  diffs: Map<string, CachedDiff>;
  cacheBytes: number;
  usedAt: number;
};

export const HISTORY_INITIAL_PAGE_SIZE = 50;
export const HISTORY_PAGE_SIZE = 100;
export const MAX_HISTORY_SESSION_CACHES = 4;
export const MAX_HISTORY_ROWS = 5_000;
export const MAX_HISTORY_DETAILS = 24;
export const MAX_HISTORY_DIFFS = 64;
export const MAX_HISTORY_DETAIL_CACHE_BYTES = 20 * 1024 * 1024;

const EMPTY_DETAIL = { detail: null, isLoading: false, error: null } as const;
const EMPTY_DIFF = { diff: null, isLoading: false, error: null } as const;

function emptyState(query: HistoryQuery): HistoryState {
  return {
    ...query,
    snapshot: null,
    versions: [],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    moreError: null,
    staleNotice: false,
    clientTruncated: false,
    selectedCommit: null,
    selectedFilePath: null,
    selectionRemoved: false,
    detail: EMPTY_DETAIL,
    fileDiff: EMPTY_DIFF,
    scrollOffset: 0,
    generation: 0,
  };
}

function keyOf(query: HistoryQuery): string {
  return `${query.projectId}\0${query.sessionEpoch}`;
}

function diffKey(commit: string, filePath: string): string {
  return `${commit}\0${filePath}`;
}

function pageSnapshot(page: HistoryPage): Omit<HistoryPage, "versions"> {
  const { versions: _versions, ...snapshot } = page;
  return snapshot;
}

function estimateDiffBytes(diff: FileDiff): number {
  let characters = diff.path.length + ("originalPath" in diff ? (diff.originalPath?.length ?? 0) : 0);
  if (diff.kind === "text" || diff.kind === "conflict") {
    for (const hunk of diff.hunks) {
      characters += hunk.header.length;
      for (const line of hunk.lines) characters += line.content.length;
    }
  }
  return characters * 2 + 256;
}

function estimateDetailBytes(detail: SavedVersionDetail): number {
  let characters = detail.version.subject.length + detail.version.description.length + detail.version.commit.length;
  for (const file of detail.files) characters += file.path.length + (file.originalPath?.length ?? 0);
  return characters * 2 + 1_024;
}

export type HistoryController = ReturnType<typeof createHistoryController>;

export function createHistoryController(port: HistoryPort) {
  const entries = new Map<string, Entry>();
  let clock = 0;

  const publish = (entry: Entry, state: HistoryState): void => {
    if (Object.is(entry.state, state)) return;
    entry.state = state;
    for (const listener of [...entry.listeners]) listener();
  };

  const evictOverflow = (protectedKey: string): void => {
    while (entries.size > MAX_HISTORY_SESSION_CACHES) {
      const candidate = [...entries.entries()]
        .filter(([key, entry]) => key !== protectedKey && entry.listeners.size === 0 && !entry.firstPageRequest)
        .sort((left, right) => left[1].usedAt - right[1].usedAt)[0];
      if (!candidate) return;
      entries.delete(candidate[0]);
    }
  };

  const entryFor = (query: HistoryQuery): Entry => {
    const key = keyOf(query);
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        state: emptyState(query),
        listeners: new Set(),
        firstPageRequest: null,
        moreRequest: null,
        detailRequests: new Map(),
        diffRequests: new Map(),
        details: new Map(),
        diffs: new Map(),
        cacheBytes: 0,
        usedAt: ++clock,
      };
      entries.set(key, entry);
      evictOverflow(key);
    }
    entry.usedAt = ++clock;
    return entry;
  };

  const cacheDetail = (entry: Entry, commit: string, detail: SavedVersionDetail): void => {
    const previous = entry.details.get(commit);
    if (previous) entry.cacheBytes -= estimateDetailBytes(previous.detail);
    entry.details.delete(commit);
    entry.details.set(commit, { detail, usedAt: ++clock });
    entry.cacheBytes += estimateDetailBytes(detail);
    while (entry.details.size > MAX_HISTORY_DETAILS || entry.cacheBytes > MAX_HISTORY_DETAIL_CACHE_BYTES) {
      const oldest = entry.details.entries().next().value as [string, CachedDetail] | undefined;
      if (!oldest) break;
      entry.details.delete(oldest[0]);
      entry.cacheBytes -= estimateDetailBytes(oldest[1].detail);
    }
  };

  const cacheDiff = (entry: Entry, key: string, diff: FileDiff): void => {
    const previous = entry.diffs.get(key);
    if (previous) entry.cacheBytes -= previous.bytes;
    const bytes = estimateDiffBytes(diff);
    entry.diffs.delete(key);
    entry.diffs.set(key, { diff, usedAt: ++clock, bytes });
    entry.cacheBytes += bytes;
    while (
      entry.diffs.size > MAX_HISTORY_DIFFS ||
      entry.cacheBytes > MAX_HISTORY_DETAIL_CACHE_BYTES
    ) {
      const oldest = entry.diffs.entries().next().value as [string, CachedDiff] | undefined;
      if (!oldest) break;
      entry.diffs.delete(oldest[0]);
      entry.cacheBytes -= oldest[1].bytes;
    }
  };

  const clearContentCaches = (entry: Entry): void => {
    entry.details.clear();
    entry.diffs.clear();
    entry.detailRequests.clear();
    entry.diffRequests.clear();
    entry.cacheBytes = 0;
  };

  const loadFileDiff = (
    query: HistoryQuery,
    entry: Entry,
    generation: number,
    commit: string,
    filePath: string,
  ): Promise<void> => {
    const snapshotToken = entry.state.snapshot?.snapshotToken;
    if (!snapshotToken) return Promise.resolve();
    const key = diffKey(commit, filePath);
    const cached = entry.diffs.get(key);
    if (cached) {
      cached.usedAt = ++clock;
      if (entry.state.selectedCommit === commit && entry.state.selectedFilePath === filePath) {
        publish(entry, { ...entry.state, fileDiff: { diff: cached.diff, isLoading: false, error: null } });
      }
      return Promise.resolve();
    }
    const current = entry.diffRequests.get(key);
    if (current) return current;
    if (entry.state.selectedCommit === commit && entry.state.selectedFilePath === filePath) {
      publish(entry, { ...entry.state, fileDiff: { diff: null, isLoading: true, error: null } });
    }
    const request = port
      .readFileDiff({ ...query, snapshotToken, commit, filePath })
      .then((diff) => {
        if (entry.state.generation !== generation || entry.state.snapshot?.snapshotToken !== snapshotToken) return;
        cacheDiff(entry, key, diff);
        if (entry.state.selectedCommit === commit && entry.state.selectedFilePath === filePath) {
          publish(entry, { ...entry.state, fileDiff: { diff, isLoading: false, error: null } });
        }
      })
      .catch((error: unknown) => {
        if (entry.state.generation !== generation) return;
        if (entry.state.selectedCommit === commit && entry.state.selectedFilePath === filePath) {
          publish(entry, { ...entry.state, fileDiff: { diff: null, isLoading: false, error } });
        }
      })
      .finally(() => {
        if (entry.diffRequests.get(key) === request) entry.diffRequests.delete(key);
      });
    entry.diffRequests.set(key, request);
    return request;
  };

  const loadDetail = (
    query: HistoryQuery,
    entry: Entry,
    generation: number,
    commit: string,
    validatingSelection = false,
  ): Promise<void> => {
    const snapshotToken = entry.state.snapshot?.snapshotToken;
    if (!snapshotToken) return Promise.resolve();
    const cached = entry.details.get(commit);
    if (cached) {
      cached.usedAt = ++clock;
      const selectedFilePath = entry.state.selectedFilePath ?? cached.detail.files[0]?.path ?? null;
      if (entry.state.selectedCommit === commit) {
        publish(entry, {
          ...entry.state,
          selectedFilePath,
          detail: { detail: cached.detail, isLoading: false, error: null },
          fileDiff: EMPTY_DIFF,
        });
        if (selectedFilePath) void loadFileDiff(query, entry, generation, commit, selectedFilePath);
      }
      return Promise.resolve();
    }
    const current = entry.detailRequests.get(commit);
    if (current) return current;
    if (entry.state.selectedCommit === commit) {
      publish(entry, { ...entry.state, detail: { detail: null, isLoading: true, error: null }, fileDiff: EMPTY_DIFF });
    }
    const request = port
      .readDetail({ ...query, snapshotToken, commit })
      .then((detail) => {
        if (entry.state.generation !== generation || entry.state.snapshot?.snapshotToken !== snapshotToken) return;
        cacheDetail(entry, commit, detail);
        if (entry.state.selectedCommit !== commit) return;
        const selectedFilePath = detail.files.some((file) => file.path === entry.state.selectedFilePath)
          ? entry.state.selectedFilePath
          : detail.files[0]?.path ?? null;
        publish(entry, {
          ...entry.state,
          selectedFilePath,
          selectionRemoved: false,
          detail: { detail, isLoading: false, error: null },
          fileDiff: EMPTY_DIFF,
        });
        if (selectedFilePath) void loadFileDiff(query, entry, generation, commit, selectedFilePath);
      })
      .catch((error: unknown) => {
        if (entry.state.generation !== generation) return;
        if (validatingSelection && isAppError(error) && error.code === "invalid_selection") {
          const fallback = entry.state.versions[0]?.commit ?? null;
          publish(entry, {
            ...entry.state,
            selectedCommit: fallback,
            selectedFilePath: null,
            selectionRemoved: true,
            detail: EMPTY_DETAIL,
            fileDiff: EMPTY_DIFF,
          });
          if (fallback) void loadDetail(query, entry, generation, fallback);
        } else if (entry.state.selectedCommit === commit) {
          publish(entry, { ...entry.state, detail: { detail: null, isLoading: false, error } });
        }
      })
      .finally(() => {
        if (entry.detailRequests.get(commit) === request) entry.detailRequests.delete(commit);
      });
    entry.detailRequests.set(commit, request);
    return request;
  };

  const refreshInternal = (query: HistoryQuery, staleNotice: boolean): Promise<void> => {
    const entry = entryFor(query);
    if (entry.firstPageRequest) return entry.firstPageRequest.promise;
    const generation = entry.state.generation + 1;
    publish(entry, {
      ...entry.state,
      generation,
      isLoading: true,
      error: null,
      moreError: null,
      isLoadingMore: false,
      staleNotice: staleNotice || entry.state.staleNotice,
    });
    const previousSnapshotToken = entry.state.snapshot?.snapshotToken;
    const previousSelection = entry.state.selectedCommit;
    const promise = port
      .readPage({ ...query, pageSize: HISTORY_INITIAL_PAGE_SIZE })
      .then((page) => {
        if (entry.state.generation !== generation) return;
        if (previousSnapshotToken !== page.snapshotToken) clearContentCaches(entry);
        const selectedCommit = previousSelection ?? page.versions[0]?.commit ?? null;
        publish(entry, {
          ...entry.state,
          snapshot: pageSnapshot(page),
          versions: page.versions,
          selectedCommit,
          selectedFilePath: previousSelection === selectedCommit ? entry.state.selectedFilePath : null,
          isLoading: false,
          error: null,
          moreError: null,
          clientTruncated: false,
          detail: EMPTY_DETAIL,
          fileDiff: EMPTY_DIFF,
        });
        if (selectedCommit) {
          const validatingSelection = previousSelection !== null && !page.versions.some((item) => item.commit === previousSelection);
          void loadDetail(query, entry, generation, selectedCommit, validatingSelection);
        }
      })
      .catch((error: unknown) => {
        if (entry.state.generation !== generation) return;
        publish(entry, { ...entry.state, isLoading: false, error });
      })
      .finally(() => {
        if (entry.firstPageRequest?.generation === generation) entry.firstPageRequest = null;
      });
    entry.firstPageRequest = { generation, promise };
    return promise;
  };

  const loadMore = (query: HistoryQuery): Promise<void> => {
    const entry = entryFor(query);
    const cursor = entry.state.snapshot?.nextCursor;
    if (!cursor || !entry.state.snapshot?.hasMore || entry.state.clientTruncated) return Promise.resolve();
    if (entry.moreRequest?.cursor === cursor) return entry.moreRequest.promise;
    const generation = entry.state.generation;
    publish(entry, { ...entry.state, isLoadingMore: true, moreError: null });
    const promise = port
      .readPage({ ...query, cursor, pageSize: HISTORY_PAGE_SIZE })
      .then((page) => {
        if (entry.state.generation !== generation) return;
        const snapshot = entry.state.snapshot;
        if (!snapshot || snapshot.snapshotToken !== page.snapshotToken) return;
        const known = new Set(entry.state.versions.map((version) => version.commit));
        const additions = page.versions.filter((version) => !known.has(version.commit));
        const combined = [...entry.state.versions, ...additions];
        const clientTruncated = combined.length > MAX_HISTORY_ROWS;
        combined.length = Math.min(combined.length, MAX_HISTORY_ROWS);
        publish(entry, {
          ...entry.state,
          versions: combined,
          snapshot: {
            ...snapshot,
            nextCursor: clientTruncated ? null : page.nextCursor,
            hasMore: clientTruncated ? false : page.hasMore,
            warnings: [...new Set([...snapshot.warnings, ...page.warnings])],
          },
          isLoadingMore: false,
          moreError: null,
          clientTruncated,
        });
      })
      .catch((error: unknown) => {
        if (entry.state.generation !== generation) return;
        if (isAppError(error) && error.code === "stale_history_cursor") {
          entry.moreRequest = null;
          void refreshInternal(query, true);
          return;
        }
        publish(entry, { ...entry.state, isLoadingMore: false, moreError: error });
      })
      .finally(() => {
        if (entry.moreRequest?.promise === promise) entry.moreRequest = null;
      });
    entry.moreRequest = { generation, cursor, promise };
    return promise;
  };

  return {
    port,
    getSnapshot(query: HistoryQuery): HistoryState {
      return entryFor(query).state;
    },
    subscribe(query: HistoryQuery, listener: Listener): () => void {
      const entry = entryFor(query);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    refresh(query: HistoryQuery): Promise<void> {
      return refreshInternal(query, false);
    },
    loadMore,
    selectVersion(query: HistoryQuery, commit: string): void {
      const entry = entryFor(query);
      if (entry.state.selectedCommit === commit) return;
      publish(entry, {
        ...entry.state,
        selectedCommit: commit,
        selectedFilePath: null,
        selectionRemoved: false,
        detail: EMPTY_DETAIL,
        fileDiff: EMPTY_DIFF,
      });
      void loadDetail(query, entry, entry.state.generation, commit);
    },
    selectFile(query: HistoryQuery, filePath: string): void {
      const entry = entryFor(query);
      const commit = entry.state.selectedCommit;
      if (!commit || entry.state.selectedFilePath === filePath) return;
      publish(entry, { ...entry.state, selectedFilePath: filePath, fileDiff: EMPTY_DIFF });
      void loadFileDiff(query, entry, entry.state.generation, commit, filePath);
    },
    retryDetail(query: HistoryQuery): void {
      const entry = entryFor(query);
      const commit = entry.state.selectedCommit;
      if (!commit) return;
      entry.details.delete(commit);
      void loadDetail(query, entry, entry.state.generation, commit);
    },
    retryFileDiff(query: HistoryQuery): void {
      const entry = entryFor(query);
      const { selectedCommit, selectedFilePath } = entry.state;
      if (!selectedCommit || !selectedFilePath) return;
      entry.diffs.delete(diffKey(selectedCommit, selectedFilePath));
      void loadFileDiff(query, entry, entry.state.generation, selectedCommit, selectedFilePath);
    },
    setScrollOffset(query: HistoryQuery, scrollOffset: number): void {
      const entry = entryFor(query);
      if (entry.state.scrollOffset === scrollOffset) return;
      publish(entry, { ...entry.state, scrollOffset });
    },
    supersede(query: HistoryQuery): void {
      const entry = entryFor(query);
      publish(entry, {
        ...entry.state,
        generation: entry.state.generation + 1,
        isLoading: false,
        isLoadingMore: false,
      });
      entry.firstPageRequest = null;
      entry.moreRequest = null;
      entry.detailRequests.clear();
      entry.diffRequests.clear();
    },
    scheduleWarm(runtime: ProjectRuntime, query: HistoryQuery, reason: ProjectCacheWarmReason): () => void {
      return runtime.scheduleCacheWarm({
        key: `history:${query.sessionEpoch}`,
        reason,
        run: () => refreshInternal(query, false),
      });
    },
    close(query: HistoryQuery): void {
      const entry = entries.get(keyOf(query));
      if (entry) entry.state = { ...entry.state, generation: entry.state.generation + 1 };
      entries.delete(keyOf(query));
    },
    size(): number {
      return entries.size;
    },
  };
}
