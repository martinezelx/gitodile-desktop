import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useScreenLifecycleController } from "../../runtime/screen/module";
import type { DiscardRecoveryRecord } from "../changes";
import type { CommitFileChange, PendingVersionsResult } from "../publish";
import type { RemoteHome } from "./port";

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

/** How many of the newest restorable copies Overview keeps to list: as many
 * as its card scrolls through; the rest are counted. */
export const RECOVERY_LIST_LIMIT = 50;

/** One stored discard as Overview lists it: when, how many files, and a few
 * of their paths to tell it apart. */
export type RestorableCopy = Pick<DiscardRecoveryRecord, "recoveryId" | "createdAtMs" | "fileCount" | "previewPaths">;

/** What Overview offers of the stored discards: the newest ones that can be
 * restored right now, and how many can be. */
export type RestorableDiscard = {
  /** Newest first, at most `RECOVERY_LIST_LIMIT`; never empty. */
  copies: RestorableCopy[];
  /** Every copy the picker could restore, the listed ones included. Their
   * files are not added up: several copies can hold the same file. */
  restorableCount: number;
};

/** Where the project lives, for the header: unknown until first read, then
 * the remote's home or `null` for a project with no remote — or unavailable
 * when the first read failed, which never claims there is no remote. */
export type RemoteHomeState =
  | { status: "unknown" }
  | { status: "unavailable" }
  | { status: "ready"; home: RemoteHome | null };

export type WorkDetailSnapshot = {
  /** Files of each unpublished version read so far, by commit. A saved
   * version never changes, so an entry is read once per session. */
  commitFiles: ReadonlyMap<string, CommitFilesState>;
  /** The newest stored discards that can be restored right now, or `null`. */
  recovery: RestorableDiscard | null;
  /** What the last remote check brought down, or `null` with nothing waiting. */
  incoming: IncomingState | null;
  home: RemoteHomeState;
};

export type WorkDetailPorts = {
  readCommitFileChanges(query: WorkDetailQuery & { commit: string }): Promise<CommitFileChange[]>;
  /** The newest stored discards that can be restored right now, or `null`.
   * Not merely the newest ones: that copy stays stored after it is restored or
   * once the project moves past it, and offering it would open a picker with
   * nothing to pick. */
  findRestorableDiscard(query: WorkDetailQuery): Promise<RestorableDiscard | null>;
  readIncomingVersions(query: WorkDetailQuery): Promise<PendingVersionsResult>;
  /** Where the project lives, or `null` when it has no remote. */
  readRemoteHome(query: WorkDetailQuery): Promise<RemoteHome | null>;
};

/** The newest records of a listing that can be restored right now, with how
 * many can be. The listing is newest first. */
export function newestRestorableDiscard(records: readonly DiscardRecoveryRecord[]): RestorableDiscard | null {
  const restorable = records.filter((item) => item.availability === "restorable");
  if (restorable.length === 0) return null;
  return {
    copies: restorable.slice(0, RECOVERY_LIST_LIMIT).map(({ recoveryId, createdAtMs, fileCount, previewPaths }) => ({
      recoveryId,
      createdAtMs,
      fileCount,
      previewPaths,
    })),
    restorableCount: restorable.length,
  };
}

const copiesKey = (recovery: RestorableDiscard | null): string =>
  recovery ? `${recovery.restorableCount}|${recovery.copies.map((copy) => copy.recoveryId).join(",")}` : "";

const EMPTY: WorkDetailSnapshot = { commitFiles: new Map(), recovery: null, incoming: null, home: { status: "unknown" } };

export type WorkDetailController = ReturnType<typeof createWorkDetailController>;

/**
 * What Overview shows of the project beyond its status: the files the
 * unpublished versions carry, the newest discards that can be restored, and
 * where the project lives.
 *
 * It never reads because a screen became visible. The composition root asks
 * for the files when the unpublished list changes, for the recovery on a
 * working-tree invalidation (a discard is one) and for the home on a shared
 * one (remotes live in the config), idle-deferred, and Overview renders
 * whatever is already here.
 */
export function createWorkDetailController(ports: WorkDetailPorts) {
  const snapshots = new Map<string, WorkDetailSnapshot>();
  const listeners = new Map<string, Set<() => void>>();
  const recoveryGenerations = new Map<string, number>();
  const homeGenerations = new Map<string, number>();

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
    /** Reads the newest restorable discards. One that cannot be read or does
     * not exist is simply not offered: the Changes screen owns the full list. */
    async refreshRecovery(query: WorkDetailQuery): Promise<void> {
      const key = keyOf(query);
      const generation = (recoveryGenerations.get(key) ?? 0) + 1;
      recoveryGenerations.set(key, generation);
      let recovery: RestorableDiscard | null;
      try {
        recovery = await ports.findRestorableDiscard(query);
      } catch {
        recovery = null;
      }
      if (recoveryGenerations.get(key) !== generation) return;
      const current = read(key);
      if (copiesKey(current.recovery) === copiesKey(recovery)) return;
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
    /** Reads where the project lives. One that cannot be read keeps what was
     * shown, or says it is unavailable when nothing was, so a failing read
     * never claims the project has no remote nor waits forever. */
    async refreshRemoteHome(query: WorkDetailQuery): Promise<void> {
      const key = keyOf(query);
      const generation = (homeGenerations.get(key) ?? 0) + 1;
      homeGenerations.set(key, generation);
      let home: RemoteHome | null;
      try {
        home = await ports.readRemoteHome(query);
      } catch {
        if (homeGenerations.get(key) === generation && read(key).home.status === "unknown") {
          write(key, { ...read(key), home: { status: "unavailable" } });
        }
        return;
      }
      if (homeGenerations.get(key) !== generation) return;
      const current = read(key);
      const shown = current.home.status === "ready" ? current.home.home : undefined;
      if (
        shown !== undefined
        && shown?.remote === home?.remote
        && shown?.provider === home?.provider
        && shown?.label === home?.label
        && shown?.hasWebPage === home?.hasWebPage
      ) return;
      write(key, { ...current, home: { status: "ready", home } });
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
      homeGenerations.delete(key);
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
