---
id: 065-9-5
title: Build signed release artifacts in private CI
status: active
priority: high
type: feature
areas:
  - release
  - platform
  - security
created: 2026-09-03
completed:
parent: "065-9"
queue: "01"
---

# Goal

Produce verified platform packages from checked source tags without exposing private source or signing secrets.

# Context

Child of [epic 065-9](../release-1.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Implement private CI that validates tag syntax, main ancestry, exact source revision and agreement of all version metadata; ordinary branch pushes and merges do not publish.
- Build the required target matrix and sign final updater artifacts; handle OS signing and macOS notarization separately with trusted-job credentials.
- Provide protected validation builds for two forward versions without promoting public channel feeds, so updater qualification can precede a public release.
- Record artifact hashes, private source/build provenance, certificate identities and the key backup/rotation/loss procedure; do not log secrets or export private source archives.

# Out of scope

Public feed promotion, replacing finalized assets and the complete product QA matrix for 1.0.0.

# Acceptance criteria

- [x] Wrong ancestry, version mismatch, unsupported prerelease suffix and channel disagreement fail before publication.
- [ ] Every enabled target produces its required package, updater signature and verification evidence; partial matrix failure cannot authorize feed promotion.
- [ ] Production secrets are restricted to trusted jobs; updater signing and OS trust checks are separately evidenced.
- [x] Build/recovery instructions and real credential readiness are recorded; missing certificates or platforms remain explicit blockers to their production artifacts.

# Dependencies

065-9-1 through 065-9-4; production signing access for enabled targets.

# Implementation notes

Implemented the locally verifiable pipeline boundary on 2026-09-10. The task
remains active because no production/validation updater key, Windows signing
certificate, Apple identity/notary access, protected-environment configuration,
or real signed matrix run is evidenced. Consequently no target is enabled and
the two artifact-producing acceptance criteria remain open.

- `.github/workflows/private-candidate-build.yml` is tag-push-only. Its
  secretless validator checks the exact grammar, tag object/SHA, `main`
  ancestry, all four version owners and the derived channel before a four-target
  unsigned matrix can start. Branch pushes, pull requests and ordinary merges
  do not trigger it.
- `.github/workflows/private-candidate-signing.yml` uses `workflow_run`, is
  loaded from protected `main`, repeats Git-object and complete-matrix/hash
  validation, and never checks out candidate source inside signing jobs.
  Windows, Apple and updater secrets are split across protected environments.
  The final coordinator alone can close a matrix, and every output says
  `publicPromotionAllowed: false`.
- `scripts/release/` owns the validators, evidence/hash generation, credential
  readiness guard and isolated Windows/macOS signing helpers. The Rust example
  independently verifies Tauri updater signatures. Evidence binds full source
  SHA/tag, version/channel/profile, target, final-byte SHA-256, public
  certificate/signer identity and each verification result.
- The fixed A=`0.2.0-preview.2` / B=`0.2.0-preview.3` pair selects a distinct
  validation updater-signing environment. This pipeline has no GitHub Release,
  destination token or feed-writing capability.
- Durable preparation, verification, key backup/restore testing, rotation,
  compromise and loss procedures live in the
  [private signed-build runbook](../../../docs/release/signed-builds.md).

External blockers are exact rather than simulated: the four updater public
identity variables; production and validation updater private keys plus
verified offline backups; Authenticode certificate access; Apple Developer ID,
team and notarization access; protected-environment reviewers; runner/package
availability; and real platform executions. Working-name clearance remains a
separate public-release gate. An absent credential fails by name before a
signing command and cannot yield a production evidence record.

# Validation

Local validation on 2026-09-10:

- `node --test scripts/release/release-pipeline.test.mjs` passes 11 cases
  covering invalid tags,
  unsupported prereleases, wrong ancestry, exact revision/metadata agreement,
  channel disagreement, incomplete/mixed matrices, safe missing credentials,
  package-only export enforcement, and artifact hash/provenance generation
  including tamper rejection.
- Both workflow files parse as YAML with the locked `js-yaml` dependency.
- The independent Rust verifier compiled and accepted the repository's valid
  updater-signature fixture.

`pnpm run check` passed over 356 Markdown files / 153 task IDs, the release and
architecture guards, TypeScript, 84 frontend test files / 858 tests, the
production build, Rust formatting and Clippy, and 396 Rust tests.
`git diff --check` also passed. No Actions build, Authenticode signature, Apple
signature/notarization, production updater signature or installed update was
executed or claimed by this local evidence.
