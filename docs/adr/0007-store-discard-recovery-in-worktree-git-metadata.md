# ADR 0007: Store discard recovery in worktree Git metadata

- Status: accepted
- Date: 2026-08-13

## Context

Discarding unsaved work can replace tracked files, remove new files, resolve an
index conflict, and overwrite staged state. A Git ref cannot represent
untracked files or the index's conflict stages, while a stash mutates the real
working tree and index as part of creating the recovery point. GitOdrile needs
to create recovery before mutation, preserve the user's branch history and Git
configuration, work without an identity, and survive an application restart.

Linked worktrees share objects and refs but own separate working trees and
indexes. A recovery record must therefore belong to the worktree that produced
it rather than to the shared repository as a whole.

## Decision

Discard recovery records live below the opened worktree's resolved Git
directory:

```text
<git-dir>/gitodrile/recovery/<opaque-id>/
  manifest.json
  index
  files/<sequence>
<git-dir>/gitodrile/recovery/latest
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
discard's verified after-state. If anything changed, GitOdrile preserves the
record and refuses automatic restore rather than overwrite newer work. A
successful restore copies the saved index and path states back, verifies the
before-state, and keeps the record available for the future Recovery screen.

Paths are validated lexically and by resolving their existing parent against
the canonical worktree root. Operations act on exact path arguments after
`--`; they do not use shell strings, globs, `reset --hard`, or `clean`.
Symlinks are captured and recreated as links rather than followed. Unsupported
filesystem objects and submodules fail before mutation.

Recovery data remains local in Git metadata, is never transmitted, and is not
placed in Git's object database or refs. The future Recovery screen will
discover versioned complete manifests rather than infer state from directory
names.

## Consequences

- Staged state, conflict stages, untracked bytes, deletions, renames, modes and
  symlinks can be recovered without changing branch history.
- Linked worktrees cannot accidentally offer one another's recovery records.
- Recovery consumes local disk space and stores copies of discarded content in
  Git metadata until retention removes older complete records. The UI must say
  this plainly and a future settings/recovery surface should expose cleanup.
- Automatic restore refuses after any repository-state change. This is more
  conservative than merging a recovery into newer work, but it never silently
  overwrites that work.
- Restoring filesystem metadata is limited to portable metadata GitOdrile can
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
  not meet GitOdrile's safety promise for a destructive operation.
