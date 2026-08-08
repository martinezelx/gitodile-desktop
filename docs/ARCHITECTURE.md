# Architecture

## Overview

GitOdrile uses a web frontend inside a Tauri desktop shell, with Rust responsible for filesystem access, process execution, Git operations, platform integration, and security-sensitive behavior.

The accepted migration design is [ADR 0003](adr/0003-adopt-a-modular-feature-architecture.md).
Its measured starting point, current dependency graph and external-reference
record live under [`architecture/`](architecture/023-performance-baseline.md).

```text
React UI
  -> typed frontend service layer
    -> typed Tauri commands
      -> thin Tauri adapters
        -> Rust application and domain services
          -> Git process adapter / filesystem / OS integration
```

## Architectural objectives

- Keep UI state independent from raw Git command output.
- Make Git operations testable without rendering the UI.
- Keep system Git replaceable behind a stable domain boundary.
- Model operations around intent and consequences.
- Make platform differences explicit.
- Prevent arbitrary shell execution from the frontend.

## Accepted module boundaries

The frontend is a modular monolith organized by product feature:

```text
src/
  app/                    # bootstrap, shell, screen registry and wiring
  features/               # repository, status, changes, version-lines,
                          # save-version, publish and later product domains
  platform/tauri/         # typed invoke/listen adapters
  shared/ui/              # stable primitives with multiple real consumers
  shared/i18n/            # translation runtime and shared plumbing
```

Each feature exposes an explicit `index.ts`. Visual components receive values
and callbacks; they do not invoke Tauri. Features do not import `app/` or
another feature's internals. Product-domain types stay with their owner rather
than moving to a generic shared-types directory.

The corresponding Rust target is:

```text
src-tauri/src/
  lib.rs                  # builder and command registration only
  ipc/                    # validation and Tauri serialization adapters
  application/            # product-domain use cases
  repository_access/      # authorization and commonGitDir scheduling
  git/                    # bounded process runner and Git adapter
  watch/                  # filesystem adapter and typed invalidations
  platform/               # OS-specific adapters
  error.rs                # stable application error contract
```

Introduce these boundaries incrementally as tasks 024-030 move real behavior;
do not create empty abstractions solely to match the diagram. IPC stays thin,
application modules own product decisions, and infrastructure never imports
IPC. The complete dependency matrix and migration order are normative in ADR
0003; significant deviations require another ADR.

Dependency direction will be executable in CI: a pinned
`dependency-cruiser` configuration will classify frontend runtime, type-only,
dynamic and test edges, while a repository-owned Rust architecture test will
parse module/import declarations with `syn`. Compiler privacy still protects
module internals. These development-only guards land with the modules they can
meaningfully enforce, not as runtime dependencies.

## Operation planning

User actions should first produce an operation plan.

```ts
type OperationPlan = {
  kind:
    | "read"
    | "local-mutation"
    | "history-mutation"
    | "remote-mutation"
    | "destructive";
  summary: string;
  steps: OperationStep[];
  risks: Risk[];
  recovery?: RecoveryPlan;
  requiresConfirmation: boolean;
};
```

The frontend may render a friendly explanation from this structure. Rust remains responsible for validating the repository state immediately before execution.

`destructive` is an additional risk classification, not permission to discard
data. A destructive plan requires explicit confirmation and a recovery strategy
when one is feasible. History and remote mutations may also require confirmation
even when they are not destructive.

## Git command runner

The initial adapter should:

- receive a repository path and an argument list;
- invoke `git` without a shell;
- set the working directory explicitly;
- capture stdout, stderr, and exit code;
- support cancellation and timeouts where appropriate;
- redact credentials and secrets from logs;
- return typed errors;
- record diagnostics at a safe verbosity level.

Prefer stable machine-readable formats such as porcelain output. Parsing must have fixtures covering Git versions and edge cases.

System Git remains the initial and compatibility-oriented backend. The proposed
hybrid direction is documented separately in
[`adr/0001-adopt-a-progressive-hybrid-git-backend.md`](adr/0001-adopt-a-progressive-hybrid-git-backend.md);
do not treat that proposal as an accepted migration.

## Engineering references

For complex desktop Git behavior, GitButler may be studied as an engineering
reference using the process in [`../AGENTS.md`](../AGENTS.md): start from a
specific GitOdrile problem, understand the reason behind the relevant pattern,
and reimplement only the smallest appropriate principle. Its mature monorepo,
workflow abstractions, cloud services, and accumulated crate structure are not
the target architecture for GitOdrile's MVP. The pinned revision, inspected
files and FSL-1.1-MIT no-copy constraint for this migration are recorded in
[`architecture/023-gitbutler-research.md`](architecture/023-gitbutler-research.md).

## Repository identity

Do not assume the selected folder is the repository root. Resolve and retain:

- worktree root;
- Git directory;
- common Git directory for worktrees;
- bare/non-bare state;
- current branch or detached state;
- remotes;
- case-sensitivity and filesystem capabilities where relevant.

## State management

Keep persistent application preferences separate from repository-derived state.

Each open project owns an immutable reducer-backed runtime with a distinct
session epoch and selector subscriptions through `useSyncExternalStore`. The
canonical path identifies the worktree, not an open incarnation: responses and
watcher events must match the epoch created for that open/reopen. Feature
controllers expose narrow commands and selectors; arbitrary visual components
cannot write Git-derived state.

State categories remain explicit:

- application preferences;
- recent repositories;
- per-repository UI state;
- live repository snapshot;
- in-progress operation state;
- diagnostics.

No state library is introduced for this migration. Redux, Zustand, XState and
React Query were evaluated in ADR 0003 and do not currently justify their
runtime/conceptual cost. A future need for cache semantics, statecharts or
devtools must be measured and recorded before revisiting that decision.

## Screen shell and navigation cost

Moving between screens of an already-open project must cost nothing the user
can perceive. That is a property of the shell, not something each screen earns
for itself, and it rests on four rules.

**One registry.** `src/screens.tsx` holds every navigation destination: its
label, icon, section, whether it needs an open project, its command-palette
entry, and the chunks it needs. The expanded nav, the compact nav, the palette,
the idle prefetch, the "leave this screen if the project closed" guard, and the
keep-alive host all read from that table. A screen is added by adding an entry
and a component; anything wired up by hand will be missed by one of them.
Destinations that are announced but unbuilt (History, Recovery) live in the
same table with `screen: null`.

**Visited screens stay mounted.** `KeepAliveScreens` mounts a screen the first
time it is opened and thereafter hides it rather than unmounting it, so
returning avoids a React/DOM rebuild and in-screen state (scroll position,
selection, filters) survives. Inactive screens are `hidden` and `inert`: out
of the tab order, out of the accessibility tree, unable to announce anything
from behind the visible screen. They are also frozen — their last element is
re-rendered by identity, so an unrelated state change in `App` cannot
reconcile a screen nobody is looking at; they take current props on the frame
they become active again. Browsers may still redo style, layout, or paint when
revealing a `display: none` subtree, so keep-alive removes application work but
does not claim that CSS work is literally zero. Keep-alive is scoped to the
active project session by keying the host on it, so switching or closing a
project drops that session's screens.

**Screens render from state, never fetch on arrival.** Per-project repository
data belongs to `ProjectSession` and stays on screen while it is revalidated.
Freshness comes from project activation, explicit user refresh, successful
mutations, and repository-watch invalidation — not from making a screen
visible. Cached background reads do not publish loading state, and unchanged
snapshots preserve object and reducer-state identity. A screen showing a
spinner on a warm session is a bug.

**Blocking native work stays off the UI thread.** `requestIdleCallback` only
schedules when frontend code starts; it cannot make a synchronous Tauri
command non-blocking. Commands that launch Git or perform filesystem work use
Tauri's asynchronous command execution so the WebView remains responsive.
Read paths should batch related facts into as few Git processes and graph walks
as compatibility permits.

**Background work never precedes first paint.** Chunk prefetching and
speculative reads go through `requestIdleCallback` and are gated on the startup
session restore having finished.

Screen-switch profiling is opt-in because measurement itself adds work. Run
the development app with `VITE_PROFILE_SCREEN_SWITCHES=true` when collecting
navigation timings; normal development and production builds omit it.

The task-022 comparison protocol, exact starting chunks/process counts and
numeric warning/failure budgets are recorded in
[`architecture/023-performance-baseline.md`](architecture/023-performance-baseline.md).
Child tasks use the same fixture and build mode and must explain warnings;
crossing a failure budget blocks the task unless an ADR deliberately revises
the contract.

## Security model

- Minimize Tauri capabilities.
- Validate and canonicalize paths in Rust.
- Do not expose a generic “run command” Tauri endpoint.
- Do not interpolate user data into shell commands.
- Treat repository content, hooks, config, and remote responses as untrusted.
- Never log tokens, credential helper output, private key material, or authenticated remote URLs.
- Require explicit consent before sending source or diffs to an AI service.

## Testing strategy

### Unit tests

- status parser;
- branch/ref parser;
- diff metadata parser;
- operation planner;
- plain-language state mapping;
- path validation.

### Integration tests

Create temporary repositories for:

- clean repository;
- staged and unstaged changes;
- untracked and ignored files;
- initial repository with no commits;
- ahead/behind/diverged branches;
- detached HEAD;
- merge conflict;
- worktree;
- line-ending-only changes;
- non-ASCII paths and commit messages.

### UI tests

Focus on critical workflows and state rendering rather than brittle visual snapshots.

## Platform notes

### Windows

- WebView2;
- path prefixes and drive letters;
- file locks;
- CRLF configuration;
- Git for Windows and credential manager behavior;
- optional WSL repositories require a separate design decision.

### macOS

- WKWebView;
- Keychain and code signing/notarization;
- case-insensitive filesystems are common;
- application sandbox implications if pursuing the Mac App Store.

### Linux

- WebKitGTK;
- Secret Service availability varies;
- Wayland/X11 and compositor differences;
- packaging and dependency differences;
- solid visual fallbacks for unsupported native effects.

## Future decisions requiring ADRs

- system Git versus embedded Git implementation;
- a state management library if project-runtime measurements outgrow the
  accepted built-in approach;
- credential storage strategy;
- update mechanism;
- AI provider architecture;
- WSL repository support;
- telemetry policy;
- plugin/extension model.
