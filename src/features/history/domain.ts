import type { FileDiff } from "../changes";
import type { HeadState } from "../repository";
import type { ChangeCategory } from "../status";

export type HistoryTimestamp = { unixSeconds: number; offsetMinutes: number };
export type SavedVersionAuthor = { name: string; email: string };
export type PublicationState = "local-only" | "published" | "unknown";
export type DecorationKind = "head" | "localBranch" | "remoteBranch" | "tag";
export type HistoryDecoration = { kind: DecorationKind; name: string; fullRef: string };
export type MessageUnavailableReason = "tooLarge" | "pageBudget" | "malformed";
export type HistoryWarningCode =
  | "shallowRepository"
  | "decorationsTruncated"
  | "messagesTruncated"
  | "unreadableMetadata"
  | "upstreamUnavailable";

export type SavedVersionSummary = {
  commit: string;
  shortCommit: string;
  parents: string[];
  subject: string;
  description: string;
  author: SavedVersionAuthor | null;
  authoredAt: HistoryTimestamp | null;
  committedAt: HistoryTimestamp | null;
  decorations: HistoryDecoration[];
  isRoot: boolean;
  isMerge: boolean;
  publication: PublicationState;
  subjectTruncated: boolean;
  descriptionTruncated: boolean;
  decorationsTruncated: boolean;
  messageUnavailable: MessageUnavailableReason | null;
};

export type UpstreamBoundary = {
  remote: string;
  destinationBranch: string;
  trackingRef: string;
  commit: string;
};

export type HistoryPage = {
  repositoryId: string;
  snapshotToken: string;
  branch: string | null;
  headState: HeadState;
  headCommit: string | null;
  upstream: UpstreamBoundary | null;
  versions: SavedVersionSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  shallow: boolean;
  warnings: HistoryWarningCode[];
};

export type HistoryFileChange = {
  path: string;
  originalPath: string | null;
  category: ChangeCategory;
};

export type HistoryFileCounts = {
  changed: number;
  new: number;
  deleted: number;
  renamed: number;
  total: number;
};

export type SavedVersionDetail = {
  version: SavedVersionSummary;
  comparisonBase: string;
  comparisonIsEmptyTree: boolean;
  comparisonIsFirstParent: boolean;
  files: HistoryFileChange[];
  fileCounts: HistoryFileCounts;
  filesTruncated: boolean;
  countsAreMinimum: boolean;
};

export type HistoryDetailView = {
  detail: SavedVersionDetail | null;
  isLoading: boolean;
  error: unknown | null;
};

export type HistoryDiffView = {
  diff: FileDiff | null;
  isLoading: boolean;
  error: unknown | null;
};

export type HistoryState = {
  projectId: string;
  sessionEpoch: string;
  snapshot: Omit<HistoryPage, "versions"> | null;
  versions: SavedVersionSummary[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: unknown | null;
  moreError: unknown | null;
  staleNotice: boolean;
  clientTruncated: boolean;
  selectedCommit: string | null;
  selectedFilePath: string | null;
  selectionRemoved: boolean;
  detail: HistoryDetailView;
  fileDiff: HistoryDiffView;
  scrollOffset: number;
  generation: number;
};

export type CachedDetail = { detail: SavedVersionDetail; usedAt: number };
export type CachedDiff = { diff: FileDiff; usedAt: number; bytes: number };
