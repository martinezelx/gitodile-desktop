# GitOdile

> **Git without the bite.** A friendly desktop Git client built around user
> intent, clear consequences, and safe recovery paths.

GitOdile is a pre-release, local-first Git client for Windows, macOS, and
Linux. It is designed for learners, AI-assisted builders, designers, writers,
and developers who want a calmer workflow without losing access to Git's
technical truth.

Current development version: **0.2.0-preview.3**, **preview** channel.
This candidate has not been tagged or published yet.

Official repository: [martinezelx/project-gitodile](https://github.com/martinezelx/project-gitodile).

Public feedback: [martinezelx/gitodile-feedback](https://github.com/martinezelx/gitodile-feedback).
Use **More actions → Report an issue** to open an English or Spanish bug form
with the available app, system, WebView and Git versions. Reporting requires a
GitHub account. You review the public report before submitting it. Project
paths, code and remote URLs are not included. Browser launch failures offer
retry, copy link and a selectable address. Security reports use the tracker's
private vulnerability reporting channel.

Privacy and release trust are documented in the public
[privacy policy](docs/PRIVACY.md) and
[code-signing policy](docs/CODE_SIGNING_POLICY.md). GitOdile does not currently
offer a signed public preview download; the release gates below remain closed
until the real Windows and Linux qualification evidence exists.

The pre-release naming reset uses a new desktop identity and recovery namespace.
Previous-brand preferences and recovery records are not migrated or discovered;
existing data is left untouched. See [ADR 0009](docs/adr/0009-use-only-the-canonical-product-identity.md).

## What works today

- Open a local project from its root or any nested folder, validate it in Rust,
  and switch between recent projects.
- Clone an HTTPS, SSH, Git, file-URL, or local-path project through a previewed
  provider-neutral flow. GitOdile stages privately, verifies the worktree,
  publishes without replacement, and opens it through the normal session
  lifecycle; configured Git credential helpers and SSH setup remain in control.
- Create a named local project or turn an ordinary existing folder into one
  through a previewed, revalidated flow. Existing files are never replaced;
  README creation and the first saved version require explicit consent, and a
  provider-neutral remote URL can be connected through a separate preview.
- Restore the previous project session at startup and keep each open
  incarnation isolated with an opaque session epoch.
- Inspect the working tree in plain language, including staged, unstaged,
  untracked, deleted, renamed, conflicted, and ignored states.
- Review and copy readable, syntax-colored text diffs, inspect binary or
  oversized-file states, and navigate large change lists with virtualization
  and bounded native payloads.
- Discard one file or every unsaved change through a confirmed, state-checked
  flow that creates a persistent local recovery record and offers Undo. The
  confirmation can be turned off; the recovery record and Undo cannot.
- Bring discarded work back from a picker listing every stored recovery, not
  just the last one. A record the working tree has moved past stays listed and
  says why it cannot be applied, so a protected snapshot never reads as a lost
  one. A copy that is no longer wanted can be deleted from the same list, and
  says what goes with it before it does.
- Receive live, debounced repository updates without exposing raw filesystem
  paths to the frontend, or turn watching off — in which case Changes, History,
  and Lines disclose that their local snapshot may be out of date and offer a
  focused update.
- Save all or selected changes as a version with a title and description. The
  flow is planned and revalidated in Rust, preserves Git hooks and signing, and
  protects the real index through a collision-safe temporary-index workflow.
- Discover remotes and publish saved versions through a previewed,
  state-token-validated flow that reports uncertain remote outcomes honestly.
- Check the configured upstream for project changes without moving the current
  version line or files, manually or on an opt-in 15/30/60-minute cadence, with
  cached/fresh status and clear next steps.
- Review and get strictly newer upstream versions through a confirmed,
  fast-forward-only update. GitOdile blocks local work and path collisions,
  creates a verified durable recovery point first, and reports uncertain local
  outcomes without attempting an automatic repair.
- List, create, switch, rename, and safely delete version lines (local
  branches), with dirty-worktree checks and recovery references where required.
  A line is only called safe to delete when another local or remote-tracking
  reference already holds its saved work; a published line can have its remote
  copy removed with it, and the two halves are reported separately. The remote's
  own default line is never renamed or deleted.
- See one version line's recent saved versions, its saved-version count and
  where it stands against its remote, read on demand for the line you select
  rather than for every branch on every refresh.
- Browse the active version line as a bounded, read-only saved-version
  timeline. Inspect author/date/publication/ref metadata, changed files, and
  root/first-parent/merge diffs through the same typed renderer as Changes.
- Review a bounded, redacted record of this session's app commands, Git
  operations, and failures before reporting an issue; copy it, save it locally to attach, or
  continue to the public GitHub form. Nothing is retained between sessions.
- Check for GitOdile updates without opening a project from What's new, More
  actions, the command palette, or Settings. One shared controller mirrors the
  native lifecycle through download, signature verification, explicit
  install/restart consent, draft or active-work blockers, cancellation and
  observed-version confirmation. Background checks are off by default; the
  opt-in contacts GitHub at most once every 24 hours while the app is open and
  never downloads or installs automatically.
- Configure light/dark/system themes, reduced motion, English/Spanish copy,
  date and number formats, Git identity, installation diagnostics, supported
  Git update guidance, how diffs are read, and whether projects are watched
  and discards confirmed.
- Set the default version-line name for new projects (written to Git's own
  `init.defaultBranch`), choose how often project changes are checked
  automatically — from every minute to every day, or never — and decide whether
  GitOdile runs a project's Git hooks when it saves or publishes. Hooks run by
  default; turning them off is app-wide, writes nothing to any project, and the
  setting says plainly what stops running. When a hook rejects a save, its
  output is shown with a one-time way to save without running it.
- See and change what Git does to line endings in plain language, including
  when a project's own settings or `.gitattributes` override the global choice.
- Read what happened while you were elsewhere from a notification centre in the
  titlebar: project changes an automatic check found, checks that could not
  reach the remote, and versions you published. Everything stays inside the app
  — no operating-system notifications — and one switch in Settings turns the
  recording off.
- Navigate through a command palette, keyboard-accessible dialogs, and a
  keep-alive screen shell that retains screen state while suspending hidden
  work.

Not yet implemented: non-fast-forward/local-line integration, the recovery
center, guided conflict
resolution, and setting changes aside. Signed cross-platform
distribution and real macOS/Linux runtime validation also remain release gates.
The dependency-ordered `1.0.0` plan is in the
[`roadmap`](docs/ROADMAP.md), with approved acceptance criteria under
[`work/active/`](work/active/) and the completed core-workflow evidence in
[`task 065-1`](work/done/065-1-core-workflow-audit.md), clone evidence in
[`task 065-2`](work/done/065-2-clone-remote-project.md), and local-creation
evidence in [`task 065-3`](work/done/065-3-create-local-project.md).
The completed History implementation and its validation are recorded in
[`task 015`](work/done/015-history-timeline.md).

## Publication checks

The planned updater uses two channels, `stable` and `preview`, both released
from tagged commits on `main`. Short-lived version branches prepare releases;
the version/tag selects the channel. See
[ADR 0010](docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
and [task 065-9](work/active/release-1.0/065-9-signed-application-updates.md).
The native updater lifecycle and its visual controls are implemented. The
current release matrix enables only Windows x86-64 per-user NSIS and Linux
x86-64 AppImage candidates, but neither is enabled for automatic installation
until its real signed A-to-B qualification succeeds. Both macOS targets are
planned and explicitly disabled under task 065-10; they are not advertised in
feeds or published as supported packages. Signed-build validation, protected
evidence and protected signing workflows are implemented. Distinct validation
and production Tauri updater keys are configured; the fixed validation pair may
defer Windows Authenticode only while remaining clearly marked as an internal,
OS-untrusted test. Source-repository visibility grants no access to signing
material or publisher credentials. The manual public publisher,
immutable-asset reconciliation and stable/preview feed gates are implemented
and locally tested. Production remains closed: no target is qualified, no
publisher credential or real signed matrix is evidenced, and no release/feed
has been published. Maintainers must follow the
[signed-build](docs/release/signed-builds.md) and
[public publishing](docs/release/public-publishing.md) runbooks; a private
artifact is not a release and validation drafts cannot modify a production
feed. The validation updater identity is distinct from production.

Before publishing a desktop build, run `pnpm run check:publication`. It runs
the complete local gate plus `check:feedback`, which checks the live public
repository settings and both languages' forms against
`src/app/issueReportContract.json`. CI runs that public contract check separately;
ordinary `pnpm run check` does not depend on GitHub availability. For prepared
tracker changes, use `pnpm run check:feedback --local <feedback-checkout>` to
validate form files before publishing them. Preserve form filenames and field
IDs used by already released app versions.

### Code signing policy

Release tags are protected, candidate builds originate from reviewed GitHub
Actions runs, and published packages must retain their checksums and signature
evidence. Windows packages require a publicly trusted Authenticode signature;
the Tauri updater signature is a separate requirement for every enabled target.
Controlled validation packages may intentionally lack Authenticode so the
Tauri-signed updater lifecycle can be tested; they are not trusted public
downloads. [Task 065-9-9](work/active/app-updates/065-9-9-authenticode-public-delivery.md)
owns the sustainable certificate/provider choice and real public Windows
qualification before general distribution. No external signing-service
application has been submitted.

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
Tauri adapter, translations, styles, and tests. `src/app/App.tsx` is the
composition root for cross-feature orchestration; the rest of the shell UI and
preferences live beside it under `src/app/`. Screens are declared once in
`src/app/screens.tsx` and consume the project-scoped runtime in
`src/runtime/` rather than fetching when they become visible.

Rust keeps transport, policy, coordination, domains, and infrastructure
separate:

- `ipc.rs` adapts Tauri arguments and responses;
- `application.rs` assigns one checked execution policy to every command;
- `repository_access.rs` coordinates concurrent reads and exclusive mutations
  by common Git directory;
- `repository.rs`, `clone.rs`, `initialize.rs`, `status.rs`, `changes.rs`,
  `save_version.rs`, `sync.rs`,
  `publish.rs`, `recovery.rs`, and `version_lines.rs` own product behavior;
- `operation.rs` owns shared mutation classification and bounded/redacted
  diagnostic details;
- `index.rs` owns collision-safe temporary-index preparation shared by safe
  mutations;
- `git_command.rs` binds application policy to the bounded runner in `git.rs`;
- `platform.rs` owns the OS-specific exclusive directory publication primitive;
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
snapshot; the About dialog credits the Tauri, React, TypeScript, and Rust rows
of it, reading them from the same lockfiles at build time rather than from a
hardcoded list:

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

GitOdile uses the system Git executable. Git **2.23 or newer** is required for
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

The status bar, About and What's new share the version injected from
`package.json`. Vite watches that manifest as a configuration dependency and
reloads the frontend after a version change. A Git branch name alone does not
change the app version; installed packages retain the version they were built
with. Keep npm, Cargo and Tauri metadata synchronized when preparing a release.

Run the complete repository harness:

```bash
pnpm run check
```

The aggregate check validates Markdown links/task metadata, frontend dependency
rules, TypeScript, 655 frontend tests, the production build, Rust formatting,
Clippy with warnings denied, and 321 Rust tests. Individual commands remain
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
