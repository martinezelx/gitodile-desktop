# Contributing

GitOdrile is pre-release software. Contributions must preserve its central
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

## Security

Do not publish a sensitive vulnerability in a public issue. Follow
[`SECURITY.md`](SECURITY.md).
