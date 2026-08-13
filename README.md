# GitOdrile

> **Git without the bite.** A friendly desktop Git client built around user
> intent, clear consequences, and safe recovery paths.

GitOdrile is a pre-release, local-first Git client for Windows, macOS, and
Linux. It is designed for learners, AI-assisted builders, designers, writers,
and developers who want a calmer workflow without losing access to Git's
technical truth.

Current application version: **0.1.0**.

## What works today

- Open a local project from its root or any nested folder, validate it in Rust,
  and switch between recent projects.
- Restore the previous project session at startup and keep each open
  incarnation isolated with an opaque session epoch.
- Inspect the working tree in plain language, including staged, unstaged,
  untracked, deleted, renamed, conflicted, and ignored states.
- Review and copy readable, syntax-colored text diffs, inspect binary or
  oversized-file states, and navigate large change lists with virtualization
  and bounded native payloads.
- Discard one file or every unsaved change through a confirmed, state-checked
  flow that creates a persistent local recovery record and offers Undo.
- Receive live, debounced repository updates without exposing raw filesystem
  paths to the frontend.
- Save all or selected changes as a version with a title and description. The
  flow is planned and revalidated in Rust, preserves Git hooks and signing, and
  protects the real index through a collision-safe temporary-index workflow.
- Discover remotes and publish saved versions through a previewed,
  state-token-validated flow that reports uncertain remote outcomes honestly.
- List, create, switch, and safely delete version lines (local branches), with
  dirty-worktree checks and recovery references where required.
- Configure light/dark/system themes, English/Spanish copy, Git identity,
  installation diagnostics, and supported Git update guidance.
- Navigate through a command palette, keyboard-accessible dialogs, and a
  keep-alive screen shell that retains screen state while suspending hidden
  work.

Not yet implemented: cloning, getting/integrating team changes, the history
timeline, the recovery center, and guided conflict resolution. The approved
work is tracked in [`work/active/`](work/active/) and future direction in the
[`roadmap`](docs/ROADMAP.md).

## Architecture at a glance

```text
React feature UI
  -> feature controller and typed port
    -> feature-owned Tauri adapter
      -> thin Rust IPC adapter
        -> application policy + repository authorization
          -> product domain
            -> bounded Git/process/filesystem adapters
```

The frontend is a modular monolith. Product features live under
`src/features/<feature>/` and own their UI, controller, domain types, port,
Tauri adapter, translations, styles, and tests. `src/main.tsx` is the
composition root for cross-feature orchestration; reusable shell UI and
preferences live under `src/app/`. Screens are declared once in
`src/screens.tsx` and consume a project-scoped runtime rather than fetching
when they become visible.

Rust keeps transport, policy, coordination, domains, and infrastructure
separate:

- `ipc.rs` adapts Tauri arguments and responses;
- `application.rs` assigns one checked execution policy to every command;
- `repository_access.rs` coordinates concurrent reads and exclusive mutations
  by common Git directory;
- `repository.rs`, `status.rs`, `changes.rs`, `save_version.rs`, `publish.rs`,
  and `version_lines.rs` own product behavior;
- `operation.rs` owns shared mutation classification and bounded/redacted
  diagnostic details;
- `index.rs` owns collision-safe temporary-index preparation shared by safe
  mutations;
- `git_command.rs` binds application policy to the bounded runner in `git.rs`;
- `tooling.rs`, `watch.rs`, and `desktop.rs` own system-Git settings, repository
  invalidation, and desktop-shell services;
- the production body of `lib.rs` only registers modules, plugins, state, and
  IPC handlers; integration tests are grouped by domain under
  `src-tauri/src/tests/` with shared hermetic fixtures in `test_support.rs`.

The architecture is enforced by dependency analysis, seeded negative fixtures,
Rust syntax-based boundary tests, and a checked JSON IPC contract. Read the
[`architecture guide`](docs/ARCHITECTURE.md) before changing module ownership.

## Technology versions

The lockfiles are authoritative. This is the current resolved development
snapshot:

| Layer | Version |
| --- | --- |
| Node.js | `>=24` |
| pnpm | `pnpm@11.17.0` |
| Rust | stable (`rust-toolchain.toml`) |
| Tauri runtime / CLI | `2.11.5` / `2.11.4` |
| React / React DOM | `19.2.8` |
| TypeScript | `6.0.3` (intentionally pinned; see ADR 0005) |
| Vite / Vitest | `8.1.5` / `4.1.10` |
| TanStack Virtual | `3.14.8` |
| notify | `8.2.0` |

GitOdrile uses the system Git executable. Git **2.23 or newer** is required for
version-line switching; diagnostics remain available when Git is missing or
unusable.

## Requirements

All platforms need Node.js 24+, Corepack/pnpm 11.17.0, Rust stable with
`rustfmt` and `clippy`, and system Git.

Tauri also requires platform build dependencies:

- Windows: Microsoft C++ Build Tools with **Desktop development with C++**, and
  WebView2 Runtime.
- macOS: Xcode Command Line Tools.
- Linux: WebKitGTK 4.1 and the distribution packages listed in the
  [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Development

Install reproducibly:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Run the desktop app:

```bash
pnpm run tauri dev
```

Run only the Vite frontend at `http://localhost:1420`:

```bash
pnpm run dev
```

Run the complete repository harness:

```bash
pnpm run check
```

The aggregate check validates Markdown links/task metadata, frontend dependency
rules, TypeScript, 256 frontend tests, the production build, Rust formatting,
Clippy with warnings denied, and 202 Rust tests. Individual commands remain
available as `check:docs`, `check:architecture`, `check:frontend`, and
`check:rust`.

Create an unsigned local desktop bundle with:

```bash
pnpm run tauri -- build
```

CI runs frontend checks on Linux and Rust checks on Windows, macOS, and Linux.
It also release-compiles the desktop executable on macOS and Linux. Real
WKWebView/WebKitGTK runtime, accessibility, memory, signing, and packaging
validation are still release-hardening gates documented in
[`ADR 0006`](docs/adr/0006-defer-macos-and-linux-runtime-validation.md).

## Documentation map

Each durable document has one owner to limit duplication:

- [`AGENTS.md`](AGENTS.md): executable engineering and safety rules.
- [`docs/PRODUCT_STRATEGY.md`](docs/PRODUCT_STRATEGY.md): product thesis,
  audience, positioning, and competitive context.
- [`DESIGN.md`](DESIGN.md): visual, interaction, content, and accessibility
  direction.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): current architecture and
  extension rules.
- [`docs/adr/`](docs/adr/): accepted, proposed, or superseded decisions and
  their rationale.
- [`work/`](work/): active work and historical execution notes; it is not the
  source of durable architecture.
- [`PRODUCT.md`](PRODUCT.md): compact machine-readable product brief used by
  design tooling; the product strategy remains authoritative.

Numbered files under `docs/architecture/` are evidence and historical
baselines. They should not duplicate the current-state guide.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before making changes and
[`SECURITY.md`](SECURITY.md) for vulnerability reporting.

## License

MIT. See [`LICENSE`](LICENSE).
