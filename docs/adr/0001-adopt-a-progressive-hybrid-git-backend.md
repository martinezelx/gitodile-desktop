# ADR 0001: Adopt a progressive hybrid Git backend

- Status: proposed
- Date: 2026-07-24

## Context

GitOdrile currently uses the system `git` executable for repository inspection
and configuration. This provides mature compatibility with repositories,
credentials, hooks, signing, filters, Git LFS, transports, and platform-specific
Git installations, but it makes the application dependent on Git being
installed and available on `PATH`.

Task 004 added a safe, platform-aware installation path for users without Git.
That remains useful, but requiring an external installation before any local
workflow can function weakens the intended beginner-friendly experience.

There are four broad implementation strategies:

1. Continue relying exclusively on the system Git executable.
2. Bundle a private Git executable with GitOdrile.
3. Embed an existing Git implementation such as `gitoxide`/`gix` or `libgit2`.
4. Implement Git storage, worktree, merge, transport, and compatibility
   behavior ourselves.

Git does not provide a single official embeddable library equivalent to its
command-line reference implementation. `libgit2` and `gitoxide` are independent
implementations of Git formats and behavior.

GitButler is a useful reference, but not an example of a fully independent Git
reimplementation. Its current Rust workspace uses both `gix` and `git2`
(`libgit2`), adds its own higher-level workflow engine, and can still use the
system Git executable for selected authentication and compatibility paths.

## Decision

Propose a progressive hybrid backend rather than immediately replacing or
bundling Git:

- Keep the system Git implementation as the stable and compatibility-oriented
  backend.
- Preserve typed Rust-to-frontend contracts so the UI never depends on which
  backend produced a result.
- Introduce a backend boundary only when a second real implementation is added;
  do not create unused abstractions in advance.
- Evaluate `gitoxide` first for local, read-only operations:
  - repository discovery and validation;
  - worktree, Git directory, common directory, and HEAD identification;
  - status and changed-file discovery;
  - history, references, and diffs.
- Initially retain system Git for operations with broader compatibility risk:
  - fetch, push, and authentication;
  - credential helpers and SSH configuration;
  - hooks;
  - commit and tag signing;
  - filters, Git LFS, and external tools;
  - any repository state not yet supported reliably by the embedded backend.
- Allow capability-based fallback. GitOdrile should explain which feature needs
  external Git instead of treating the whole application as unusable.
- Do not build a Git implementation from scratch.
- Do not bundle a private Git executable unless a later ADR demonstrates that
  it provides a better compatibility, security-update, licensing, packaging,
  and installer-size trade-off than the hybrid library approach.

This proposal must not be marked accepted until a bounded technical experiment
demonstrates that an embedded backend can reproduce GitOdrile's existing
repository-opening contract without invoking `git`.

## Validation experiment

Create a separate task before implementation with the following limits:

- Add `gitoxide`/`gix` behind an experimental Rust module.
- Given an existing path, return the same typed repository information currently
  returned by `open_repository`: selected path, worktree root, Git directory,
  common Git directory, repository/worktree kind, branch, and
  branch/unborn/detached HEAD state.
- Cover normal repositories, nested paths, linked worktrees, bare repositories,
  unborn branches, detached HEAD, missing paths, and non-repositories.
- Run the experiment with the system Git executable unavailable to the
  GitOdrile process.
- Compare behavior, error quality, binary-size impact, build complexity, and
  cross-platform implications.
- Do not migrate production commands or remove the system Git path as part of
  the experiment.

If the experiment succeeds, add a follow-up ADR accepting the hybrid backend or
change this ADR to accepted before migrating the first production read-only
operation.

## Consequences

### Positive

- GitOdrile can progressively support useful local workflows without requiring
  a separate Git installation.
- The existing, proven system Git integration remains available as a fallback.
- Migration risk is limited to one typed operation at a time.
- Rust-native repository access can improve structured errors, cancellation,
  performance, and control over process execution.
- Task 004 remains valuable for features that still require external Git.

### Negative

- Two backends create a compatibility matrix and require parity tests.
- Repository locking, configuration precedence, path handling, and concurrent
  access must be defined carefully.
- `gitoxide` support may not initially cover every feature or Git extension that
  users expect.
- Binary size and build time will increase.
- Bugs caused by different backend interpretations may be difficult to
  reproduce.

### Constraints

- Backend choice must remain inside Rust application services, never in React
  components.
- A fallback must not silently change the safety or consequences of an
  operation.
- Mutating operations require stronger parity and recovery evidence than
  read-only operations.
- Git hooks, signing, filters, credentials, and remote operations must not be
  bypassed merely to remove the external dependency.

## Alternatives considered

### Continue with system Git only

This remains the lowest-risk short-term implementation and the initial strategy
defined in `AGENTS.md`. It does not meet the longer-term goal of useful
operation without a separate installation, so it remains a backend rather than
the only planned backend.

### Bundle Git with GitOdrile

This would provide high command-line compatibility without relying on the
user's installation. It also makes GitOdrile responsible for platform-specific
binary distribution, security updates, licensing notices, installer size,
credential helpers, SSH tooling, and deciding when to prefer user configuration
over bundled components. Keep it as a later option, not the first experiment.

### Replace system Git with `libgit2`

`libgit2` is mature and widely used, but it introduces a native C dependency and
still has compatibility differences from command-line Git. It remains a valid
comparison point if `gitoxide` cannot meet the experiment, but a Rust-native
implementation fits GitOdrile's backend and build direction better.

### Implement a custom Git engine

Rejected. Reimplementing object storage, indexes, worktrees, configuration,
merges, protocols, credentials, hooks, signing, filters, and compatibility
behavior would consume the project without creating corresponding user value.
