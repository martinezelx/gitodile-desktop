import type { ChangeCategory, WorkingTreeCounts } from "./repositoryOverview";

/** Mirrors the Rust `SaveVersionPlan` (src-tauri/src/lib.rs). `summary`,
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
};

/** Mirrors the Rust `SaveVersionResult`. */
export type SaveVersionResult = {
  commit: string;
  shortCommit: string;
  description: string;
  branch: string | null;
  savedFiles: number;
};

/** Same fixed reading order as `getWorkingTreeBreakdown` in
 * `repositoryOverview.ts`, applied to a plan's counts instead of a full
 * status — the confirmation screen only ever has the former. */
const BREAKDOWN_ORDER: ChangeCategory[] = ["conflicted", "changed", "new", "deleted", "renamed"];

export function getSaveVersionBreakdown(counts: WorkingTreeCounts): { category: ChangeCategory; count: number }[] {
  return BREAKDOWN_ORDER.map((category) => ({ category, count: counts[category] })).filter((item) => item.count > 0);
}
