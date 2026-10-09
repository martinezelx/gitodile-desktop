import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useScreenLifecycleController } from "../../runtime/screen/module";
import type { DiscardRecovery } from "../changes";
import type { CommitFileChange, PendingVersionsResult } from "../publish";

/** How many unpublished versions the column reads the files of. A longer run
 * of unpublished work is still counted; its oldest versions are just not
 * opened, and the column says "at least". */
export const WORK_DETAIL_COMMIT_LIMIT = 20;

export type WorkDetailQuery = { projectId: string; sessionEpoch: string };

export type CommitFilesState =
  | { status: "loading" }
  | { status: "ready"; files: CommitFileChange[] }
  | { status: "error" };

/** The versions waiting on the remote, read for one exact pair of commits —
 * the line's and the tracking ref's — so a new check or a new save reads them
 * again and nothing else does. */
export type IncomingState =
  | { key: string; status: "loading" }
  | { key: string; status: "ready"; result: PendingVersionsResult }
  | { key: string; status: "error" };

export type WorkDetailSnapshot = {
  /** Files of each unpublished version read so far, by commit. A saved
   * version never changes, so an entry is read once per session. */
  commitFiles: ReadonlyMap<string, CommitFilesState>;
  /** The newest stored discard that can still be offered, or `null`. */
  recovery: DiscardRecovery | null;
  /** What the last remote check brought down, or `null` with nothing waiting. */
  incoming: IncomingState | null;
};

export type WorkDetailPorts = {
  readCommitFileChanges(query: WorkDetailQuery & { commit: string }): Promise<CommitFileChange[]>;
  getDiscardRecovery(query: WorkDetailQuery): Promise<DiscardRecovery>;
  readIncomingVersions(query: WorkDetailQuery): Promise<PendingVersionsResult>;
};

const EMPTY: WorkDetailSnapshot = { commitFiles: new Map(), recovery: null, incoming: null };

export type WorkDetailController = ReturnType<typeof createWorkDetailController>;

/**
 * What Overview's side column shows beside the next step: the files the
 * unpublished versions carry, and the newest discard that can be restored.
 *
 * It never reads because a screen became visible. The composition root asks
 * for the files when the unpublished list changes and for the recovery on a
 * working-tree invalidation (a discard is one), idle-deferred, and the column
 * renders whatever is already here.
 */
export function createWorkDetailController(ports: WorkDetailPorts) {
  const snapshots = new Map<string, WorkDetailSnapshot>();
  const listeners = new Map<string, Set<() => void>>();
  const recoveryGenerations = new Map<string, number>();

  const keyOf = (query: WorkDetailQuery): string => `${query.projectId}\0${query.sessionEpoch}`;
  const read = (key: string): WorkDetailSnapshot => snapshots.get(key) ?? EMPTY;
  const write = (key: string, next: WorkDetailSnapshot): void => {
    snapshots.set(key, next);
    for (const listener of [...(listeners.get(key) ?? [])]) listener();
  };
  const setCommit = (key: string, commit: string, state: CommitFilesState): void => {
    const current = read(key);
    const commitFiles = new Map(current.commitFiles);
    commitFiles.set(commit, state);
    write(key, { ...current, commitFiles });
  };

  return {
    getSnapshot(query: WorkDetailQuery): WorkDetailSnapshot {
      return read(keyOf(query));
    },
    subscribe(query: WorkDetailQuery, listener: () => void): () => void {
      const key = keyOf(query);
      const set = listeners.get(key) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(key, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(key);
      };
    },
    /** Reads the files of the given unpublished versions that are not known
     * yet, at most `WORK_DETAIL_COMMIT_LIMIT` of them, newest first. */
    async ensureCommitFiles(query: WorkDetailQuery, commits: readonly string[]): Promise<void> {
      const key = keyOf(query);
      const wanted = commits.slice(0, WORK_DETAIL_COMMIT_LIMIT).filter((commit) => {
        const known = read(key).commitFiles.get(commit);
        return !known || known.status === "error";
      });
      await Promise.all(
        wanted.map(async (commit) => {
          setCommit(key, commit, { status: "loading" });
          try {
            const files = await ports.readCommitFileChanges({ ...query, commit });
            setCommit(key, commit, { status: "ready", files });
          } catch {
            setCommit(key, commit, { status: "error" });
          }
        }),
      );
    },
    /** Reads the newest stored discard. One that cannot be read or does not
     * exist is simply not offered: the Changes screen owns the full list. */
    async refreshRecovery(query: WorkDetailQuery): Promise<void> {
      const key = keyOf(query);
      const generation = (recoveryGenerations.get(key) ?? 0) + 1;
      recoveryGenerations.set(key, generation);
      let recovery: DiscardRecovery | null;
      try {
        recovery = await ports.getDiscardRecovery(query);
      } catch {
        recovery = null;
      }
      if (recoveryGenerations.get(key) !== generation) return;
      const current = read(key);
      if (current.recovery?.recoveryId === recovery?.recoveryId) return;
      write(key, { ...current, recovery });
    },
    /** Reads the incoming versions for this pair of commits, unless they are
     * already known or being read. */
    async ensureIncoming(query: WorkDetailQuery, key: string): Promise<void> {
      const k = keyOf(query);
      const current = read(k).incoming;
      if (current && current.key === key && current.status !== "error") return;
      write(k, { ...read(k), incoming: { key, status: "loading" } });
      let next: IncomingState;
      try {
        next = { key, status: "ready", result: await ports.readIncomingVersions(query) };
      } catch {
        next = { key, status: "error" };
      }
      // A newer pair may have been asked for meanwhile; it wins.
      if (read(k).incoming?.key !== key) return;
      write(k, { ...read(k), incoming: next });
    },
    /** Nothing is waiting on the remote any more. */
    clearIncoming(query: WorkDetailQuery): void {
      const k = keyOf(query);
      if (read(k).incoming === null) return;
      write(k, { ...read(k), incoming: null });
    },
    /** Drops a closed session's snapshot. */
    forget(query: WorkDetailQuery): void {
      const key = keyOf(query);
      snapshots.delete(key);
      recoveryGenerations.delete(key);
    },
  };
}

/** The snapshot for one session, followed only while the screen is active —
 * a hidden Overview does not re-render for it. */
export function useActiveWorkDetail(controller: WorkDetailController, query: WorkDetailQuery): WorkDetailSnapshot {
  const lifecycle = useScreenLifecycleController();
  const bridge = useMemo(() => {
    let selected = controller.getSnapshot(query);
    let unsubscribeStore: (() => void) | null = null;
    const listeners = new Set<() => void>();
    const update = (): void => {
      const next = controller.getSnapshot(query);
      if (Object.is(selected, next)) return;
      selected = next;
      for (const listener of [...listeners]) listener();
    };
    const synchronize = (): void => {
      if (lifecycle.getSnapshot() === "active") {
        update();
        unsubscribeStore ??= controller.subscribe(query, update);
      } else {
        unsubscribeStore?.();
        unsubscribeStore = null;
      }
    };
    return {
      getSnapshot: () => selected,
      subscribe(listener: () => void) {
        listeners.add(listener);
        const unsubscribeLifecycle = lifecycle.subscribe(synchronize);
        synchronize();
        return () => {
          listeners.delete(listener);
          unsubscribeLifecycle();
          if (listeners.size === 0) {
            unsubscribeStore?.();
            unsubscribeStore = null;
          }
        };
      },
    };
  }, [controller, lifecycle, query]);
  const subscribe = useCallback((listener: () => void) => bridge.subscribe(listener), [bridge]);
  return useSyncExternalStore(subscribe, bridge.getSnapshot, bridge.getSnapshot);
}
