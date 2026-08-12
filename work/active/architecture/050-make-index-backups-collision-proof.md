---
id: 050
title: Make save-version index backups collision-proof
status: active
priority: high
type: bug
areas:
  - rust
  - git
  - safety
  - platform
created: 2026-08-12
completed:
---

# Goal

Guarantee that concurrent Save version operations can never share or overwrite
the temporary backup that protects each project's real Git index.

# User outcome

Saving two projects at the same time cannot restore prepared changes from the
wrong project or lose the recovery copy needed after a failed save.

# Context

Task 039's validation exposed a Windows collision in the temporary selection
index: its name used only the process id and `SystemTime` nanoseconds, while the
Windows clock can return the same value to multiple calls inside one tick. Commit
`8364ce2` fixed `selection_index_path` with a process-wide atomic sequence and a
concurrent regression test.

`backup_index` in `src-tauri/src/save_version.rs` still uses the old pattern:

```text
gitodrile-index-backup-<pid>-<system-time-nanos>.bak
```

The common-Git-dir coordinator serializes one repository family, not every
project in the process. Two unrelated projects may therefore save concurrently,
select the same backup path and overwrite or remove each other's original index.
If either operation then fails, GitOdrile can restore the other project's index
or report a recovery path whose file no longer contains the right data. This is
a data-safety defect, not only a test-runner race.

# Scope

- Replace the clock-only backup allocation with collision-proof exclusive
  creation. The implementation must detect an existing candidate and retry; a
  generated name alone must not authorize overwriting an existing or stale
  backup.
- Copy the real index into the exclusively reserved file without a window in
  which another save can claim or truncate it.
- Remove an incomplete reserved backup if copying fails, while preserving the
  existing rule that a backup is retained when restoration itself fails.
- Add a deterministic concurrent regression test covering independent index
  paths. It must prove that every operation receives its own backup and that
  every backup contains the matching original bytes.
- Add a collision/stale-file test that forces the first candidate to exist and
  proves it is neither overwritten nor selected.
- Audit the other production `gitodrile-*` temporary-path allocations in the
  save workflow for the same create-after-check pattern; fix only equivalent
  collision risks found there and record the result.
- Preserve structured `IndexUnavailable` and `IndexRestoreFailed` behavior and
  the recovery-path detail returned after a failed restore.

# Out of scope

- Changing Save version planning, selection semantics, hooks or signing.
- Serializing all repositories behind one process-wide save lock.
- Replacing the system temporary directory or adding a general temporary-file
  framework unless the audit finds another real consumer.
- Redesigning the Save version UI or its error copy.

# Acceptance criteria

- [ ] Concurrent backups for unrelated projects cannot select the same path or
      overwrite one another, including on Windows clock granularity.
- [ ] An existing candidate path is handled by retrying exclusive creation; its
      contents remain byte-for-byte unchanged.
- [ ] A deterministic test verifies both unique paths and matching backup
      contents under concurrency.
- [ ] Copy failure removes only the incomplete file created by that attempt.
- [ ] Restore failure still retains the correct backup and reports its path.
- [ ] The audit of Save version temporary allocations is recorded in the task's
      implementation notes.
- [ ] Full `AGENTS.md` validation passes on Windows, and CI is green on Windows,
      macOS and Linux.

# Relevant files

- `src-tauri/src/save_version.rs`
- `src-tauri/src/lib.rs` (existing index restoration integration tests)
- `src-tauri/src/error.rs`
- `docs/ARCHITECTURE.md`, Save version safety boundary

# Dependencies

None. This is the first task to execute because it protects user data.

# Decisions

- Exclusive creation is the correctness boundary. PID, time, randomness or an
  atomic sequence may help generate candidates, but must not be the only proof
  that a path is unused.
- Keep concurrency per common Git directory. A global lock would hide the name
  allocation defect and unnecessarily serialize unrelated projects.

# Implementation notes

Complete during implementation.

# Validation

Run the complete `AGENTS.md` command set. Record the Windows regression test and
the three CI platform jobs explicitly.

