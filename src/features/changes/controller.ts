import type { ProjectRuntime, ProjectCacheWarmReason } from "../../projectRuntime";
import type { WorkingTreeStatus } from "../status";
import type { FileDiff } from "./domain";
import type { ChangesPort } from "./port";

export type DiffStore = {
  projectId: string;
  sessionEpoch: string;
  workingTree: WorkingTreeStatus | null;
  cache: Map<string, FileDiff>;
  requests: Map<string, Promise<FileDiff>>;
  batchStarted: boolean;
  generation: number;
  cachedBytes: number;
};
const MAX_PROJECT_DIFF_CACHES = 4;
export const MAX_DIFF_CACHE_ENTRIES = 256;
export const MAX_DIFF_CACHE_BYTES = 40 * 1024 * 1024;
export type ChangesController = ReturnType<typeof createChangesController>;

export function createChangesController(port: ChangesPort) {
  const stores = new Map<string, DiffStore>();
  const keyOf = (projectId: string, sessionEpoch: string): string => `${projectId}\0${sessionEpoch}`;
  const evictOverflow = (protectedKey: string): void => {
    while (stores.size > MAX_PROJECT_DIFF_CACHES) {
      const candidate = [...stores.keys()].find((key) => key !== protectedKey);
      if (!candidate) return;
      stores.delete(candidate);
    }
  };
  const getStore = (projectId: string, sessionEpoch: string, workingTree: WorkingTreeStatus | null): DiffStore => {
    const key = keyOf(projectId, sessionEpoch);
    const existing = stores.get(key);
    if (existing?.workingTree === workingTree) return existing;
    const store: DiffStore = {
      projectId, sessionEpoch, workingTree, cache: new Map(), requests: new Map(), batchStarted: false, cachedBytes: 0,
      generation: (existing?.generation ?? 0) + 1,
    };
    stores.delete(key);
    stores.set(key, store);
    evictOverflow(key);
    return store;
  };
  const estimateBytes = (diff: FileDiff): number => {
    let characters = diff.path.length + ("originalPath" in diff ? (diff.originalPath?.length ?? 0) : 0);
    if (diff.kind === "text" || diff.kind === "conflict") {
      for (const hunk of diff.hunks) {
        characters += hunk.header.length;
        for (const line of hunk.lines) characters += line.content.length;
      }
    }
    return characters * 2 + 256;
  };
  const cacheDiff = (store: DiffStore, filePath: string, diff: FileDiff): void => {
    const previous = store.cache.get(filePath);
    if (previous) store.cachedBytes -= estimateBytes(previous);
    store.cache.delete(filePath);
    store.cache.set(filePath, diff);
    store.cachedBytes += estimateBytes(diff);
    while (store.cache.size > MAX_DIFF_CACHE_ENTRIES || store.cachedBytes > MAX_DIFF_CACHE_BYTES) {
      const oldest = store.cache.entries().next().value as [string, FileDiff] | undefined;
      if (!oldest) break;
      store.cache.delete(oldest[0]);
      store.cachedBytes -= estimateBytes(oldest[1]);
    }
  };
  const fetchDiff = (store: DiffStore, filePath: string): Promise<FileDiff> => {
    const cached = store.cache.get(filePath);
    if (cached) return Promise.resolve(cached);
    const current = store.requests.get(filePath);
    if (current) return current;
    const generation = store.generation;
    const request = port.readFileDiff({ projectId: store.projectId, sessionEpoch: store.sessionEpoch, filePath })
      .then((diff) => {
        if (store.generation === generation) cacheDiff(store, filePath, diff);
        return diff;
      })
      .finally(() => {
        if (store.requests.get(filePath) === request) store.requests.delete(filePath);
      });
    store.requests.set(filePath, request);
    return request;
  };
  const warm = async (store: DiffStore): Promise<void> => {
    if (!store.workingTree || store.workingTree.isClean || store.batchStarted) return;
    store.batchStarted = true;
    const generation = store.generation;
    try {
      const diffs = await port.readWorkingTreeDiffs({ projectId: store.projectId, sessionEpoch: store.sessionEpoch });
      if (store.generation !== generation) return;
      for (const diff of diffs) if (!store.cache.has(diff.path)) cacheDiff(store, diff.path, diff);
    } catch {
      // Speculative only; the selected-file request owns visible errors.
    }
  };
  return {
    port,
    getStore,
    fetchDiff,
    warmStore: warm,
    readFileLines(projectId: string, sessionEpoch: string, filePath: string, startLine: number, endLine: number) {
      return port.readFileLines({ projectId, sessionEpoch, filePath, startLine, endLine });
    },
    planDiscard(projectId: string, sessionEpoch: string, selectedPath: string | null) {
      return port.planDiscard({ projectId, sessionEpoch, selectedPath });
    },
    discard(projectId: string, sessionEpoch: string, selectedPath: string | null, stateToken: string) {
      return port.discard({ projectId, sessionEpoch, selectedPath, stateToken });
    },
    getDiscardRecovery(projectId: string, sessionEpoch: string) {
      return port.getDiscardRecovery({ projectId, sessionEpoch });
    },
    restoreDiscard(projectId: string, sessionEpoch: string, recoveryId: string, stateToken: string) {
      return port.restoreDiscard({ projectId, sessionEpoch, recoveryId, stateToken });
    },
    scheduleWarm(runtime: ProjectRuntime, projectId: string, sessionEpoch: string, workingTree: WorkingTreeStatus, reason: ProjectCacheWarmReason): () => void {
      const store = getStore(projectId, sessionEpoch, workingTree);
      return runtime.scheduleCacheWarm({ key: `working-tree-diffs:${sessionEpoch}:${store.generation}`, reason, run: () => warm(store) });
    },
    close(projectId: string, sessionEpoch: string): void {
      const store = stores.get(keyOf(projectId, sessionEpoch));
      if (store) store.generation += 1;
      stores.delete(keyOf(projectId, sessionEpoch));
    },
    size: (): number => stores.size,
  };
}
