import type {
  DiscardPlan,
  DiscardRecovery,
  DiscardRecoveryRecord,
  DiscardResult,
  FileDiff,
  FileLines,
  ImagePreview,
  WorkingTreeDiffBatch,
} from "./domain";
export type ChangesQuery = { projectId: string; sessionEpoch: string };
export type FileDiffQuery = ChangesQuery & { filePath: string };
/** `commit` chooses the pair of versions to compare: absent reads the working
 * tree against the latest saved version, present reads that saved version
 * against its parent. `originalPath` is the pre-rename name, needed to find
 * the earlier version of a renamed image. */
export type ImagePreviewQuery = FileDiffQuery & {
  originalPath: string | null;
  commit?: string;
};
export type FileLinesQuery = FileDiffQuery & { startLine: number; endLine: number };
export interface ChangesPort {
  readFileDiff(query: FileDiffQuery): Promise<FileDiff>;
  /** Opens the operating system's file manager with this file selected.
   *
   * Rust takes the repository-relative path and resolves it against the open
   * project itself, so nothing on this side can name a place on the disk — see
   * `desktop::reveal_project_file`. */
  revealFile(query: FileDiffQuery): Promise<void>;
  readWorkingTreeDiffs(query: ChangesQuery): Promise<WorkingTreeDiffBatch>;
  readFileLines(query: FileLinesQuery): Promise<FileLines>;
  readFileImagePreview(query: ImagePreviewQuery): Promise<ImagePreview>;
  planDiscard(query: ChangesQuery & { selectedPath: string | null }): Promise<DiscardPlan>;
  discard(query: ChangesQuery & { selectedPath: string | null; stateToken: string }): Promise<DiscardResult>;
  getDiscardRecovery(query: ChangesQuery): Promise<DiscardRecovery>;
  listDiscardRecoveries(query: ChangesQuery): Promise<DiscardRecoveryRecord[]>;
  restoreDiscard(query: ChangesQuery & { recoveryId: string; stateToken: string }): Promise<void>;
  /** Deletes one stored recovery for good. The only copy of that work goes
   * with it, so the surface asking for this owes the user a confirmation. */
  deleteDiscardRecovery(query: ChangesQuery & { recoveryId: string }): Promise<void>;
}
