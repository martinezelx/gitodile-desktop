# ADR 0007: Store discard recovery in worktree Git metadata

- Status: accepted
- Date: 2026-08-13

Namespace spelling superseded by [ADR 0009](0009-use-only-the-canonical-product-identity.md).
Path examples below use the canonical spelling; the recovery protocol is unchanged.

## Context

Discarding unsaved work can replace tracked files, remove new files, resolve an
index conflict, and overwrite staged state. A Git ref cannot represent
untracked files or the index's conflict stages, while a stash mutates the real
working tree and index as part of creating the recovery point. GitOdile needs
to create recovery before mutation, preserve the user's branch history and Git
configuration, work without an identity, and survive an application restart.

Linked worktrees share objects and refs but own separate working trees and
indexes. A recovery record must therefore belong to the worktree that produced
it rather than to the shared repository as a whole.

## Decision

Discard recovery records live below the opened worktree's resolved Git
directory:

```text
<git-dir>/gitodile/recovery/<opaque-id>/
  manifest.json
  index
  files/<sequence>
<git-dir>/gitodile/recovery/latest
```

The record is a private implementation detail with an explicit schema version.
Its manifest stores repository-relative target paths, whether each path was
absent, a regular file, a file-transition directory, or a symbolic link, the
minimum metadata needed to restore that kind, and fingerprints of the confirmed
before-state and verified after-state. Regular file bytes use opaque sequence
names rather than user paths inside the recovery directory. The real index is
copied byte-for-byte; absence of an index is represented explicitly.

Creation uses a unique sibling directory, writes all payloads, flushes the
manifest through a temporary file, atomically renames the complete record, then
replaces `latest`. A discard does not touch the working tree or index until
both the record and pointer publication succeed. A failed discard or restore
never deletes its recovery record. Successful creation retains the ten newest
complete records for that worktree; incomplete temporary directories and
records involved in the current operation are excluded from cleanup.

Restore is deliberately conservative. It runs under the repository mutation
lock and requires the current working-tree/index fingerprint to match the
discard's verified after-state. If anything changed, GitOdile preserves the
record and refuses automatic restore rather than overwrite newer work. A
successful restore copies the saved index and path states back, verifies the
before-state, and keeps the record available for the future Recovery screen.
See the amendment below: that fingerprint remains the condition for restoring
the *index*, but is no longer the only way to restore the files.

Paths are validated lexically and by resolving their existing parent against
the canonical worktree root. Operations act on exact path arguments after
`--`; they do not use shell strings, globs, `reset --hard`, or `clean`.
Symlinks are captured and recreated as links rather than followed. Unsupported
filesystem objects and submodules fail before mutation.

Recovery data remains local in Git metadata, is never transmitted, and is not
placed in Git's object database or refs. The future Recovery screen will
discover versioned complete manifests rather than infer state from directory
names.

## Amendment, 2026-09-06: restore is scoped to the record's own paths

The original rule refused a restore unless the whole working tree and index
were still exactly as the discard left them. That is a far broader condition
than the harm it protects against, and in practice it retired every stored
record within seconds: editing any unrelated file changes the fingerprint, so
the screen whose promise is "discarding is undoable" answered "no" to a record
that would have re-created one deleted file and touched nothing else.

A restore can only damage the paths it writes. So a record is now applicable
when **none of its own recorded paths appears as changed in the current
status** — anything under a captured directory included, since restoring
replaces the directory rather than merging into it. A discard leaves each of
its targets in the project's saved state or removes it, and Git reports both as
unchanged, so one of those paths appearing in status is exactly the signal that
something has been written there since. That check reuses the same status read
the strict fingerprint already needed, and carries the same blind spot it
always had: a path that has since become ignored is invisible to both.

Two consequences follow, and both are stated rather than hidden:

- **The index is not restored in this mode.** It is the whole project's
  prepared state, not the record's own; once anything else has moved on, the
  record's copy is the older one and writing it back would undo staging the
  record never captured. Only an exact whole-tree match still restores it, and
  the picker says which kind of restore each record offers before it is
  pressed.
- **Verification narrows to match.** The exact restore still proves itself by
  recomputing the whole-tree fingerprint and comparing it with the recorded
  before-state. The scoped restore cannot — the rest of the project has
  legitimately moved on — so it verifies every path it wrote against the state
  the manifest recorded for it, which is the same guarantee applied to the part
  it touched.

Retention gains one rule from the same reasoning. A record carries a
fingerprint of what it would write — its paths, and the bytes now stored for
each — and a new record whose fingerprint matches an existing one replaces it.
Discarding a file, bringing it back and discarding it again is one recovery
point reached twice, not two of them, and offering the same bytes under two
timestamps asks the reader to choose between identical things. The fingerprint
covers only the record's own contents for the same reason the restore check
does: work elsewhere in the project between the two discards must not make one
recovery point look like two. Records written before the field exists have none,
and fall back to comparing their whole-tree before-state, which is all they
carry; the field is optional rather than a schema break, so records stay
readable in both directions.

Everything else in this record stands: recovery is still created before
mutation, records are still never deleted on failure, and a restore that would
overwrite work at one of its own paths is still refused.

## Consequences

- Staged state, conflict stages, untracked bytes, deletions, renames, modes and
  symlinks can be recovered without changing branch history.
- Linked worktrees cannot accidentally offer one another's recovery records.
- Recovery consumes local disk space and stores copies of discarded content in
  Git metadata until retention removes older complete records. The UI must say
  this plainly. The cleanup this anticipated exists as of 2026-09-06: the
  restore picker deletes one record at a time, asking first and naming what
  goes with it, and the `latest` pointer follows the deletion rather than
  dangling at a record that is no longer there. It is the only operation here
  that destroys a snapshot, so it validates the record id's shape before
  building a path from it rather than after.
- Automatic restore refuses when one of the record's own paths has been written
  again (originally: after any repository-state change at all — see the
  amendment). This is more conservative than merging a recovery into newer
  work, but it never silently overwrites that work.
- Restoring filesystem metadata is limited to portable metadata GitOdile can
  reproduce. Unsupported special files fail safely.

## Alternatives considered

- **Create a commit or recovery branch.** Rejected because commits cannot
  preserve untracked-only state or the exact index, require object/index work,
  and would expose implementation refs in the user's Git model.
- **Use `git stash push --include-untracked`.** Rejected because creating the
  recovery itself mutates the real worktree and index and then needs a second
  fallible mutation to put the user back where they started.
- **Copy the complete worktree.** Rejected because large repositories make the
  cost and privacy footprint disproportionate to the confirmed target.
- **Rely on reflog, editor local history, or the operating-system trash.**
  Rejected because none preserves all required states consistently across
  Windows, macOS and Linux.
- **Require confirmation but provide no recovery.** Rejected because it does
  not meet GitOdile's safety promise for a destructive operation.
