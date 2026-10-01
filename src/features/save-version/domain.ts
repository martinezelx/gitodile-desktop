import type { ChangeCategory, WorkingTreeCounts, WorkingTreeStatus } from "../status";
import type { HeadState } from "../repository";

/** Whether "also publish" was left checked last time. Shared by both entry
 * points that offer it — this dialog and Changes' quick commit box — so
 * checking it once is remembered by either. */
export const PUBLISH_AFTER_SAVE_STORAGE_KEY = "gitodile-publish-after-save";

/** Mirrors the Rust `SaveVersionPlan` (src-tauri/src/save_version.rs). `summary`,
 * `steps`, `risks`, and `recovery` are deliberately not part of this type:
 * Rust's copy for those fields is English-only prose meant for its own
 * planning logic, not a localized user-facing string. The dialog builds its
 * own English/Spanish copy from the structured fields below instead. */
export type SaveVersionPlan = {
  operationKind: "history-mutation";
  requiresConfirmation: boolean;
  stateToken: string;
  branch: string | null;
  isFirstVersion: boolean;
  totalFiles: number;
  remainingFiles: number;
  isPartial: boolean;
  hasPreparedChanges: boolean;
  counts: WorkingTreeCounts;
  /** The first `SAVE_PLAN_FILE_LIMIT` files the version takes; `totalFiles`
   * is always the whole count. */
  files: SaveVersionFile[];
};

/** Mirrors the Rust `SaveVersionFile`. */
export type SaveVersionFile = {
  path: string;
  originalPath: string | null;
  category: ChangeCategory;
};

/** Mirrors the Rust `SAVE_PLAN_FILE_LIMIT`: how many files a plan lists. The
 * preview is cut at the same place, so the list does not shrink when the
 * plan replaces it. */
export const SAVE_PLAN_FILE_LIMIT = 50;

/** Mirrors the Rust `SaveVersionResult`. */
export type SaveVersionResult = {
  commit: string;
  shortCommit: string;
  title: string;
  description: string | null;
  branch: string | null;
  savedFiles: number;
};

/** Same fixed reading order as the status feature's
 * `getWorkingTreeBreakdown`, applied to a plan's counts instead of a full
 * status — the confirmation screen only ever has the former. */
const BREAKDOWN_ORDER: ChangeCategory[] = ["conflicted", "changed", "new", "deleted", "renamed"];

export function getSaveVersionBreakdown(counts: WorkingTreeCounts): { category: ChangeCategory; count: number }[] {
  return BREAKDOWN_ORDER.map((category) => ({ category, count: counts[category] })).filter((item) => item.count > 0);
}

/** What the save dialog can say before Git has answered: the parts of a
 * `SaveVersionPlan` its summary and notes draw. A fresh `SaveVersionPlan` is
 * one; so is `previewFromWorkingTree`'s answer, read from what the session
 * already holds. */
export type SaveVersionPreview = Pick<
  SaveVersionPlan,
  "branch" | "isFirstVersion" | "totalFiles" | "remainingFiles" | "hasPreparedChanges" | "counts" | "files"
>;

/** A first answer for the save dialog from the session's cached working-tree
 * status, shown while the fresh plan is out. It is only ever a preview: the
 * dialog holds Save back until the fresh plan replaces it, and only that
 * plan's state token is ever sent.
 *
 * `null` whenever the cache can't stand for the plan:
 * - no cached status, or a clean one (the plan answers "nothing to save");
 * - a partial selection, whose counts are the selection's, not the tree's;
 * - overlapping changes, which block the plan;
 * - a `HEAD` that isn't on a version line (detached) or whose line is unnamed. */
export function previewFromWorkingTree({
  workingTree,
  headState,
  selectedPaths,
}: {
  workingTree: WorkingTreeStatus | null;
  headState: HeadState;
  selectedPaths: string[] | null;
}): SaveVersionPreview | null {
  if (!workingTree || workingTree.isClean || selectedPaths !== null) {
    return null;
  }
  if (workingTree.counts.conflicted > 0 || (headState !== "branch" && headState !== "unborn")) {
    return null;
  }
  const branch = workingTree.upstream.branch;
  if (!branch) {
    return null;
  }
  return {
    branch,
    isFirstVersion: headState === "unborn",
    totalFiles: workingTree.counts.total,
    remainingFiles: 0,
    hasPreparedChanges: workingTree.hasPreparedChanges,
    counts: workingTree.counts,
    files: workingTree.entries
      .slice(0, SAVE_PLAN_FILE_LIMIT)
      .map(({ path, originalPath, category }) => ({ path, originalPath, category })),
  };
}
