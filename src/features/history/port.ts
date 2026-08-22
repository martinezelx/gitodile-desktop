import type { FileDiff } from "../changes";
import type { HistoryPage, SavedVersionDetail } from "./domain";

export type HistoryQuery = { projectId: string; sessionEpoch: string };
export type HistoryPageRequest = HistoryQuery & { cursor?: string; pageSize?: number };
export type SavedVersionRequest = HistoryQuery & { snapshotToken: string; commit: string };
export type SavedVersionFileRequest = SavedVersionRequest & { filePath: string };

export interface HistoryPort {
  readPage(request: HistoryPageRequest): Promise<HistoryPage>;
  readDetail(request: SavedVersionRequest): Promise<SavedVersionDetail>;
  readFileDiff(request: SavedVersionFileRequest): Promise<FileDiff>;
}
