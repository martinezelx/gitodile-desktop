# AGENTS.md

This file is the primary operating guide for AI coding agents working on GitOdrile.

Read [`docs/PRODUCT_STRATEGY.md`](docs/PRODUCT_STRATEGY.md) for the durable
product thesis, audience, positioning, and competitive context. Keep this file
focused on rules agents can apply while making changes.

## Mission

Build a cross-platform desktop Git client that makes version control understandable and safe for beginners, non-developers, students, AI-assisted builders, designers, and developers who prefer a calmer workflow.

GitOdrile must not merely map Git commands to buttons. It should translate user intent into safe Git operations.

Examples:

- “Save a version” may create a commit.
- “Publish changes” may push the current branch.
- “Get team changes” may fetch and integrate remote changes.
- “Try this separately” may create a branch.
- “Go back to this moment” may use revert, reset, checkout, or a recovery branch depending on context.

The UI should explain what will happen and preserve a recovery path whenever reasonably possible.

## Product positioning

Working name: **GitOdrile**

Working promise: **Git without the bite.**

Alternative description: **A friendly Git desktop client.**

The crocodile mascot should feel confident and friendly, not childish. Branding may use small moments of personality, but the product must remain credible for professional work.

## Target users

Primary:

- People who write or modify software without understanding Git deeply.
- AI-assisted builders using tools such as coding agents and app generators.
- Junior developers and students.
- Designers, writers, game developers, and other collaborators working inside repositories.

Secondary:

- Experienced developers who want a fast, focused desktop Git client.
- Small teams that value safe workflows and simple onboarding.

## Core product principles

1. **Use human language by default.**
   Do not lead with commit, rebase, detached HEAD, reflog, upstream, or fast-forward unless advanced mode is enabled or the term is necessary.

2. **Never hide consequences.**
   Simplify terminology, but clearly explain whether an action changes local files, history, a remote repository, or teammates' work.

3. **Safety before cleverness.**
   Before destructive or history-rewriting operations, create or offer a recovery point. Never run a destructive command merely because it produces a cleaner implementation.

4. **Progressive disclosure.**
   The default interface should be approachable. Advanced users must still be able to inspect exact branches, commits, remotes, and commands.

5. **Local-first and privacy-conscious.**
   Repository data stays local unless the user explicitly invokes a remote or cloud feature. AI features must be optional and transparent about transmitted data.

6. **Cross-platform behavior is part of correctness.**
   Handle paths, line endings, credentials, symlinks, filesystem casing, file locks, and process behavior across Windows, macOS, and Linux.

7. **Performance matters, but UX matters more.**
   Rust and Tauri are implementation choices, not the customer-facing value proposition.

## Technical direction

### Frontend

- React + TypeScript + Vite.
- Functional components and hooks.
- Keep domain logic out of visual components.
- Prefer accessible primitives and semantic HTML.
- Use CSS variables as design tokens.
- Avoid a large UI framework until the interaction model stabilizes.
- Register every screen in `src/screens.tsx`. Navigation, the command palette,
  idle chunk prefetching, the open-project guard, and keep-alive mounting all
  derive from that table; a screen wired up by hand will silently miss them.
  See "Screen shell and navigation cost" in `docs/ARCHITECTURE.md`.
- Follow `docs/architecture/frontend-feature-guide.md`: feature-owned screen
  descriptors use the neutral runtime/lifecycle contracts, and hidden screens
  must suspend polling, costly effects, subscriptions, and announcements.
- Never fetch merely because a screen became visible. Render the cached
  snapshot; refresh on project activation or an explicit repository
  invalidation, idle-deferred where it is speculative.
- Visual components do not call `invoke`. A feature reaches Rust through its own
  typed port and `tauriAdapter.ts`. The only direct calls left in `main.tsx` are
  watcher and session lifecycle wiring, which the composition root owns.
- `main.tsx` is the app composition root and renders no screen body. Overview
  owns an eager feature container; the other functional screens own lazy
  containers, and the screen contract has no `host-owned` escape hatch. A new
  screen owns its own container; see the measured footprint table in
  `docs/architecture/frontend-feature-guide.md` §8 before starting one.
- Overlay panels are eager. `React.lazy` attaches to its loader on first
  render, so a warmed module still suspends for a tick, and an overlay opens
  from a click with no navigation to mask that fallback frame. Code-split an
  overlay only against a measured entry-chunk problem, never for tidiness.
- Lists that can grow with repository size must stay virtualized. Rust caps the
  working-tree payload at 1,000 entries and the DOM budget is 400 rendered rows,
  so a cap is not a substitute for virtualization.

### Desktop shell

- Tauri 2.
- Use narrow commands between frontend and Rust.
- Validate all command inputs in Rust.
- Keep Tauri capabilities minimal and explicit.
- Keep the production body of `src-tauri/src/lib.rs` registration-only. It may declare modules,
  configure plugins/state, register handlers, and start Tauri; workflows belong
  to their owning module.
- `ipc.rs` is a transport adapter. It names the modules it adapts, performs
  session/transport validation, and delegates immediately; never restore a
  `use crate::*` facade.
- `git_command.rs` is the policy-aware facade over the bounded process runner
  in `git.rs`. System-Git settings belong in `tooling.rs`, watcher orchestration
  in `watch.rs`, desktop-shell services in `desktop.rs`, shared mutation
  vocabulary in `operation.rs`, and temporary-index preparation in `index.rs`.

### Git integration

Initial strategy:

- Use the system Git executable.
- Detect and report the installed Git version.
- Execute Git through a dedicated Rust service.
- Use machine-readable output where available.
- Set locale/environment explicitly where output parsing depends on it.
- Never construct shell strings from user input; pass arguments as separate process arguments.

Longer-term options may include `gitoxide`, `git2-rs`, or a hybrid implementation. Do not migrate away from system Git without an ADR explaining compatibility, credential, performance, and maintenance trade-offs.

### External references

GitButler is the primary product and engineering reference for complex desktop
Git problems, not a specification for GitOdrile. When a task involves repository
watching, asynchronous work, conflicts, recovery, large repositories, packaging,
updates, or Tauri/Rust boundaries:

1. Define the concrete GitOdrile problem first.
2. Study the smallest relevant part of GitButler's public implementation.
3. Identify the reason for its design and extract the reusable principle.
4. Implement the smallest independent solution appropriate for GitOdrile.

Do not copy its monorepo structure, advanced workflow model, source code, visual
assets, branding, or product language. Check applicable licenses before adapting
any protected material, and record significant architectural conclusions in an
ADR.

### Architecture boundaries

Keep these concerns separated:

- `repository`: repository discovery and metadata.
- `status`: working tree and index state.
- `history`: commits, branches, tags, and timeline.
- `changes`: file changes and diffs.
- `sync`: remotes, fetch, pull/integration, and push.
- `recovery`: snapshots, safety branches, restore operations, and reflog-backed recovery.
- `conflicts`: conflict detection and resolution.
- `platform`: OS-specific behavior.
- `credentials`: authentication and secret storage integration.

See `docs/ARCHITECTURE.md`.

## UX vocabulary

Default simple-mode wording:

| Git concept | Default user-facing wording |
| --- | --- |
| repository | project |
| commit | saved version |
| commit changes | save version |
| push | publish changes |
| fetch/pull | get team changes |
| branch | separate workspace / version line |
| checkout/switch | switch workspace |
| merge conflict | overlapping changes |
| clean working tree | everything is saved |
| ahead of remote | saved locally, not published |
| behind remote | newer team changes are available |
| stash | set changes aside |

This table is guidance, not a rigid translation layer. Use exact Git terminology in advanced views and educational explanations.

## Safety rules for Git operations

Agents must follow these rules when implementing operations:

- Classify each operation as read-only, local mutation, history mutation, remote mutation, or destructive.
- Provide a preview/plan for history-changing and remote-changing actions.
- Prefer reversible operations.
- Create a recovery reference before destructive changes when feasible.
- Never use `reset --hard`, `clean -fd`, force push, branch deletion, or equivalent behavior without explicit user confirmation and a recovery strategy.
- Do not silently resolve conflicts.
- Do not silently discard untracked files.
- Surface hooks and signing failures accurately; do not bypass them by default.
- Preserve user Git configuration unless a setting is explicitly scoped to GitOdrile.

## UI and visual direction

Read `DESIGN.md` before changing visual styles.

In summary:

- Modern desktop interface with rounded surfaces and restrained translucency.
- Dense information areas such as diffs must use solid, highly readable backgrounds.
- Support light and dark themes.
- Use motion sparingly and respect reduced-motion settings.
- Aim for professional friendliness, not cartoon-heavy gamification.

## Development conventions

- Work directly on `main`. Do not create feature branches or worktrees for routine changes; only branch when the user explicitly asks for one (e.g. to isolate a risky or long-running experiment).
- Never add `Co-Authored-By` (or similar AI-attribution) trailers to commit messages.
- TypeScript strict mode must stay enabled.
- Rust code must pass `cargo fmt` and `cargo clippy`.
- Avoid `any` unless interacting with an untyped boundary and document why.
- Return structured errors from Rust; do not expose raw command output as the primary error message.
- Add unit tests for parsers and operation planners.
- Add integration tests around temporary Git repositories.
- Keep commits focused and use conventional commit prefixes where practical.
- Update documentation when behavior, architecture, or vocabulary changes.

## Documentation ownership

Keep durable facts in one place and link to them instead of copying them:

- `README.md`: current capabilities, versions, setup, commands, and orientation.
- `AGENTS.md`: enforceable engineering, safety, and agent-workflow rules.
- `docs/PRODUCT_STRATEGY.md`: durable product thesis and positioning.
- `DESIGN.md`: visual, interaction, content, and accessibility direction.
- `docs/ARCHITECTURE.md`: current architecture and extension rules.
- `docs/adr/`: decision rationale and alternatives.
- `work/`: approved scope and execution history, never the sole home of a
  durable architecture rule.

`PRODUCT.md` is a compact design-tooling brief; do not expand it into a second
product strategy. Numbered files under `docs/architecture/` are historical
evidence or measurement baselines and must identify themselves as such.

When moving a task, keep its relative links valid. Task IDs are unique and
permanent; a child may use its parent's ID plus a suffix such as `010-1`.
Files in `work/done/` require `status: done` and a completion date.

## Agent workflow

Before coding:

1. Read `README.md`, this file, `DESIGN.md`,
   `docs/PRODUCT_STRATEGY.md`, and relevant files under `docs/`.
2. Inspect the existing implementation before proposing architectural changes.
3. Identify platform-specific implications.
4. State assumptions in the PR or commit description.

While coding:

1. Make the smallest coherent change.
2. Preserve safety boundaries.
3. Add or update tests.
4. Check keyboard accessibility and empty/error/loading states.
5. Avoid introducing dependencies for trivial utilities.

Before finishing:

```bash
pnpm run check
```

The aggregate command runs documentation, frontend architecture, TypeScript,
frontend tests/build, Rust formatting, Clippy, and Rust tests. Use the narrower
`check:docs`, `check:architecture`, `check:frontend`, or `check:rust` scripts
while iterating, but the aggregate command is the completion gate.

If a command is not available yet, document that honestly rather than claiming it passed.

## Early priorities

1. Repository opening and validation.
2. A structured Rust Git command runner.
3. Status parsing with fixtures and tests.
4. The main application shell and repository overview.
5. Plain-language status summaries.
6. Safe save-version flow.
7. Fetch/publish flows.
8. Recovery model.
9. Conflict experience.

## Out of scope for the first MVP

- Interactive rebase.
- Submodule management.
- Full pull-request review suite.
- Built-in terminal.
- Enterprise administration.
- Custom Git hosting server.
- Complex multi-repository workspaces.
- Mandatory cloud accounts.
- Autonomous AI changes to repositories.

## Decision records

For significant architectural decisions, add an ADR under `docs/adr/` using:

- Context
- Decision
- Consequences
- Alternatives considered

Do not overwrite major decisions silently.
