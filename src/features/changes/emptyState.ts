import type { WorkingTreeStatus } from "../status";

/** The head state this screen cares about, mirrored from the repository
 * feature so the helper stays free of a runtime import. */
export type ChangesEmptyHeadState = "branch" | "detached" | "unborn";

/** What the Changes screen should say once the working tree is clean.
 *
 * The empty state used to be one fixed sentence. A clean tree is not one
 * situation though: the remembered work can be unpublished, the remote can be
 * ahead, both can be settled, or there may be no remote at all. Deciding that
 * here — from the snapshot the screen already holds — keeps the branch out of
 * the JSX and lets the copy and its one primary action follow the real state. */
export type ChangesEmptyState =
  | { kind: "unborn" }
  | { kind: "detached" }
  | { kind: "no-remote" }
  | { kind: "behind"; count: number }
  | { kind: "ahead"; count: number }
  | { kind: "up-to-date" };

/** Chooses the empty state from the working-tree snapshot.
 *
 * A diverged line (ahead *and* behind) reports `behind`: publishing while the
 * remote has newer work is not the safe next step, so bringing those changes in
 * comes first and the publish offer waits for the next snapshot. */
export function getChangesEmptyState(
  workingTree: Pick<WorkingTreeStatus, "upstream">,
  headState: ChangesEmptyHeadState = "branch",
): ChangesEmptyState {
  if (headState === "unborn") {
    return { kind: "unborn" };
  }
  if (headState === "detached") {
    return { kind: "detached" };
  }
  const { upstream } = workingTree;
  if (upstream.upstream === null) {
    return { kind: "no-remote" };
  }
  if (upstream.behind > 0) {
    return { kind: "behind", count: upstream.behind };
  }
  if (upstream.ahead > 0) {
    return { kind: "ahead", count: upstream.ahead };
  }
  return { kind: "up-to-date" };
}
