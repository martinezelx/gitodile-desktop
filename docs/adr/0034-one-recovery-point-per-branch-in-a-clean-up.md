# ADR 0034: Keep one recovery point per branch when cleaning up several branches at once

- Status: accepted
- Date: 2026-10-21

Vocabulary and paths are normalized to
[ADR 0035](0035-use-branches-as-the-product-vocabulary.md). Per-branch recovery
and retention guarantees remain in force; no compatibility migration is needed.

## Context

Task 173 lets the Branches screen delete every branch in its "Ready to clean up"
block in one confirmed step. Those branches are finished — their work is on
the main branch and was their own — and each is deletable one at a time
already: the main branch holds its tip, so the single delete keeps no recovery
point for it (ADR 0016 keeps one only for a branch whose work survives as
copies).

A batch changes one thing that matters here: deleting a dozen branches at once
removes a dozen names a reader may want back, and only the reflog remembers
which tip each had.

The task asks that every deleted branch can be recreated from Recovery, reusing
the existing recovery-reference mechanism (ADR 0008, generalised by ADR 0016).
That mechanism keeps the newest 20 records per operation. One clean-up writing
into the `delete-branch` namespace would evict the recovery points that
squash-merged deletions rely on, and a clean-up of more than 20 branches would
evict its own.

## Decision

A clean-up is its own history-recovery operation, `clean-up-branches`,
with its own ref namespace and manifest folder:

```text
refs/gitodile/recovery/v1/clean-up-branches/<owner-id>/<recovery-id>
<common-git-dir>/gitodile/history-recovery/v1/clean-up-branches/<owner-id>/<recovery-id>.json
```

Before deleting each branch, the clean-up creates and verifies one record with
the branch's name (`branch`), its tip (`previousCommit` and `targetCommit`), the
first ref holding it (`destinationBranch`) and its published copy, if any. No
verified record, no deletion of that branch.

Retention becomes a property of the operation: `clean-up-branches` keeps
the newest **50** records, the other operations keep 20, and Rust refuses a
clean-up of more than 50 branches, so a single clean-up never evicts its own
records. The dialog asks for the first 50 branches of a longer block and says the
rest wait.

Each branch is rechecked immediately before its deletion against the single
delete's rules, live, after the branches before it are gone. A branch held by
nothing any more is skipped as unique work rather than deleted, even though its
recovery point would keep it. Remote copies are deleted after every local
deletion, one push per remote, and their failures never undo the local half.

## Consequences

- Every branch a clean-up deletes has a verified hidden ref and manifest naming
  it and its tip, so a Recovery center (task 065-5) can list and recreate it.
  Until that exists, the references are reported in the clean-up's result.
- Squash-merge recovery points (ADR 0016) and team-update recovery points
  (ADR 0008) are never evicted by a clean-up.
- A clean-up costs one record write and verification per branch, a few Git
  processes each; fifty branches stay within a few seconds on a local disk.
- Only finished branches are cleaned up, so the main branch holds every deleted
  branch's work as well as its recovery point; the recovery point is what keeps
  its name.

## Alternatives considered

- **Share the `delete-branch` namespace.** Rejected: one clean-up would
  evict the recovery points ADR 0016 promises for squash-merged branches.
- **No recovery point for branches held elsewhere**, as the single delete does.
  Rejected: the task asks that every deleted branch can be recreated by name,
  and a name is exactly what a deleted branch loses.
- **One record for the whole clean-up.** Rejected: the record format names one
  branch and one tip, and a per-branch record lets a Recovery center bring back
  one branch without the others.
- **Abort the whole clean-up when any branch changed.** Rejected: one branch
  switched to or moved between preview and confirmation would block the
  dozen that are still safe; each branch is reported instead.
