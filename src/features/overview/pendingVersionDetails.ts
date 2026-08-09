import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { FileDiff } from "../changes";
import type { ChangeCategory } from "../status";

export type CommitFileChange = { path: string; originalPath: string | null; category: ChangeCategory };
export type FilesState = "loading" | "error" | CommitFileChange[];
export type DiffState = "loading" | "error" | FileDiff;

export interface PendingVersionDetailsPort {
  readFiles(projectId: string, sessionEpoch: string, commit: string): Promise<CommitFileChange[]>;
  readDiff(projectId: string, sessionEpoch: string, commit: string, filePath: string): Promise<FileDiff>;
}

export const pendingVersionDetailsPort: PendingVersionDetailsPort = {
  readFiles: (path, sessionEpoch, commit) => invoke("read_commit_file_changes", { path, sessionEpoch, commit }),
  readDiff: (path, sessionEpoch, commit, filePath) =>
    invoke("read_commit_file_diff", { path, sessionEpoch, commit, filePath }),
};

/** Owns expandable saved-version read lifecycles outside the visual tree.
 * State is scoped to the mounted Overview epoch and all requests carry it. */
export function usePendingVersionDetails(
  projectId: string,
  sessionEpoch: string,
  port: PendingVersionDetailsPort = pendingVersionDetailsPort,
) {
  const [filesByCommit, setFilesByCommit] = useState<Record<string, FilesState>>({});
  const [selectedFileByCommit, setSelectedFileByCommit] = useState<Record<string, string | undefined>>({});
  const [diffsByCommit, setDiffsByCommit] = useState<Record<string, Record<string, DiffState>>>({});

  const toggleCommit = useCallback((commit: string, isOpen: boolean): void => {
    if (!isOpen || filesByCommit[commit] !== undefined) return;
    setFilesByCommit((current) => ({ ...current, [commit]: "loading" }));
    port.readFiles(projectId, sessionEpoch, commit)
      .then((files) => setFilesByCommit((current) => ({ ...current, [commit]: files })))
      .catch(() => setFilesByCommit((current) => ({ ...current, [commit]: "error" })));
  }, [filesByCommit, port, projectId, sessionEpoch]);

  const toggleFile = useCallback((commit: string, filePath: string): void => {
    setSelectedFileByCommit((current) => ({ ...current, [commit]: current[commit] === filePath ? undefined : filePath }));
    if (diffsByCommit[commit]?.[filePath] !== undefined) return;
    setDiffsByCommit((current) => ({ ...current, [commit]: { ...current[commit], [filePath]: "loading" } }));
    port.readDiff(projectId, sessionEpoch, commit, filePath)
      .then((diff) => setDiffsByCommit((current) => ({ ...current, [commit]: { ...current[commit], [filePath]: diff } })))
      .catch(() => setDiffsByCommit((current) => ({ ...current, [commit]: { ...current[commit], [filePath]: "error" } })));
  }, [diffsByCommit, port, projectId, sessionEpoch]);

  return useMemo(() => ({ filesByCommit, selectedFileByCommit, diffsByCommit, toggleCommit, toggleFile }),
    [diffsByCommit, filesByCommit, selectedFileByCommit, toggleCommit, toggleFile]);
}
