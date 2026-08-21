---
id: 064-2
title: Set all or selected changes aside safely
status: active
priority: high
type: feature
areas:
  - changes
  - rust
  - frontend
  - recovery
created: 2026-08-18
completed:
parent: "064"
queue: "14"
---

# Goal

Implement the epic's previewed and verified all/selected create workflow while
preserving ignored files, unrelated paths, and exact prepared/index intent.

# User outcome

The user can temporarily clear current work without committing it and trust
that the intended content is present in a standard saved set.

# Context

This is slice 2 of epic 064 and the first stash mutation.

# Scope

- Implement all/selected planning, ignored-descendant proof, state token,
  confirmation, exclusive execution, and post-create verification.
- Preserve rename source/destination, staged/unstaged/untracked intent, ignored
  content, unrelated paths, HEAD, remotes, and user configuration.
- Return stale, blocked, failure, and uncertain outcomes using epic semantics.
- Refresh status, diffs, stash pages, and linked sessions once coherently.

# Out of scope

- Restore, removal, automatic stashing, ignored-file stashing, or partial hunks.

# Acceptance criteria

- [ ] All and selected scopes bind the complete authoritative status, never UI
      search/virtual rows or a truncated payload.
- [ ] Exact index/worktree content is preserved in the new standard stash and
      ignored/unrelated content remains byte-for-byte unchanged.
- [ ] Unsupported/conflicted/unborn/sparse/submodule/in-progress and ambiguous
      ignored-descendant states block before mutation.
- [ ] Stale, interrupted, partial, and uncertain outcomes preserve evidence and
      never claim a clean result without verification.
- [ ] Rust/frontend/restart/linked-worktree/accessibility tests pass.

# Relevant files

- `work/active/064-set-changes-aside-safely.md`
- `work/active/stashes/064-1-discover-saved-sets.md`
- `src-tauri/src/recovery.rs`
- `src-tauri/src/index.rs`

# Dependencies

Task 064-1.

# Decisions

Never use `--all` and never auto-stash from another operation.

# Implementation notes

Record ignored-content proof, pathspec strategy, token inputs, and verification.

# Validation

Record fixture matrix, byte/index assertions, failure injection, and checks.
