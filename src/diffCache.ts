import { invoke } from "@tauri-apps/api/core";
import type { FileDiff } from "./changes";
import type { WorkingTreeStatus } from "./repositoryOverview";

// `FileDiff` is imported as a *type only*: the import is erased at compile
// time, so `main.tsx` can own a cache of diffs without statically pulling in
// `changes.tsx` (and the ~70-icon file-type set it carries) and undoing task
// 018's chunk split.

/** Everything known about one project's diffs for one working-tree snapshot.
 * Lives outside `ChangesPanel` (see `DiffCache` below) so leaving the Changes
 * screen and coming back is a cache hit rather than a fresh set of Git
 * processes. */
export type DiffStore = {
  projectPath: string;
  sessionEpoch: string | undefined;
  /** Identity, not contents: a re-read working tree produces a new object even
   * when the file list is unchanged, and the file *contents* behind an
   * unchanged status line may well have changed. Comparing by identity is the
   * only invalidation rule that cannot serve a stale diff. */
  workingTree: WorkingTreeStatus | null;
  cache: Map<string, FileDiff>;
  requests: Map<string, Promise<FileDiff>>;
  /** Guards the activation/invalidation-owned `read_working_tree_diffs` warm-up.
   * Unlike per-file fetches, that call has no per-path key to dedupe through
   * `requests`, so without this flag React re-running the effect for the same
   * store (development's StrictMode double-invoke, a fast-refresh, a remount
   * after navigating away and back, ...) would fire the whole-snapshot batch
   * more than once. */
  batchStarted: boolean;
};

/** One store per project epoch. Owned by the app runtime, not by the
 * Changes screen, so its lifetime matches the open incarnation rather than
 * the mounted component or canonical path alone. */
export type DiffCache = Map<string, DiffStore>;

export function createDiffCache(): DiffCache {
  return new Map();
}

function cacheKey(projectPath: string, sessionEpoch: string | undefined): string {
  return `${projectPath}\0${sessionEpoch ?? "legacy"}`;
}

function freshStore(projectPath: string, sessionEpoch: string | undefined, workingTree: WorkingTreeStatus | null): DiffStore {
  return {
    projectPath,
    sessionEpoch,
    workingTree,
    cache: new Map(),
    requests: new Map(),
    batchStarted: false,
  };
}

/** The store for this project and this working-tree snapshot, replacing it if
 * either changed. Callers must always go through this rather than holding on
 * to a store across renders, since that is what makes a stale snapshot's
 * diffs unreachable. */
export function getDiffStore(
  cache: DiffCache,
  projectPath: string,
  sessionEpoch: string | undefined,
  workingTree: WorkingTreeStatus | null,
): DiffStore {
  const key = cacheKey(projectPath, sessionEpoch);
  const existing = cache.get(key);
  if (existing && existing.workingTree === workingTree) {
    return existing;
  }
  const store = freshStore(projectPath, sessionEpoch, workingTree);
  cache.set(key, store);
  return store;
}

/** Drops everything remembered for one project — used when its session
 * closes, so a closed project's diffs don't stay in memory. */
export function releaseDiffCache(cache: DiffCache, projectPath: string): void {
  for (const [key, store] of cache) {
    if (store.projectPath === projectPath) {
      cache.delete(key);
    }
  }
}

/** Single point of truth for turning a selected path into a diff: checks the cache,
 * then joins an in-flight request for that path if one exists, otherwise
 * starts one. Every caller (the active selection and the background
 * prefetcher in `ChangesPanel`) shares the same cache and in-flight map, so
 * two simultaneous callers for the same path only ever spawn one Git
 * process. Speculative whole-tree warming uses `warmDiffStore` below. */
export function fetchDiff(store: DiffStore, projectPath: string, path: string): Promise<FileDiff> {
  const cached = store.cache.get(path);
  if (cached) {
    return Promise.resolve(cached);
  }
  let request = store.requests.get(path);
  if (!request) {
    request = invoke<FileDiff>("read_file_diff", {
      path: projectPath,
      filePath: path,
      sessionEpoch: store.sessionEpoch,
    }).then(
      (diff) => {
        store.cache.set(path, diff);
        store.requests.delete(path);
        return diff;
      },
      (error: unknown) => {
        store.requests.delete(path);
        throw error;
      },
    );
    store.requests.set(path, request);
  }
  return request;
}

/**
 * Best-effort whole-snapshot warming owned by project activation or a typed
 * repository invalidation. Screens consume the cache but never start this
 * speculative repository read merely because they became visible.
 */
export async function warmDiffStore(store: DiffStore): Promise<void> {
  if (!store.workingTree || store.workingTree.isClean || store.batchStarted) {
    return;
  }
  store.batchStarted = true;
  try {
    const diffs = await invoke<FileDiff[]>("read_working_tree_diffs", {
      path: store.projectPath,
      sessionEpoch: store.sessionEpoch,
    });
    for (const diff of diffs) {
      if (!store.cache.has(diff.path)) {
        store.cache.set(diff.path, diff);
      }
    }
  } catch {
    // Speculative only. The selected-file request owns user-visible errors.
  }
}
