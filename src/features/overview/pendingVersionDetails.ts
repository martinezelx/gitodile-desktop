import { useCallback, useMemo, useState } from "react";

import type { FileDiff, ImagePreview } from "../changes";
import type { CommitFileChange } from "../publish";
import type { PendingVersionDetailsPort } from "./port";
import { pendingVersionDetailsPort } from "./tauriAdapter";

export type FilesState = "loading" | "error" | CommitFileChange[];
export type DiffState = "loading" | "error" | FileDiff;

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

  const readImagePreview = useCallback(
    (commit: string, filePath: string, originalPath: string | null): Promise<ImagePreview> =>
      port.readImagePreview(projectId, sessionEpoch, commit, filePath, originalPath),
    [port, projectId, sessionEpoch],
  );

  return useMemo(() => ({ filesByCommit, selectedFileByCommit, diffsByCommit, toggleCommit, toggleFile, readImagePreview }),
    [diffsByCommit, filesByCommit, readImagePreview, selectedFileByCommit, toggleCommit, toggleFile]);
}
