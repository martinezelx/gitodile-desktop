# ADR 0034: Keep one recovery point per line when cleaning up several version lines at once

- Status: accepted
- Date: 2026-10-21

## Context

Task 173 lets the Lines screen delete every line in its "Ready to clean up"
block in one confirmed step. Those lines are finished — their work is on
the main line and was their own — and each is deletable one at a time
already: the main line holds its tip, so the single delete keeps no recovery
point for it (ADR 0016 keeps one only for a line whose work survives as
copies).

A batch changes one thing that matters here: deleting a dozen lines at once
removes a dozen names a reader may want back, and only the reflog remembers
which tip each had.

The task asks that every deleted line can be recreated from Recovery, reusing
the existing recovery-reference mechanism (ADR 0008, generalised by ADR 0016).
That mechanism keeps the newest 20 records per operation. One clean-up writing
into the `delete-version-line` namespace would evict the recovery points that
squash-merged deletions rely on, and a clean-up of more than 20 lines would
evict its own.

## Decision

A clean-up is its own history-recovery operation, `clean-up-version-lines`,
with its own ref namespace and manifest folder:

```text
refs/gitodile/recovery/v1/clean-up-version-lines/<owner-id>/<recovery-id>
<common-git-dir>/gitodile/history-recovery/v1/clean-up-version-lines/<owner-id>/<recovery-id>.json
```

Before deleting each line, the clean-up creates and verifies one record with
the line's name (`branch`), its tip (`previousCommit` and `targetCommit`), the
first ref holding it (`destinationBranch`) and its published copy, if any. No
verified record, no deletion of that line.

Retention becomes a property of the operation: `clean-up-version-lines` keeps
the newest **50** records, the other operations keep 20, and Rust refuses a
clean-up of more than 50 lines, so a single clean-up never evicts its own
records. The dialog asks for the first 50 lines of a longer block and says the
rest wait.

Each line is rechecked immediately before its deletion against the single
delete's rules, live, after the lines before it are gone. A line held by
nothing any more is skipped as unique work rather than deleted, even though its
recovery point would keep it. Remote copies are deleted after every local
deletion, one push per remote, and their failures never undo the local half.

## Consequences

- Every line a clean-up deletes has a verified hidden ref and manifest naming
  it and its tip, so a Recovery center (task 065-5) can list and recreate it.
  Until that exists, the references are reported in the clean-up's result.
- Squash-merge recovery points (ADR 0016) and team-update recovery points
  (ADR 0008) are never evicted by a clean-up.
- A clean-up costs one record write and verification per line, a few Git
  processes each; fifty lines stay within a few seconds on a local disk.
- Only finished lines are cleaned up, so the main line holds every deleted
  line's work as well as its recovery point; the recovery point is what keeps
  its name.

## Alternatives considered

- **Share the `delete-version-line` namespace.** Rejected: one clean-up would
  evict the recovery points ADR 0016 promises for squash-merged lines.
- **No recovery point for lines held elsewhere**, as the single delete does.
  Rejected: the task asks that every deleted line can be recreated by name,
  and a name is exactly what a deleted line loses.
- **One record for the whole clean-up.** Rejected: the record format names one
  line and one tip, and a per-line record lets a Recovery center bring back
  one line without the others.
- **Abort the whole clean-up when any line changed.** Rejected: one line
  switched to or moved between preview and confirmation would block the
  dozen that are still safe; each line is reported instead.
