# Contributing

GitOdile is pre-release software. Contributions must preserve its central
promise: make Git understandable and safe without hiding consequences.

## Before changing code

1. Read [`AGENTS.md`](AGENTS.md), [`DESIGN.md`](DESIGN.md), the
   [`product strategy`](docs/PRODUCT_STRATEGY.md), and the
   [`architecture guide`](docs/ARCHITECTURE.md).
2. Read [`work/README.md`](work/README.md) and select an approved active task,
   unless the user has explicitly requested the change.
3. Inspect the owning feature/domain and identify Windows, macOS, and Linux
   implications.

Do not create a routine feature branch: project convention is to work directly
on `main` unless the user explicitly asks for isolation.

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run tauri dev
```

See the [`README`](README.md) for full platform prerequisites and resolved
technology versions.

## Change rules

- Keep changes focused and preserve feature/domain ownership.
- Add tests for behavior, parsers, planners, and architecture rules.
- Preserve keyboard access and loading, empty, error, and hidden-screen states.
- Never bypass hooks/signing or silently discard, resolve, force-push, clean,
  reset, or delete user work.
- Do not add telemetry, cloud transmission, or AI integration without an
  explicit product/privacy decision and consent design.
- Update the one authoritative document when behavior, architecture, versions,
  or vocabulary changes; link instead of duplicating prose.

## Completion gate

Run the full harness:

```bash
pnpm run check
```

This includes documentation integrity, architecture rules, TypeScript,
frontend tests/build, Rust formatting, Clippy, and Rust tests. Record failures
honestly in the task; never claim an unexecuted check passed.

## Commits

Conventional prefixes are encouraged: `feat:`, `fix:`, `docs:`, `refactor:`,
`test:`, and `chore:`. Keep commits focused and do not add AI attribution or
`Co-Authored-By` trailers.

## Versioning and tags

GitOdile follows [Semantic Versioning 2.0.0](https://semver.org). While the
major is `0` the public surface is the shipped desktop application, not a
library API:

- **patch** (`0.1.0` → `0.1.1`) — fixes and refinements to what already exists.
- **minor** (`0.1.1` → `0.2.0`) — a new capability a user can reach.
- **major** — reserved. `1.0.0` is owned by the release epic and is not reached
  by accumulation.

Three files carry the number and must move together, or the About dialog, the
installer, and the crash metadata disagree about what is running:

- [`package.json`](package.json) — the source `__APP_VERSION__` is built from.
- [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) — the installer and
  updater metadata.
- [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml) — the binary.

Every released version gets an annotated tag, `v` plus the exact number:

```bash
git tag -a v0.1.0 -m "GitOdile 0.1.0"
```

**Do not put a date in the version number.** A `DDMMYY` patch is not monotonic
— `0.1.010926` (1 September) is numerically lower than `0.1.270826`
(27 August), so every comparison in Cargo, npm, the Tauri updater, and
`git tag --sort=v:refname` reads the newer build as a downgrade. It is not even
valid SemVer: numeric identifiers may not carry leading zeroes, so Cargo
refuses to parse it. The date is already recorded by the commit and by the tag;
the version number answers a different question, which is how much changed and
whether it breaks the person upgrading.

## Security

Do not publish a sensitive vulnerability in a public issue. Follow
[`SECURITY.md`](SECURITY.md).

## Licensing of contributions

By submitting a contribution to GitOdile, you agree that your contribution
may be distributed as part of GitOdile under the GNU Affero General Public
License v3.0 only (`AGPL-3.0-only`).
