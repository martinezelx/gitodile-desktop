---
id: 065-9-10
title: Prepare releases automatically after approved version-branch merges
status: active
priority: medium
type: feature
areas:
  - release
  - automation
  - security
  - documentation
created: 2026-09-13
completed:
parent: "065-9"
queue: "23"
---

# Goal

Start the appropriate release preparation automatically when an explicitly
named preview or release branch is merged into protected `main`, without making
an unreviewed merge equivalent to production publication.

# Context

The controlled `.2` to `.3` qualification deliberately keeps tagging and
publication explicit so the first real pipeline can be observed gate by gate.
After that path is proven, the maintainer wants merges from recognized preview
or release branches to initiate the same hardened candidate workflow.

# Scope

- Define an unambiguous, documented branch naming contract for preview and
  release candidates.
- On a closed, merged pull request, bind the merge commit, source branch,
  repository, version metadata and expected channel before creating any tag.
- Reuse the protected candidate, signing and publication gates; do not copy or
  bypass their authorization logic.
- Make retries idempotent and reject an existing tag that identifies different
  bytes.
- Keep production publication behind its protected environment approval and
  destination-scoped credential.
- Preserve macOS as disabled through `1.0.0` and until its post-1.0 independent
  qualification is complete.
- Preserve the honest `authenticode_deferred` state for pre-1.0 and initial
  1.0 Windows releases; automation must not imply OS-level publisher trust.

# Acceptance criteria

- [ ] A merged recognized preview branch starts one candidate preparation for
      the exact protected-main merge commit and matching prerelease version.
- [ ] A merged recognized release branch starts the intended release
      preparation only when stable metadata and policy permit it.
- [ ] Closed-but-unmerged pull requests, forks, renamed branches, version
      mismatches and unrecognized branches fail closed without creating tags or
      releases.
- [ ] Re-delivery and retries are idempotent; an existing mismatched tag or
      asset is never overwritten.
- [ ] Signing and publication still require their existing protected
      environments, matrix checks and exact provenance.
- [ ] Executable tests cover preview, release and every rejected event shape,
      and `pnpm run check` plus `pnpm run check:publication` pass.

# Dependencies

- [065-9-8](065-9-8-public-windows-linux-qualification.md) real controlled
  updater qualification.
- [065-9-8](065-9-8-public-windows-linux-qualification.md) and the publication
  contracts needed for unsigned-but-Tauri-authenticated Windows/Linux releases.

Task 065-9-9 is deliberately post-1.0 and does not block this automation.

# Validation

Retain the merged pull-request event, exact merge SHA, generated tag identity,
candidate/signing run links and rejection-test output. Do not use this task to
publish a stable release or any macOS artifact.
