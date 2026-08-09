export type SavedVersionSummary = {
  commit: string;
  shortCommit: string;
  title: string;
  description: string | null;
  committedAt: string;
  author: string;
};

export type PendingVersionsResult = {
  totalCount: number;
  versions: SavedVersionSummary[];
  isTruncated: boolean;
};
