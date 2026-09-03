# ADR 0001: Bundle Git and retain the Rust command backend

- Status: accepted
- Date: 2026-07-24
- Revised: 2026-09-02
- Implementation: pending; production still uses system Git.

## Context

GitOdile already invokes the system Git executable through its bounded Rust
runner and policy-aware facade. Repository operations, parsers, recovery plans,
and tests are built around the reference Git CLI. Requiring users to install
Git separately weakens the beginner-friendly onboarding experience.

The problem to solve is distribution of this existing engine, not replacement
of its behavior. A private copy of Git can remove the installation prerequisite
while preserving the current operation implementation and safety boundaries.

### Decision history

The original 2026-07-24 proposal prioritized a bounded `gix` repository-opening
experiment, followed by a progressive hybrid library/CLI backend. It was not
accepted. On 2026-09-02, the product decision changed to bundling Git instead.
This revision replaces that proposed direction and its experiment requirement;
it does not claim that either approach has been implemented. The original
filename is retained to preserve references to ADR 0001.

The subsequent platform discussion selected the full Git for Windows portable
distribution. Ubuntu and Fedora packages are the requested Linux starting
points, not evidence of a single portable Linux artifact. The macOS supplier
remains undecided.

### Evidence informing the revision

- [Fork's release notes](https://git-fork.com/releasenoteswin) document an
  internal Git instance and selection of another instance.
- [Sourcetree](https://support.atlassian.com/sourcetree/kb/using-embedded-git-or-system-git-in-sourcetree/)
  similarly supports embedded Git and system Git.
- [GitKraken's migration rationale](https://www.gitkraken.com/blog/gitkraken-client-migrating-from-libgit2-to-git-executable)
  describes moving from libgit2 toward Git CLI for compatibility, LFS, SSH,
  and access to new Git features.
- GitButler's [development dependencies](https://github.com/gitbutlerapp/gitbutler/blob/master/Cargo.toml)
  combine `gix` and `git2`, but its [remote-operation documentation](https://docs.gitbutler.com/troubleshooting/fetch-push)
  explicitly uses system Git and its authentication. Its hybrid model is not
  evidence that embedded libraries alone remove the Git installation need.

The reusable principle is to retain the reference CLI where compatibility is
important. GitOdile does not need another client's workflow engine or module
structure to implement private Git distribution.

## Decision

1. Bundle a private, maintained distribution of the reference Git CLI with
   GitOdile and use it by default. Normal supported local and remote workflows
   must not require a separate installation of Git.
2. Keep execution inside Rust through `git_command.rs` and `git.rs`, preserving
   policy checks, repository coordination, recovery, bounded output, timeouts,
   cancellation, and typed errors. Do not move Git execution into React.
3. Adapt executable resolution and the child-process environment to the bundled
   distribution. Do not rewrite domain operations or create a second engine.
4. Retain system Git as an explicit advanced compatibility option, with clear
   source, path, and version diagnostics. Do not silently switch engines or
   retry a mutation with another executable after a failure. Keep the selected
   executable stable throughout a planned operation.
5. Update the bundled Git distribution with GitOdile releases initially. Do not
   add an independent runtime downloader/updater. Assess upstream security
   releases promptly and ship urgent application updates when required; every
   upstream feature release does not require an immediate GitOdile release.
6. Accept increased installer and installed size in exchange for simpler
   onboarding and a version-controlled runtime. Measure the increase before
   release rather than treating it as negligible.
7. Do not port Dugite, add a Node runtime, or introduce `gix`/`git2` as part of
   this change. Future library-based optimization requires a separate measured
   justification and decision.

### Distribution provenance and platform packaging

"Official Git" identifies the reference implementation. It does not imply that
the Git project publishes a single portable binary package for every OS.
A distribution contains the executable plus its required libraries, helpers,
configuration, templates, and other resources, not merely `git.exe` or `git`.

Prefer maintained artifacts from the relevant Git/platform project when
available. Do not maintain a custom Git engine or fork its behavior.

- **Windows:** [Git's download page](https://git-scm.com/install/windows) links
  to Git for Windows portable packages for x64 and ARM64. Use the full portable
  distribution published by Git for Windows, not MinGit or a Dugite package.
  The distribution choice is accepted; version pinning, helper inventory,
  supported architectures, and packaged-runtime validation remain release gates.
  [MinGit](https://gitforwindows.org/mingit.html) is another distribution from
  Git for Windows, intentionally reduced for applications. It was not selected
  because compatibility with hooks and supporting tools takes priority over
  minimizing the package size.
- **macOS:** [Git's installation page](https://git-scm.com/install/mac)
  explicitly says binary distributions are provided by third parties. A
  maintained relocatable package or a build from verified upstream source
  needs to be selected and validated; installing Homebrew or Xcode on the
  user's machine would not meet this decision. Existing examples include
  GitHub's public [dugite-native macOS packages](https://github.com/desktop/dugite-native/releases)
  for Intel and Apple Silicon, and Tower's documented
  [universal bundled Git](https://www.git-tower.com/updates/tower3-mac/stable/releases).
  These demonstrate packaging approaches, not an approved macOS supplier for
  GitOdile. Reusing GitHub's native artifacts would not require Dugite or Node.
  GitHub's public [macOS build recipe](https://github.com/desktop/dugite-native/blob/main/script/build-macos.sh)
  compiles Git and deliberately avoids linking against Homebrew-installed curl.
  Building verified upstream Git in macOS CI is a packaging alternative, not a
  new Git implementation; either route needs dependency/relocation checks and
  signing validation for the final application.
- **Linux:** [Git's installation page](https://git-scm.com/install/linux)
  primarily recommends distribution package managers. Start evaluation with
  Ubuntu and Fedora packages as requested. Their package provenance does not
  establish relocatability: dependencies, helpers, fixed paths, distribution
  release, and ABI compatibility must be checked before bundling. Do not treat
  their packages as interchangeable or install system Git as a substitute for
  the agreed private-runtime model. The exact source packages and whether one
  validated runtime can serve both distributions remain open.

Windows distribution provenance is settled. Exact artifacts, versions,
supported architectures, helper inventories, and the macOS/Linux packaging
choices are still open. Selecting `dugite-native` or a custom build pipeline is
not an accepted decision here. Using a maintained third-party build of Git, if
needed, does not require adopting its JavaScript wrapper.

### Safety and configuration constraints

- Scope executable paths and environment changes to GitOdile's child processes.
  Do not install Git globally or alter the user's global `PATH` as a side effect.
- Preserve applicable user/repository configuration and document system-level
  configuration precedence for the bundled distribution. Never silently disable
  hooks, signing, filters, certificate verification, or credential helpers.
- Verify the actual HTTPS, SSH, Git LFS, credential-helper, and certificate
  contents of each platform artifact; do not assume identical contents.
- Report missing external tools honestly. A hook that needs Node or Python,
  a custom filter, or a configured signing tool can still require that tool;
  removing the Git prerequisite is not a promise to bundle every project tool.
- Pin artifact versions and trusted checksums in the build inputs, verify
  provenance, and include the applicable licenses, notices, and corresponding
  source distribution required by the redistributed components. The MIT license
  of a wrapper does not cover every bundled component.

## Validation before implementation rollout

The direction is accepted, but no platform is release-ready on that basis alone.
Before making bundled Git the production default:

1. Record the selected artifact and full helper inventory for each supported
   OS/architecture, including provenance and redistribution requirements.
2. Validate a packaged Tauri application on clean machines without system Git.
   A developer test that only removes Git from `PATH` is insufficient evidence.
3. Run existing repository/operation tests against the selected executable,
   retaining tests for the explicit system-Git option and all safety invariants.
4. Exercise open/create/clone, status/diffs/history, save, branches, recovery,
   fetch and publish; include linked worktrees, bare repositories, unborn and
   detached HEAD states, Unicode/spaced paths, and platform filesystem behavior.
5. Test HTTPS credentials, SSH agents/configuration, LFS, hooks, filters,
   signing, proxies and custom certificate authorities. Check that subprocesses
   do not accidentally use a developer's installed Git or helpers.
6. Verify relocation, executable permissions/symlinks, signing/notarization as
   applicable, missing/corrupt runtime diagnostics, and application upgrades.
7. Measure download/installed size and representative operation performance.
   Update onboarding, settings, and current-state documentation only when the
   corresponding behavior is implemented and validated.

## Consequences

### Positive

- Beginners can use supported workflows without a separate Git installation.
- Existing CLI integration, domain logic, parsers, and safety tests remain useful.
- GitOdile can test a known runtime version instead of relying entirely on the
  user's installed version or shell path.
- No additional Git implementation or Node backend is introduced.

### Negative

- Installer and installed size grow, and every target needs packaging validation.
- GitOdile owns security updates and redistribution compliance for bundled tools.
- Credentials, configuration, and external-tool discovery still need careful
  integration; shipping Git does not make all environments identical.
- The explicit system-Git option adds a compatibility path to test, although
  both choices use the same CLI-based backend.

## Alternatives considered

### Continue with system Git only

This remains the current implementation and an advanced future option, but
does not meet the desired installation experience as the default.

### Progressive `gix`/CLI hybrid or migration to `git2`

Not selected for this problem. These are independent Git implementations and
would require operation-level migration and compatibility testing. They may
offer future benefits, but are unnecessary to provide an application-owned Git.

### Port Dugite to Rust

Not selected. GitOdile already owns process execution and error handling.
Implement only the missing runtime resolution/environment behavior appropriate
to the chosen package, rather than maintaining a compatible port of a Node API.

### Build Git and all helper distributions ourselves

Not the initial preference. Reuse maintained platform artifacts where possible.
Building verified upstream source remains an option for a target lacking a
suitable package, subject to an explicit packaging decision and CI ownership.

### Implement a custom Git engine

Rejected. Reimplementing Git storage, merging, protocols, and compatibility
would consume effort unrelated to GitOdile's product differentiation.
