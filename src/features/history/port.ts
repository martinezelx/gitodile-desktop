import type { FileDiff, ImagePreview } from "../changes";
import type { HistoryPage, SavedVersionDetail } from "./domain";

export type HistoryQuery = { projectId: string; sessionEpoch: string };

/** What the timeline has been narrowed to.
 *
 * Every field is answered by Rust as an argument to the same `git log` that
 * pages the history, never by a predicate over the versions the client is
 * holding: a filter that reads the loaded page stops telling the truth as soon
 * as the history is longer than the page. Dates are calendar days
 * (`YYYY-MM-DD`); `path` is repository-relative. */
export type HistoryFilters = {
  author: string | null;
  since: string | null;
  until: string | null;
  path: string | null;
  noMerges: boolean;
  unpublishedOnly: boolean;
};

export const NO_HISTORY_FILTERS: HistoryFilters = {
  author: null,
  since: null,
  until: null,
  path: null,
  noMerges: false,
  unpublishedOnly: false,
};

export function countActiveFilters(filters: HistoryFilters): number {
  return [
    filters.author,
    filters.since,
    filters.until,
    filters.path,
    filters.noMerges || null,
    filters.unpublishedOnly || null,
  ].filter(Boolean).length;
}

export function sameHistoryFilters(left: HistoryFilters, right: HistoryFilters): boolean {
  return left.author === right.author
    && left.since === right.since
    && left.until === right.until
    && left.path === right.path
    && left.noMerges === right.noMerges
    && left.unpublishedOnly === right.unpublishedOnly;
}

export type HistoryPageRequest = HistoryQuery & { cursor?: string; pageSize?: number; filters?: HistoryFilters };
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
