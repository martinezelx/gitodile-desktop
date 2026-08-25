export type DiffLineKind = "context" | "addition" | "deletion";
import type { ChangeCategory } from "../status";

export type DiffLine = { kind: DiffLineKind; content: string; oldLineNumber: number | null; newLineNumber: number | null };
export type DiffHunk = { header: string; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[] };
export type FileDiff =
  | { kind: "text"; path: string; originalPath: string | null; change: ChangeCategory; hunks: DiffHunk[]; truncated: boolean }
  | { kind: "binary"; path: string; originalPath: string | null; change: ChangeCategory }
  | { kind: "too-large"; path: string; originalPath: string | null; change: ChangeCategory; limitBytes: number }
  | { kind: "conflict"; path: string; hunks: DiffHunk[]; truncated: boolean; detail: string | null }
  | { kind: "unchanged"; path: string; originalPath: string | null; change: ChangeCategory };
/** Why a speculative warm returned what it returned. `completed` means the
 * batch covers every change; `truncated` means the backend's warm budget was
 * reached; `deferred` means the changeset was not eligible and no aggregate
 * diff was read at all. The last two are not preloaded completeness — and they
 * are not a signal to request every file individually either: whatever is
 * missing loads on demand when the user opens it. */
export type DiffWarmOutcome = "completed" | "truncated" | "deferred";
export type WorkingTreeDiffBatch = {
  outcome: DiffWarmOutcome;
  diffs: FileDiff[];
  changedFiles: number;
  budgetBytes: number;
};
export type FileLines = { startLine: number; lines: string[]; truncated: boolean };
export type DiscardPlan = {
  operationKind: "destructive";
  stateToken: string;
  fileCount: number;
  counts: { changed: number; new: number; deleted: number; renamed: number; conflicted: number; total: number };
  selectedPath: string | null;
  affectsPreparedChanges: boolean;
  removesUntrackedFiles: boolean;
  includesConflicts: boolean;
  isUnborn: boolean;
  recovery: string;
  requiresConfirmation: boolean;
};
export type DiscardResult = { discardedFiles: number; recovery: DiscardRecovery };
export type DiscardRecovery = {
  recoveryId: string;
  createdAtMs: number;
  fileCount: number;
  selectedPath: string | null;
  stateToken: string;
};
