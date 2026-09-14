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

Consolidate GitOdile into one source repository and one public product
repository, then start the appropriate release preparation automatically when
an explicitly named version branch is merged into protected `main`, without
making an unreviewed merge equivalent to production publication.

# Context

The controlled `.2` to `.3` qualification deliberately keeps tagging and
publication explicit so the first real pipeline can be observed gate by gate.
After that path is proven, the maintainer wants merges from recognized preview
or release branches to initiate the same hardened candidate workflow.

On 2026-09-14 the maintainer selected the durable repository names:

- `martinezelx/gitodile-desktop` owns application source, tests, documentation,
  candidate builds and release automation.
- `martinezelx/gitodile` is the public product home and owns downloads, GitHub
  Releases, updater feeds and issues.

`project-gitodile` and `gitodile-feedback` are temporary names. GitHub's rename
redirects are a migration aid, not a permanent runtime dependency. The
controlled `gitodile-validation` host receives no new versions; its immutable
`.2`/`.3` and `.4`/`.5` qualification evidence must be retained until 065-9-8
is closed and only then archived or removed through a separately reviewed
evidence-retention step.

## Version-branch contract

The only release-triggering source branch form is `release/<version>`, where
`<version>` is the exact canonical SemVer stored in every version-bearing file:

- preview example: `release/0.2.0-preview.10`;
- stable example: `release/1.0.0`.

Forms such as `0.2.0preview.10`, `release/v0.2.0-preview.10`, arbitrary feature
branches and direct pushes to `main` do not trigger a release. The `v` prefix
belongs only to the generated tag, for example `v0.2.0-preview.10`.

The version branch may change only reviewed release preparation: synchronized
version metadata, curated notes and deliberate release configuration. It enters
`main` through a pull request with required checks. The automation consumes the
closed-and-merged event from the same repository, verifies the exact protected-
`main` merge SHA and successful required checks, and creates the tag only when
branch, metadata, notes and derived channel agree.

# Scope

- Rename `project-gitodile` to `gitodile-desktop` and `gitodile-feedback` to
  `gitodile`; update local remotes, repository rules, environments, GitHub App
  or token scope, Actions variables, badges, source/support/download links,
  feed endpoints, updater capabilities, tests and runbooks to their canonical
  destinations.
- Make the public `gitodile` README clearly identify it as the product download,
  releases and issue hub and link to `gitodile-desktop` as the source repository.
- Define and enforce the `release/<canonical-semver>` branch contract for both
  preview and stable candidates.
- On a closed, merged pull request, bind the merge commit, source branch,
  same-repository identity, version metadata, curated notes, required-check
  result and expected channel before creating any tag.
- Run the tag-creation logic only from workflow code already present on the
  protected default branch. Never check out or execute pull-request-head code
  with a token that can create tags or write another repository.
- Reuse the protected candidate, signing and publication gates; do not copy or
  bypass their authorization logic.
- Make retries idempotent and reject an existing tag that identifies different
  bytes.
- Let a valid generated tag start Windows and Linux candidate builds
  automatically. Keep cross-repository publication as a later promotion that
  consumes only verified build/signing evidence.
- Keep production publication behind its protected environment approval and
  destination-scoped credential.
- Preserve macOS as disabled through `1.0.0` and until its post-1.0 independent
  qualification is complete.
- Preserve the honest `authenticode_deferred` state for pre-1.0 and initial
  1.0 Windows releases; automation must not imply OS-level publisher trust.

# Acceptance criteria

- [ ] The canonical repositories are exactly `martinezelx/gitodile-desktop`
      and `martinezelx/gitodile`; every runtime URL, workflow assertion,
      credential scope and user-facing link uses the new names without relying
      on GitHub redirects.
- [ ] The public product repository contains issues, immutable GitHub Release
      assets and `preview.json`/`stable.json`, but no application build job or
      application signing authority. The source repository cannot publish with
      its ordinary `GITHUB_TOKEN`.
- [ ] Existing source history, rulesets, required checks, environments, release
      evidence and issue content survive the rename and are independently
      checked before old URLs are treated as obsolete.
- [ ] A merged recognized preview branch starts one candidate preparation for
      the exact protected-main merge commit and matching prerelease version.
- [ ] A merged recognized release branch starts the intended release
      preparation only when stable metadata and policy permit it.
- [ ] Closed-but-unmerged pull requests, forks, renamed branches, version
      mismatches, missing notes, failed required checks, direct pushes and
      unrecognized branches fail closed without creating tags or releases.
- [ ] Privileged tag creation does not execute code from the version branch or
      use pull-request-controlled commands, paths, environment names, artifact
      names or destination repository values.
- [ ] Re-delivery and retries are idempotent; an existing mismatched tag or
      asset is never overwritten.
- [ ] Signing and publication still require their existing protected
      environments, matrix checks and exact provenance.
- [ ] Executable tests cover preview, release and every rejected event shape,
      and `pnpm run check` plus `pnpm run check:publication` pass.

# Dependencies

- [065-9-8](065-9-8-public-windows-linux-qualification.md) and the publication
  contracts needed for unsigned-but-Tauri-authenticated Windows/Linux releases.

Implementation and simulated end-to-end tests may proceed before the remaining
Linux VM qualification. Real production feed promotion and closure of this task
still require every enabled target to satisfy the qualification registry.

Task 065-9-9 is deliberately post-1.0 and does not block this automation.

# Validation

Retain the merged pull-request event, exact merge SHA, generated tag identity,
candidate/signing run links, repository rename audit, canonical endpoint checks
and rejection-test output. Exercise a preview through a non-promoting or
reviewer-approved dry run before enabling normal publication. Do not use this
task to publish a stable release or any macOS artifact.
