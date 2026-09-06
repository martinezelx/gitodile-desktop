export type DiffLineKind = "context" | "addition" | "deletion";
import type { ChangeCategory } from "../status";

export type DiffLine = { kind: DiffLineKind; content: string; oldLineNumber: number | null; newLineNumber: number | null };
export type DiffHunk = { header: string; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[] };
export type FileDiff =
  | { kind: "text"; path: string; originalPath: string | null; change: ChangeCategory; hunks: DiffHunk[]; truncated: boolean }
  | { kind: "binary"; path: string; originalPath: string | null; change: ChangeCategory }
  | { kind: "image"; path: string; originalPath: string | null; change: ChangeCategory }
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
/** One version of a changed image. `ready` carries the picture; the other two
 * say why there is none, so a frame is never drawn empty. A side that is
 * `null` in `ImagePreview` does not exist at all — an added image has no
 * before, a deleted one has no after. */
export type ImagePreviewSide =
  | { kind: "ready"; mediaType: string; byteLength: number; data: string }
  | { kind: "too-large"; byteLength: number; limitBytes: number }
  | { kind: "unsupported"; byteLength: number };
export type ImagePreview = { before: ImagePreviewSide | null; after: ImagePreviewSide | null };

/** Reads a changed image's two versions. Supplied by whichever surface is
 * showing the diff, because only it knows whether the file is being compared
 * against the working tree or inside a saved version. */
export type ImagePreviewLoader = (
  filePath: string,
  originalPath: string | null,
) => Promise<ImagePreview>;

/** An SVG keeps its text diff and gains a drawing, so the decision to offer
 * one is made from the path rather than from a diff kind of its own. */
export function isSvgPath(path: string): boolean {
  return path.toLocaleLowerCase().endsWith(".svg");
}

/** The `data:` URL an `<img>` draws a preview from. Never inserted as markup:
 * in an `img` context the engine runs no script and fetches nothing, which is
 * what makes rendering an SVG out of a repository safe. */
export function imagePreviewDataUrl(side: { mediaType: string; data: string }): string {
  return `data:${side.mediaType};base64,${side.data}`;
}
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
/** Whether a stored recovery can be applied right now. Restoring writes the
 * protected state back over the working tree, so Rust only offers it while
 * nothing has been written at the paths it would restore: `superseded` means
 * exactly that has happened, `incomplete` that the discard never finished.
 * Neither is a lost snapshot — both are still on disk, and both are worth
 * showing. */
export type DiscardRecoveryAvailability = "restorable" | "superseded" | "incomplete";
/** One stored recovery, as the restore picker lists it. `previewPaths` names a
 * handful of the paths; `fileCount` is how many there really are. */
export type DiscardRecoveryRecord = {
  recoveryId: string;
  createdAtMs: number;
  fileCount: number;
  selectedPath: string | null;
  previewPaths: string[];
  stateToken: string | null;
  availability: DiscardRecoveryAvailability;
  /** Whether restoring also puts the project's prepared changes back. Only a
   * record the whole project still matches can: once anything else has moved
   * on, that record's copy of the index is older than the real one. */
  restoresPreparedState: boolean;
};
