# Architecture

## Overview

GitOdrile uses a web frontend inside a Tauri desktop shell, with Rust responsible for filesystem access, process execution, Git operations, platform integration, and security-sensitive behavior.

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

## Proposed Rust modules

```text
src-tauri/src/
  app/
  git/
    command_runner.rs
    repository.rs
    status.rs
    diff.rs
    history.rs
    branches.rs
    remotes.rs
  operations/
    save_version.rs
    publish.rs
    update.rs
    restore.rs
  recovery/
  credentials/
  platform/
  errors.rs
```

The current scaffold is smaller. Introduce modules as real behavior appears; do not create empty abstractions solely to match this diagram.

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
the target architecture for GitOdrile's MVP.

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

Candidate categories:

- application preferences;
- recent repositories;
- per-repository UI state;
- live repository snapshot;
- in-progress operation state;
- diagnostics.

Avoid making Git state writable from arbitrary frontend components.

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
- state management library;
- credential storage strategy;
- update mechanism;
- AI provider architecture;
- WSL repository support;
- telemetry policy;
- plugin/extension model.
