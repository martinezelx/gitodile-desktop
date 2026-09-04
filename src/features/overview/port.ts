import type { FileDiff, ImagePreview } from "../changes";
import type { CommitFileChange } from "../publish";

/** Narrow read boundary for expanding one saved version inside Overview. */
export interface PendingVersionDetailsPort {
  readFiles(projectId: string, sessionEpoch: string, commit: string): Promise<CommitFileChange[]>;
  readDiff(projectId: string, sessionEpoch: string, commit: string, filePath: string): Promise<FileDiff>;
  readImagePreview(
    projectId: string,
    sessionEpoch: string,
    commit: string,
    filePath: string,
    originalPath: string | null,
  ): Promise<ImagePreview>;
}

