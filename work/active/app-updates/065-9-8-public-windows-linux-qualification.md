---
id: 065-9-8
title: Qualify controlled Windows and Linux updater delivery
status: active
priority: high
type: hardening
areas:
  - release
  - platform
  - security
  - documentation
created: 2026-09-11
completed:
parent: "065-9"
queue: "04"
---

# Goal

Prove the real Tauri updater lifecycle on installed Windows and Linux builds
through a controlled HTTPS feed, while keeping production publication and macOS
disabled until their separate trust and platform gates are complete.

# Context

Child of [epic 065-9](../release-1.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
originally assumed a private source repository and a four-target production
matrix. This task amends both assumptions. The maintainer initially decided on
2026-09-11 to make the source repository temporarily public so standard
GitHub-hosted qualification runs do not consume the private-repository minutes
allowance, then decided on 2026-09-12 to keep it public throughout this testing
phase. This publication is an intentional source distribution under the
repository's MIT license: any later visibility change cannot revoke rights to,
or erase copies of, versions already obtained.

The maintainer has a real Windows device and can provide a Linux virtual
machine, but has no macOS device. The closeable initial delivery matrix is
therefore Windows x86-64 NSIS and Linux x86-64 AppImage. Both macOS targets must
remain planned but disabled: they are not qualified, advertised in a feed, or
published as supported packages. Their implementation preparation is retained
for a later independently tracked qualification task. This scoped closure does
not by itself satisfy any parent 1.0.0 criterion that still requires actual
macOS artifacts or runtime evidence. On 2026-09-12 the maintainer kept the
source repository public for GitHub-hosted Actions capacity but narrowed this
task to functional updater validation. Windows Authenticode and general public
production previews moved to task 065-9-9. No SignPath application was
submitted.

# Scope

- Harden the repository for public visibility before any signing or
  publisher credential is configured: pin every third-party Action to an exact
  commit, remove workflow-command injection surfaces, keep tokens read-only by
  default, restrict allowed Actions, protect `main` and `v*` tags, and enable
  the available public-repository security scanning and dependency controls.
- Review the complete reachable Git history and current tree for credentials,
  personal data, private artifacts and unintended strategic disclosure. Record
  the audit without copying suspected values. Require an explicit maintainer
  decision for the existing `work/`, product-strategy and design-critique
  history before changing repository visibility.
- Amend ADR 0010 and the updater/release contracts so source visibility is not
  a security boundary. Keep signing keys, OS certificates, destination tokens,
  protected environments and privileged publication jobs separate from source
  visibility. Update copy and tests that claim the source repository is
  necessarily private.
- Define the currently enabled release and qualification matrix as exactly
  `windows-x86_64` using per-user NSIS and `linux-x86_64` using AppImage.
  Represent `darwin-aarch64` and `darwin-x86_64` as planned and disabled, fail
  closed if either is advertised without real qualification, and create a
  durable follow-up task for macOS signing, notarization, replacement safety
  and installed A-to-B evidence.
- Configure distinct validation and production updater identities with tested
  encrypted recovery, a controlled anonymous-read HTTPS validation origin and
  reviewer-protected GitHub environments. Never place secret values in source,
  task files, workflow inputs, logs or Actions artifacts.
- Build and retain the fixed Tauri-signed validation pair
  `0.2.0-preview.2` / `0.2.0-preview.3` from exact tagged `main` commits. Create
  one controlled non-promoting bundle and exercise the complete installed A-to-B
  and failure matrix on real Windows and Linux environments. Record Windows as
  OS-untrusted during this internal validation; never present it as an
  Authenticode-qualified public download.
- Publish only the fixed validation bundle to the controlled
  `martinezelx/gitodile-validation` GitHub Pages origin. Preserve exact hashes,
  immutable version paths and anonymous HTTPS access without advancing the
  production `preview.json` or creating a stable release.
- Record exact run URLs, tags, full source SHAs, matrix and artifact hashes,
  updater signing identities, installed versions, preservation checks, failure
  results, validation-host commits and anonymous download evidence. Keep the
  broader publication children and epic open wherever task 065-9-9 still owns
  missing production trust evidence.
- Keep the source repository public during this qualification phase. A later
  visibility decision must preserve the already accepted MIT-distribution
  consequences and must not break the separate public validation or release
  hosts.

# Out of scope

- Claiming macOS signing, notarization, installation, replacement safety or
  updater support without real target evidence.
- Declaring GitOdile 1.0.0 ready; task 065-8 and the parent 065 epic retain the
  final product and platform gate.
- Rewriting published Git history merely to make temporary disclosure appear
  reversible, or claiming that returning the repository to private recalls
  existing clones, forks or MIT rights.
- Using self-signed Windows certificates, mocked OS trust, compile-only
  packages, fixture evidence or successful unit tests as substitutes for real
  installed updater evidence. Validation may explicitly defer Authenticode; it
  may not claim that an unsigned installer has Windows publisher trust.
- General public Windows distribution, production preview publication and
  Authenticode qualification; task 065-9-9 owns them.
- Publishing a stable release, changing the stable channel, adding macOS feed
  entries, or weakening signature/admission/recovery behavior to simplify the
  qualification.

# Acceptance criteria

- [ ] The public-readiness audit is recorded and reviewed. No credential,
      certificate, private key, authenticated URL, personal path or unintended
      private artifact is present in any ref made public; accepted strategic
      disclosures and the irrevocable MIT consequence are explicit.
- [ ] Every workflow Action is commit-pinned, untrusted workflow values reach
      shells only through validated environment variables, default permissions
      are read-only, and protected `main`, `v*` tags and credential environments
      prevent an unreviewed contributor from reaching signing or publication.
- [ ] Public-repository Secret Scanning/Push Protection and applicable
      dependency/code scanning are enabled and clean, or any unavailable
      control has an equally explicit recorded mitigation.
- [ ] ADR 0010, architecture, tests and user-facing links no longer rely on
      source privacy. Public source cannot access signing material or the
      destination credential, and pull requests or forks cannot trigger or
      approve a privileged release.
- [ ] The enabled matrix is exactly Windows x86-64 NSIS and Linux x86-64
      AppImage. Both macOS targets are visibly unqualified and absent from
      advertised production feeds/assets, with a separate active or blocked
      follow-up owning their real enablement.
- [ ] Real Tauri-signed `0.2.0-preview.2` and `0.2.0-preview.3` packages exist
      for both enabled targets with complete build provenance and updater
      verification. Windows evidence says `authenticode_deferred` and cannot be
      confused with production trust. The controlled bundle changes no package
      byte and cannot promote a production feed.
- [ ] Real Windows and Linux A-to-B reports prove the running version after
      handoff and preserve settings, sessions, drafts, operations, helpers,
      dirty tracked/untracked files and Git history. Every required failure case
      records no false success and no forced downgrade.
- [ ] The controlled GitHub Pages bundle exposes only immutable validation
      paths, downloads anonymously with recorded hashes and advances only from
      `.2` to `.3`. It does not modify `gitodile-feedback`, production
      `preview.json` or `stable.json`.
- [ ] A normal Windows NSIS installation updates end to end from `.2` to `.3`
      through GitOdile and truthfully reports the running version after restart.
      The same proof passes on the Linux AppImage environment before functional
      qualification is complete.
- [ ] The qualification registry contains exact schema-valid evidence for only
      the enabled targets and an explicit non-qualified state for macOS.
      Production promotion fails closed for any target not in the reviewed
      enabled matrix and cannot silently drop a required row.
- [ ] Functional evidence closes only the criteria it actually proves.
      Authenticode, destination publication and production preview criteria stay
      open under 065-9-9. `pnpm run check` and `pnpm run check:publication` pass
      on the exact validation commit, with no macOS or 1.0.0 readiness claim.
- [ ] The source repository remains public for this phase; public updater assets
      and feeds stay separate from source visibility and signing authority.

# Dependencies

- 065-9-1 through 065-9-7 and their existing contracts/runbooks.
- Maintainer acceptance of public MIT distribution and the selected
  strategic documentation exposure.
- Separate validation/production updater keys, controlled HTTPS hosting and
  protected GitHub environments. Offline production-key recovery remains a
  prerequisite for public production distribution, not for the disposable
  validation-key exercise.
- A real Windows x86-64 installation environment and a Linux x86-64 VM capable
  of running and replacing the AppImage through the normal desktop flow.

# Implementation notes

The completed second local audit is recorded in
[`docs/release/public-readiness-audit-2026-09-12.md`](../../../docs/release/public-readiness-audit-2026-09-12.md).
It used the checksum-verified Gitleaks 8.30.1 binary over `--all`, reviewed all
5,122 reachable object paths and the current tree, and found no secret or
private artifact requiring history rewrite. `pnpm audit --prod` also reported
no known production vulnerability. The accepted disclosure covers 161 tracked
`work/` files, strategy and critique history, the maintainer's public name and
noreply address, and the irrevocable MIT consequence.

The same preflight identified and the hardening change corrects mutable Action
refs, missing repository-wide SHA enforcement, direct workflow-dispatch input
interpolation, a four-platform publication matrix and insufficient separation
between source-run validation and the destination credential. After public
visibility, restricted Actions with repository-wide SHA enforcement, active
`main`/`v*` rulesets, five reviewer-protected environments, Secret Scanning,
Push Protection, Dependabot and CodeQL were enabled and inspected before any
credential was introduced. The first scans exposed development dependency and
dynamic-regexp findings; these were corrected rather than dismissed. Exact
settings and run links are retained in the public-readiness audit.

Two distinct Tauri updater identities have now been generated for validation
and production, stored only in their corresponding protected environments and
in encrypted CurrentUser-DPAPI recovery copies on the controlled Windows
maintainer machine. Both encrypted copies passed a real restore, fixture-signing
and Rust-verifier test. The separate offline backup required before production
distribution is still missing. The controlled validation host now exists at
`https://martinezelx.github.io/gitodile-validation/065-9-7/updates/preview.json`;
it intentionally returns 404 until the real `.2`/`.3` bundle exists. Windows
Authenticode and the destination-scoped public publisher moved to 065-9-9;
installed Windows/Linux evidence is still pending.

Platform-specific Tauri configuration now overrides the unsafe default
`bundle.targets: all`: Windows builds only NSIS, Linux builds only AppImage and
macOS bundling is disabled. This prevents a normal preview `tauri build` on
Windows from entering the unsupported MSI bundler, whose numeric-only
prerelease constraint rejects `0.2.0-preview.N`. A real local
`pnpm tauri build --ci --no-sign` on the `0.2.0-preview.2` version branch
reported exactly one bundle and produced
`GitOdile_0.2.0-preview.2_x64-setup.exe` successfully. The resulting local
package is intentionally unsigned and is build-contract evidence only, not a
substitute for the protected validation-key workflow or installed updater
evidence.

The first protected candidate attempt is retained as failed run
[`34702455447`](https://github.com/martinezelx/project-gitodile/actions/runs/34702455447).
Its immutable identity validation passed, but the secretless Windows build
failed before packaging because PowerShell removed the quotes from an inline
JSON `--config` value. No protected signing job ran. The workflow now uses the
checked `src-tauri/tauri.unsigned.conf.json` path on both shells, and executable
tests reject a return to inline JSON configuration.

The corrected candidate run
[`34717984524`](https://github.com/martinezelx/project-gitodile/actions/runs/34717984524)
then built the complete unsigned Windows/Linux matrix and passed its independent
hash and provenance gate. Its downstream signing run
[`34718448366`](https://github.com/martinezelx/project-gitodile/actions/runs/34718448366)
failed closed before accessing a protected environment: GitHub exposes
`GITHUB_REF_TYPE=branch` to a `workflow_run`, while the revalidation command is
checking the exact candidate tag fetched from the triggering run. The trusted
signing workflow first attempted to supply an explicit `tag` context only to
that step. GitHub does not permit a workflow to override its default
`GITHUB_*` variables, so run
[`34719287176`](https://github.com/martinezelx/project-gitodile/actions/runs/34719287176)
also failed closed at the same check even though the step log displayed the
attempted override. The validator therefore accepts a dedicated `--ref-type`
argument: the tag-push workflow passes GitHub's actual ref type, while the
trusted downstream workflow passes `tag` only after fetching the exact tag
recorded by the successful source run. The exact tag, source SHA, approved-main
ancestry, metadata and byte-identical candidate identity remain revalidated
before any signing material is reachable. Executable tests cover both the
valid downstream revalidation and rejection of an explicit non-tag type.

The next exact candidate run
[`34719884465`](https://github.com/martinezelx/project-gitodile/actions/runs/34719884465)
passed the complete Windows/Linux build matrix. Signing run
[`34720357070`](https://github.com/martinezelx/project-gitodile/actions/runs/34720357070)
then passed source reauthorization and both OS-boundary jobs, and the maintainer
approved only `validation-updater-signing` after independently rehashing the
downloaded matrices. It failed while compiling the repository-owned signature
verifier because that Ubuntu job lacked the GTK/WebKit development packages
required by the Tauri crate; the credential presence guard had passed but no
signed matrix was emitted. The signing job now installs the same pinned-runner
system dependencies used by CI and builds the verifier with Cargo's lockfile
enforced before signing any final bytes.

Candidate run
[`34749564195`](https://github.com/martinezelx/project-gitodile/actions/runs/34749564195)
then passed the complete Windows/Linux matrix at exact source
`78d5497c69857aec0505e2cfabb10b8267425884`. Downstream signing run
[`34749958315`](https://github.com/martinezelx/project-gitodile/actions/runs/34749958315)
passed source reauthorization and both OS-boundary jobs. The downloaded
unsigned and OS-stage matrices passed local rehashing before the maintainer
approved only `validation-updater-signing`. The verifier compiled successfully,
but the signing loop failed closed before signing because CommonJS `require()`
interpreted the relative `os/.../evidence.json` path returned by `find` as a
package name. The loop now reads and parses that path explicitly through
`node:fs`; an executable workflow-contract assertion prevents the unsafe path
resolution from returning.

# Validation

Record the public-readiness diff and local checks first, without spending or
claiming release evidence. For the completed task, retain the exact security
settings snapshot, signed run and artifact identities, Windows/Linux installed
reports, controlled-host commit and anonymous hash verification, and complete
`pnpm run check` plus
`pnpm run check:publication` results.
