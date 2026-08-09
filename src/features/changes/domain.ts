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
