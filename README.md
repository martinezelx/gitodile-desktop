# GitOdrile

> A friendly, modern desktop Git client for people who want version control without Git jargon.

GitOdrile is an early-stage cross-platform desktop application for Windows, macOS, and Linux. Its goal is not to turn Git commands into prettier buttons, but to redesign the Git experience around user intent, safety, and understandable language.

## Product principles

- **Intent over commands** — say “Save a version” instead of “Commit”.
- **Safety by default** — create recovery points before destructive operations.
- **Progressive disclosure** — simple mode first, advanced Git concepts when needed.
- **Local-first** — repositories and source code remain on the user's machine.
- **Fast and lightweight** — use Tauri and Rust instead of shipping a full browser runtime.
- **Cross-platform from the start** — Windows and macOS are first-class; Linux is supported with pragmatic platform fallbacks.

## Proposed stack

- Tauri 2
- Rust
- React
- TypeScript
- Vite
- CSS variables and a small internal component system
- System Git initially, wrapped behind a Rust service boundary
- pnpm

## Early MVP

1. Open or clone a repository.
2. Show repository health in plain language.
3. Review changed files and diffs.
4. Save a version with an understandable summary.
5. Pull and publish changes safely.
6. Create automatic recovery points.
7. Restore a previous state without exposing reset/reflog complexity.
8. Guide users through simple merge conflicts.
9. Offer an optional advanced mode with native Git terminology.

## Getting started

GitOdrile uses **pnpm 11.17.0** as its supported package manager. The committed
`pnpm-lock.yaml` keeps JavaScript dependencies reproducible; do not mix package
managers in the same checkout.

### Requirements

All platforms need:

- [Node.js](https://nodejs.org/) 24 or later (the LTS release is recommended).
- pnpm 11.17.0, available through Corepack (`corepack enable`).
- [Rust stable](https://www.rust-lang.org/tools/install), including `cargo`,
  `clippy`, and `rustfmt`. The repository selects the stable toolchain in
  `rust-toolchain.toml`.
- [Git](https://git-scm.com/).

On Windows, Tauri also requires:

- **Microsoft C++ Build Tools**, with the **Desktop development with C++**
  workload selected. This provides the `link.exe` linker used by Rust.
- **Microsoft Edge WebView2 Runtime**. It is included with current Windows 10
  and Windows 11 installations; install it separately if it is missing.

The current Tauri prerequisite list for Windows, macOS, and Linux is available
in the [official Tauri documentation](https://v2.tauri.app/start/prerequisites/).
On macOS, install Xcode Command Line Tools (`xcode-select --install`). On Linux,
install the WebKitGTK and build packages listed for your distribution there.

#### Windows installation

In PowerShell, Rust can be installed with:

```powershell
winget install --id Rustlang.Rustup
```

Then restart the terminal and confirm the installation:

```powershell
node --version
pnpm --version
rustc --version
cargo --version
git --version
```

If `link.exe` is not found during a Rust build, install or modify Visual Studio
Build Tools and add the **Desktop development with C++** workload, then open a
new terminal.

### Install dependencies

From the project root:

```bash
pnpm install
```

For a clean, reproducible install in CI or after cloning, use:

```bash
pnpm install --frozen-lockfile
```

### Run the application

Start the full desktop application, including Vite and the Tauri shell:

```bash
pnpm run tauri dev
```

To run only the web interface in a browser during UI work:

```bash
pnpm run dev
```

Vite serves the interface at `http://localhost:1420` while it is running.

### Validate and build

Run these checks before opening a pull request:

```bash
pnpm run typecheck
pnpm run test
pnpm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Create a production desktop bundle with:

```bash
pnpm run tauri -- build
```

The frontend checks currently pass even when no test files exist; add tests as
features are implemented.

The initial code is intentionally small. Read `AGENTS.md`, `DESIGN.md`, and `docs/ARCHITECTURE.md` before implementing features.

## Local work management

GitOdrile keeps its backlog, active tasks, blockers, and completed work inside the repository under `work/`. This is the source of truth for implementation context, so coding agents do not need an external issue tracker.

Before starting work:

1. Read `work/README.md`.
2. Select an approved task from `work/active/`.
3. Stay within its declared scope and acceptance criteria.
4. Update the task honestly as decisions are made and checks are run.
5. Move completed work to `work/done/`; move blocked work to `work/blocked/`.

Ideas in `work/backlog.md` are not approved for implementation until they are promoted into an active task.

## Status

GitOdrile is currently a product concept and technical foundation. APIs, UX language, and architecture may change quickly.

## License

MIT. See `LICENSE`.
