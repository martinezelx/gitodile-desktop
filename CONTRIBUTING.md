# Contributing

GitOdrile is at an early stage. Contributions should preserve the product's central goal: make Git safer and easier without hiding important consequences.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm run tauri dev
```

## Before opening a pull request

- Read `AGENTS.md` and `DESIGN.md`.
- Keep changes focused.
- Add tests for behavior changes.
- Consider Windows, macOS, and Linux implications.
- Update documentation when user-facing vocabulary or architecture changes.
- Do not add telemetry, cloud transmission, or AI integrations without explicit documentation and user consent design.

## Commit style

Conventional prefixes are encouraged:

- `feat:`
- `fix:`
- `docs:`
- `refactor:`
- `test:`
- `chore:`

## Reporting security issues

Do not publish sensitive vulnerabilities in a public issue. See `SECURITY.md`.
