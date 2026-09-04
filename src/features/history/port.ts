import type { FileDiff, ImagePreview } from "../changes";
import type { HistoryPage, SavedVersionDetail } from "./domain";

export type HistoryQuery = { projectId: string; sessionEpoch: string };
export type HistoryPageRequest = HistoryQuery & { cursor?: string; pageSize?: number };
export type SavedVersionRequest = HistoryQuery & { snapshotToken: string; commit: string };
export type SavedVersionFileRequest = SavedVersionRequest & { filePath: string };
/** No snapshot token: a picture is read straight from the two commits, and
 * neither of them can change under a token the way a moving branch tip can. */
export type SavedVersionImageRequest = HistoryQuery & {
  commit: string;
  filePath: string;
  originalPath: string | null;
};

export interface HistoryPort {
  readPage(request: HistoryPageRequest): Promise<HistoryPage>;
  readDetail(request: SavedVersionRequest): Promise<SavedVersionDetail>;
  readFileDiff(request: SavedVersionFileRequest): Promise<FileDiff>;
  readImagePreview(request: SavedVersionImageRequest): Promise<ImagePreview>;
}
