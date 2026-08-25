import type {
  DiscardPlan,
  DiscardRecovery,
  DiscardResult,
  FileDiff,
  FileLines,
  WorkingTreeDiffBatch,
} from "./domain";
export type ChangesQuery = { projectId: string; sessionEpoch: string };
export type FileDiffQuery = ChangesQuery & { filePath: string };
export type FileLinesQuery = FileDiffQuery & { startLine: number; endLine: number };
export interface ChangesPort {
  readFileDiff(query: FileDiffQuery): Promise<FileDiff>;
  readWorkingTreeDiffs(query: ChangesQuery): Promise<WorkingTreeDiffBatch>;
  readFileLines(query: FileLinesQuery): Promise<FileLines>;
  planDiscard(query: ChangesQuery & { selectedPath: string | null }): Promise<DiscardPlan>;
  discard(query: ChangesQuery & { selectedPath: string | null; stateToken: string }): Promise<DiscardResult>;
  getDiscardRecovery(query: ChangesQuery): Promise<DiscardRecovery>;
  restoreDiscard(query: ChangesQuery & { recoveryId: string; stateToken: string }): Promise<void>;
}
