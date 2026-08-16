# ADR 0008: Store history recovery as versioned hidden refs

- Status: accepted
- Date: 2026-08-16

## Context

Getting team changes advances the active branch and replaces index/worktree
content. The first implementation is strictly fast-forward-only, but GitOdrile
still needs durable evidence of the previous `HEAD` before either history or
files change. Unlike discard recovery from ADR 0007, the protected state is a
commit already in Git's object database, so copying worktree bytes would be
slower, less exact, and harder to enumerate from a future Recovery center.

Ordinary branches are user-owned and visible. Reflogs can expire. Linked
worktrees share objects and refs but have separate active branches, indexes,
and working files. A recovery record must therefore be hidden from ordinary
branch/tag listings, globally protected from garbage collection, attributable
to the worktree that created it, resilient to project moves and branch
deletion, and bounded so routine updates do not create immortal refs forever.

Git cannot atomically commit a ref update and a filesystem manifest in one
transaction. The creation protocol must define when recovery becomes usable
and how partial artifacts are handled before local mutation is allowed.

## Decision

### Namespace, schema, and ownership

History recovery refs use this versioned namespace:

```text
refs/gitodrile/recovery/v1/get-team-changes/<owner-id>/<recovery-id>
```

Their matching manifests live in the common repository metadata:

```text
<common-git-dir>/gitodrile/history-recovery/v1/
  get-team-changes/<owner-id>/<recovery-id>.json
  pending/<owner-id>-<recovery-id>.json
```

`owner-id` is `worktree-` plus a stable FNV-1a hexadecimal digest of the
worktree Git directory relative to the common Git directory: `main` for the
primary worktree and the normalized `worktrees/<administrative-name>` identity
for a linked worktree. It does not contain an absolute project path. Moving a
repository therefore keeps ownership stable, while removing and recreating a
linked worktree does not accidentally claim an old worktree's records.

`recovery-id` contains Unix milliseconds, process id, a process-wide monotonic
sequence, and a format slot reserved for a future allocator revision. Those
components make routine collisions unlikely; correctness comes from Git's
compare-and-swap creation, not from guessing a unique name. A collision blocks
that reviewed plan and requires a newly planned reference rather than silently
substituting a different recovery identity after confirmation.

The manifest has an explicit schema version and stores the recovery id/ref,
creation time, operation kind, owner id, branch at creation, previous and
planned target commits, configured remote/destination/tracking ref, and the
opaque plan token used as evidence. It stores no credentials or absolute
worktree path. These fields are sufficient for the Recovery center to explain
what was protected and to plan a separately confirmed restore without relying
on a branch that may have moved or been deleted.

### Creation, atomicity, and verification

Before any history/index/worktree mutation, GitOdrile performs these steps
under the exclusive `commonGitDir` permit:

1. Reconcile version-1 artifacts and enforce retention, reserving one slot.
2. Create a pending manifest with exclusive filesystem creation, write all
   bytes, and flush the file.
3. Create the ref with `git update-ref <ref> <previous-commit> <zero-oid>`.
   The expected zero object id makes this an atomic create-only operation.
4. Resolve the ref as a commit and verify it equals the previous `HEAD`.
5. Atomically rename the pending manifest to its final name, read it back, and
   verify its identity, ref, owner, and previous commit.

Only after step 5 is recovery considered complete and local mutation may
start. A failure before that point never authorizes a history/file change. If
the ref exists but final manifest publication fails, GitOdrile deletes exactly
that ref with a compare-and-swap old value. If cleanup cannot be proven, it
leaves the pending evidence for version-1 reconciliation and reports recovery
creation failure; it still does not start the update.

Once complete, the record is never removed by the running get-team-changes
operation. Update failures, cancellation, timeouts, uncertain outcomes, and
verification failures all retain it. Secondary result metadata may be updated
later, but inability to do so never invalidates the already verified recovery
ref.

### Visibility, retention, and cleanup

`refs/gitodrile/...` does not appear in ordinary local branch, remote branch,
or tag listings. It remains visible to explicit all-ref plumbing commands and
keeps the protected commit reachable for Git garbage collection. The UI calls
it a local recovery point and puts the exact ref in technical details.

Version 1 retains at most **20 complete get-team-changes records per common
repository**, across all linked worktrees. Before a new record is created,
GitOdrile removes the oldest eligible complete records until at most 19 remain,
then verifies that a slot exists. Cleanup deletes the exact ref with its
recorded commit as the expected old value and removes the matching manifest
only after ref deletion is verified. The current record is protected.

An orphan ref with no final manifest and a matching pending artifact is an
incomplete pre-mutation creation and is eligible for reconciliation. A final
manifest whose ref is missing is also incomplete. Unknown schema versions,
unreadable complete records, refs outside the exact version-1 namespace, and
the current record are never guessed at or deleted. If those artifacts prevent
the version-1 limit from being guaranteed, GitOdrile refuses to create another
recovery point instead of accumulating more hidden refs.

Retention runs on every get-team-changes creation, including after an app
restart. It is not time-based, so a quiet project's recovery does not expire
merely because time passed. A later Recovery center may expose explicit
retention controls through a new ADR, but it must honor or deliberately
supersede this format.

### Moves, branch deletion, worktrees, and upgrades

- Repository moves preserve the common metadata, relative owner identity,
  refs, and manifests. No stored absolute path needs rewriting.
- Branch movement or deletion does not move or delete a recovery ref. The
  record names the branch only as historical explanation.
- Linked worktrees share the global limit and object reachability, while the
  owner id lets the Recovery center prioritize records from the selected
  worktree and clearly label records from another one.
- Removing a linked worktree leaves its bounded records available in the
  common repository. Recreating a different worktree cannot inherit them by
  path coincidence.
- Upgrades read only supported schema/namespace versions. Unsupported records
  remain untouched and cannot be silently counted as disposable. A future
  format uses a new version segment and an explicit migration/superseding ADR.

### Recovery-center behavior

The future Recovery center enumerates complete manifests, verifies each ref,
groups by common repository and owner, and presents operation, time, branch,
previous commit, and planned target in human language. Acting on a record is a
new plan/confirm/revalidate mutation. This ADR does not authorize reset,
checkout, force movement, automatic rollback, or deleting a user's branch.

## Consequences

- The previous commit is protected before a fast-forward changes local state,
  without manufacturing a visible branch or copying worktree data.
- Recovery remains available after restart, repository movement, branch
  movement/deletion, and failures after recovery creation.
- Linked-worktree ownership is explainable while concurrency and retention are
  correctly shared at `commonGitDir` scope.
- Hidden refs are bounded to 20 complete records per common repository. A
  repository with unreadable/unsupported recovery artifacts may block a new
  update until those artifacts can be inspected; this is deliberately safer
  than deleting evidence or growing without limit.
- Ref and manifest publication cannot be one cross-storage transaction, so the
  ordered activation protocol and reconciliation are part of correctness.
- Task 014 creates and reports recovery but does not add an automatic restore
  action or full Recovery-center UI.

## Alternatives considered

- **A visible recovery branch.** Rejected because implementation-owned branches
  pollute the user's branch model and may collide with user naming or cleanup.
- **Reflog only.** Rejected because retention/configuration varies and a future
  Recovery center cannot depend on an entry surviving.
- **A lightweight tag.** Rejected because tags are user-visible and imply user
  intent or release semantics.
- **A manifest containing only the old object id.** Rejected because it does
  not keep the object reachable and garbage collection could remove it.
- **Worktree-local metadata without a ref.** Rejected for the same reachability
  reason and because shared object ownership belongs to the common repository.
- **Unlimited hidden refs until the Recovery center exists.** Rejected because
  routine sync would accumulate permanent hidden roots indefinitely.
- **Delete recovery immediately after success.** Rejected because a technically
  successful update can still be something the user wants to recover from.
