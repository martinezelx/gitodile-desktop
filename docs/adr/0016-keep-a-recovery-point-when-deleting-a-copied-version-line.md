# ADR 0016: Keep a recovery point when deleting a version line whose work was copied into the main line

- Status: accepted
- Date: 2026-09-24

## Context

GitOdile deletes a version line only when its tip stays reachable from
another local or remote-tracking ref (`retaining_refs`). That proof keeps the
delete from losing saved work, and it is the right default.

It refuses, however, the line users most often want to clean up: one merged
through a pull request with **squash** or **rebase**. The main line then holds
copies of the line's work — one squashed version, or one copy per version —
but not the line's own commits, so nothing retains its tip. GitOdile called
such a line "can't be deleted yet" forever, and offered publishing or merging
work that was already merged.

The Lines route can now tell this case apart without guessing: it compares the
line's changes with the main line's since the parting by `git patch-id
--stable` — the line's whole change against each main-line change (squash), or
each of its versions' changes against them (rebase). The check is read only
and runs for one line at a time.

Deleting such a line still removes the only ref to its original versions.
AGENTS.md requires a recovery reference before a destructive change when that
is feasible, and here it is.

## Decision

A line with no retaining ref may be deleted when its work is found on the main
line as copies (`find_copy_into_main`, the route's own `detect_copy`). The
delete plan says so — where the work is, squashed or copied, and the main-line
commit that holds it — and states that a recovery point will be kept. It
remains a confirmed destructive operation.

Before removing the line, the delete creates and verifies a recovery point
with the ADR 0008 protocol, generalised to more than one operation:

```text
refs/gitodile/recovery/v1/delete-version-line/<owner-id>/<recovery-id>
<common-git-dir>/gitodile/history-recovery/v1/delete-version-line/<owner-id>/<recovery-id>.json
```

The record names the line, its tip (`previousCommit`), the main-line commit
holding the copy (`targetCommit`), the main line (`destinationBranch`) and the
line's upstream, if any. If the recovery point cannot be created and verified,
nothing is deleted. The delete's result reports the recovery reference.

The recovery module keeps one protocol and gains an operation dimension
(`HistoryRecoveryOperation`): each operation has its own ref namespace,
manifest folder and retention of **20 complete records**, and the shared
`pending/` folder is reconciled per operation. `get-team-changes` keeps the
exact ADR 0008 layout, so records already on disk are read where they are.

A line with neither a retaining ref nor a copy on the main line stays
refused, as before.

## Consequences

- Squash- and rebase-merged lines can be deleted from GitOdile, and their
  original versions survive in a hidden, bounded, verified ref.
- The delete dialog explains a new case in plain language, and its result
  now stays on screen until dismissed, which also makes the existing report of
  a refused remote deletion visible.
- The copy check costs a few read-only Git processes per plan and per delete;
  it gives up past a thousand main-line versions since the parting, leaving
  such a line refused rather than guessed about.
- A patch-id match is evidence of the same change, not of the same commits:
  a squash that was edited while merging will not match, and the line stays
  refused. A false match would still leave the originals in the recovery
  point.
- Deleted-line recovery points are invisible until a Recovery center lists
  them; the ref is reported in the delete's result and in technical details.

## Alternatives considered

- **Keep refusing.** Rejected: it leaves the most common finished line
  undeletable and the explanation offered wrong.
- **Force-delete without a recovery point once a copy is found.** Rejected:
  the originals would be lost, and a patch-id match is not proof of identity.
- **A visible backup branch.** Rejected for the reasons in ADR 0008.
- **Create a temporary squash commit and ask `git cherry`**, as some
  branch-cleanup tools do. Rejected: it writes an object to answer a question
  during a read, where patch-ids answer it without writing anything.
- **Share the get-team-changes namespace and limit.** Rejected: deleting many
  finished lines would evict team-update recovery points, and the two answer
  different questions in a Recovery center.
