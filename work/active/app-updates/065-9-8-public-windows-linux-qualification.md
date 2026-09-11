---
id: 065-9-8
title: Qualify public Windows and Linux updater delivery
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

Close epic 065-9 with real, signed Windows and Linux updater evidence and a
complete public preview release flow through `gitodile-feedback`, while keeping
macOS visibly disabled until it can be exercised on real hardware.

# Context

Child of [epic 065-9](../release-1.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
originally assumed a private source repository and a four-target production
matrix. This task amends both assumptions. The maintainer decided on 2026-09-11 to make the source repository
temporarily public so standard GitHub-hosted qualification runs do not consume
the private-repository minutes allowance, then return it to private after the
updater epic is evidenced. This temporary publication is an intentional source
distribution under the repository's MIT license: later changing visibility
cannot revoke rights to, or erase copies of, versions already obtained.

The maintainer has a real Windows device and can provide a Linux virtual
machine, but has no macOS device. The closeable initial delivery matrix is
therefore Windows x86-64 NSIS and Linux x86-64 AppImage. Both macOS targets must
remain planned but disabled: they are not qualified, advertised in a feed, or
published as supported packages. Their implementation preparation is retained
for a later independently tracked qualification task. This scoped closure does
not by itself satisfy any parent 1.0.0 criterion that still requires actual
macOS artifacts or runtime evidence.

# Scope

- Harden the repository for temporary public visibility before any signing or
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
  encrypted recovery, Windows Authenticode access, a controlled anonymous-read
  HTTPS validation origin, destination-scoped access to
  `martinezelx/gitodile-feedback`, and reviewer-protected GitHub environments.
  Never place secret values in source, task files, workflow inputs, logs or
  Actions artifacts.
- Build and retain the fixed signed validation pair
  `0.2.0-preview.2` / `0.2.0-preview.3` from exact tagged `main` commits. Create
  one controlled non-promoting bundle and exercise the complete installed A-to-B
  and failure matrix on real Windows and Linux environments.
- Exercise `Public release publishing` in `validation-draft` mode, including
  interrupted retry, immutable-asset reconciliation and exact hashes, without
  finalizing the draft or advancing a production feed. GitHub draft assets are
  not anonymously downloadable; anonymous verification belongs to the later
  finalized public previews.
- Build and publish at least two higher, successively versioned production-key
  previews through `gitodile-feedback` so a normally installed public build can
  update through the real public `preview.json`. Unless a later reviewed version
  plan supersedes it, use `0.2.0-preview.4` and `0.2.0-preview.5`; never reuse or
  relabel the validation-key packages.
- Record exact run URLs, tags, full source SHAs, matrix and artifact hashes,
  public signing identities, installed versions, preservation checks, failure
  results, public release/tag/feed commits and anonymous download evidence.
  Reconcile and close 065-9-5, 065-9-6 and 065-9-7 only when their remaining
  enabled-target criteria are proven, then map every amended 065-9 epic
  criterion to durable evidence before closing the epic.
- After evidence retention and an explicit maintainer decision, return the
  source repository to private without changing or withdrawing the public
  feedback releases and feeds. Document that already distributed MIT-licensed
  source copies remain valid and that future private-repository Actions usage
  is quota-limited again.

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
  Authenticode and installed updater evidence.
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
- [ ] Real signed `0.2.0-preview.2` and `0.2.0-preview.3` packages exist for both
      enabled targets with complete build provenance, updater verification and
      Windows Authenticode evidence. The controlled bundle changes no package
      byte and cannot promote a public feed.
- [ ] Real Windows and Linux A-to-B reports prove the running version after
      handoff and preserve settings, sessions, drafts, operations, helpers,
      dirty tracked/untracked files and Git history. Every required failure case
      records no false success and no forced downgrade.
- [ ] A validation draft proves safe publisher retries, immutable assets and
      complete manifests without finalization, production feed promotion or
      private/credential disclosure. Anonymous downloads are not claimed for a
      GitHub draft and are instead proven by the finalized public previews.
- [ ] Two successive production-key preview releases are publicly available in
      `martinezelx/gitodile-feedback`; their public tags target public commits,
      assets download anonymously with recorded hashes, and `preview.json`
      advances only after the complete enabled matrix succeeds.
- [ ] A normal Windows installation updates end to end between those public
      previews through GitOdile and truthfully reports the running version after
      restart. The same proof passes on the Linux AppImage VM before Linux is
      considered enabled.
- [ ] The qualification registry contains exact schema-valid evidence for only
      the enabled targets and an explicit non-qualified state for macOS.
      Production promotion fails closed for any target not in the reviewed
      enabled matrix and cannot silently drop a required row.
- [ ] 065-9-5, 065-9-6 and 065-9-7 are closed only after their remaining real
      evidence is linked. Every amended parent criterion maps to a completed
      child record, `pnpm run check` and `pnpm run check:publication` pass on the
      exact release commit, and no macOS or 1.0.0 readiness is claimed.
- [ ] Returning the source repository to private, if performed, happens only
      after evidence retention and explicit maintainer approval; public updater
      assets and feeds remain anonymously usable and the runbook explains the
      resulting Actions quota behavior.

# Dependencies

- 065-9-1 through 065-9-7 and their existing contracts/runbooks.
- Maintainer acceptance of temporary public MIT distribution and the selected
  strategic documentation exposure.
- A real Windows code-signing certificate, separate validation/production
  updater keys and verified backups, controlled HTTPS hosting, protected
  GitHub environments and a destination-scoped publisher credential.
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
between source-run validation and the destination credential. Live GitHub
controls still must be enabled and reviewed after public visibility and before
any credential is introduced.

# Validation

Record the public-readiness diff and local checks first, without spending or
claiming release evidence. For the completed task, retain the exact security
settings snapshot, signed run and artifact identities, Windows/Linux installed
reports, validation-draft and production publication run URLs, public feedback
tag/release/feed commits, anonymous hash verification, final repository
visibility decision, and complete `pnpm run check` plus
`pnpm run check:publication` results.
