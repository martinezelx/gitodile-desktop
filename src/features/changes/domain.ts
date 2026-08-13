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
