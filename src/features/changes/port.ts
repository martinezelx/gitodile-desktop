import type { FileDiff, FileLines } from "./domain";
export type ChangesQuery = { projectId: string; sessionEpoch: string };
export type FileDiffQuery = ChangesQuery & { filePath: string };
export type FileLinesQuery = FileDiffQuery & { startLine: number; endLine: number };
export interface ChangesPort {
  readFileDiff(query: FileDiffQuery): Promise<FileDiff>;
  readWorkingTreeDiffs(query: ChangesQuery): Promise<FileDiff[]>;
  readFileLines(query: FileLinesQuery): Promise<FileLines>;
}
