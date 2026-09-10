---
id: 065-9-6
title: Publish public releases and stable preview feeds
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
queue: "02"
---

# Goal

Publish complete signed artifacts to the feedback repository and advance channel feeds safely.

# Context

Child of [epic 065-9](../release-1.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Implement one serialized publication coordinator using destination-scoped credentials, curated notes and public tags pointing only to public commits.
- Publish immutable version-specific assets and archived latest.json; verify every required download anonymously before promoting stable.json or preview.json.
- Derive prerelease status from the validated version. Preview changes only preview; stable may advance preview only if newer. Never relabel a preview binary as stable.
- Make retries and interrupted/overlapping publication safe: validate finalized assets, prevent feed regression and publish complete manifests only after the full matrix succeeds.
- Update public feedback download guidance while preserving issue-form IDs and the task 108 contract; document caching, withdrawal, retained installers and maintainer recovery.

# Out of scope

Public source hosting, custom update servers, rollout percentages and issuing a 1.0.0 readiness claim.

# Acceptance criteria

- [ ] No client token or private source/archive is published, and public tags reference the public repository.
- [ ] Partial matrix, anonymous-download failure, interrupted retry and concurrent release cases cannot expose an incomplete/regressed feed or overwrite finalized assets.
- [ ] Manifest versions, URLs, signatures, target entries and GitHub flags match verified artifacts; both channels follow ADR 0010.
- [ ] Publication and feed promotion are gated on qualification from 065-9-7; validation/draft publication can run earlier without promoting production feeds.
- [ ] Public feedback contract and pnpm run check:publication pass before actual publication.

# Dependencies

065-9-5 signed artifacts. Production promotion additionally requires 065-9-7 qualification; implement and test the publisher before that gate.

# Implementation notes

Not implemented. Record decisions, changed files and evidence here; keep durable
architecture and operator guidance in docs and link them rather than duplicating them.

# Validation

Record publisher failure/retry tests, anonymous download evidence, feedback-contract validation and pnpm run check.
