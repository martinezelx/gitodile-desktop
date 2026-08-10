---
id: 039
title: Make a Git call without an execution policy fail instead of degrading
status: active
priority: high
type: chore
areas:
  - rust
  - architecture
  - security
created: 2026-08-10
completed:
---

# Goal

Remove the silent fallback that hands an unregistered Git call a repository-read
execution policy, so a missing command frame is a loud failure in production.

# User outcome

No visible change. This protects the guarantee every other safety behavior rests
on: that no Git process runs outside the coordinator that serializes related
worktrees and enforces caps, timeouts and prompt policy.

# Context

`run_git_with_env`, `run_global_git_with_env` and `run_git_capped` in
`src-tauri/src/lib.rs` each do:

```rust
let policy = application::current_policy()
    .unwrap_or_else(|| git::ExecutionPolicy::repository_read("compatibility_git_read"));
```

That `unwrap_or_else` was strangler scaffolding from task 024, when domain
workflows still lived in `lib.rs` and had not all been routed through
`application::enter` or `authorize_repository`. The migration is finished:
every production entry point now enters a frame, verified by reading all 31
`ipc::` adapters and the six `application::enter` call sites for global
commands.

The fallback is now a trap. A future Git call added without a frame does not
fail — it silently receives `ConcurrencyClass::RepositoryRead`, a 60-second
timeout and disabled prompts, and it never acquires a repository permit. It
would bypass the commonGitDir coordinator entirely, which is exactly the
boundary epic 022 existed to build.

This matters concretely. Task 031 fixed a defect where a nested authorized read
cancelled its peer and broke every repository. That bug was *visible* because
the cancellation surfaced as an error. A missing execution policy would not
surface at all until two worktrees corrupted each other's index.

**The fallback is not dead code.** 28 `run_git` calls inside `lib.rs`'s own test
module run outside any command frame — test assertions like reading `HEAD` or
`git ls-files` to verify what a workflow did. They currently work because of the
fallback. Deleting it without replacing that path breaks the Rust suite.

# Scope

- Add a test-only Git helper that enters an explicit policy frame, and move
  `lib.rs`'s test-side `run_git` assertion calls onto it. Keep it
  `#[cfg(test)]` so it cannot be reached from production.
- Replace the three `unwrap_or_else` fallbacks with a hard failure. Prefer a
  structured `AppError` over a panic so a mistake degrades to a reported error
  rather than a crashed command, and assert loudly in debug builds.
- Remove the `compatibility_git_read`, `compatibility_global_git` and
  `compatibility_capped_git_read` policy names.
- Add a test proving a Git call without a frame fails.
- Check `changes.rs`, `publish.rs`, `repository.rs`, `save_version.rs`,
  `status.rs` and `version_lines.rs` test modules for the same pattern; they
  hold 63 further `run_git` call sites between them, and some are inside
  workflows that do enter a frame.

# Out of scope

- Changing any execution policy's caps, timeouts, prompt policy or concurrency
  class.
- Moving the Git runner out of `lib.rs` into a `git/` directory. That is a
  separate structural decision and `architecture.rs` already keeps domain code
  out.

# Acceptance criteria

- [ ] No production code path can start a Git process without an execution
      policy from the registered inventory.
- [ ] A test proves the failure is reported rather than silently downgraded.
- [ ] The three `compatibility_*` policy names no longer exist.
- [ ] Test-side Git assertions run under an explicit test-only frame.
- [ ] Full `AGENTS.md` validation passes, including all 196 existing Rust tests.

# Relevant files

- `src-tauri/src/lib.rs` (lines 62–130 and its test module)
- `src-tauri/src/application.rs`
- `src-tauri/src/git.rs`
- `docs/ARCHITECTURE.md`, "Rust execution and repository access boundary"

# Dependencies

None.

# Decisions

- Prefer a structured error to a panic: a wrong policy is a programming error,
  but crashing a user's session is worse than reporting a failed command.

# Implementation notes

Complete during implementation.

# Validation

Run the complete `AGENTS.md` command set.
