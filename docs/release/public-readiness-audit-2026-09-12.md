# Public-readiness audit — 2026-09-12

This record supports task 065-9-8's temporary-public preflight. It records
results and public identities only; it contains no suspected value, credential,
certificate, private key or authenticated response.

## Scope and accepted disclosure

The maintainer explicitly accepted temporary public distribution of the
reachable `martinezelx/project-gitodile` source under MIT, including the
tracked `work/` history, product strategy, design critiques and existing audit
records. Returning the repository to private cannot recall clones or forks or
revoke MIT rights already granted. The current tree contains 161 tracked
`work/` files among 640 tracked files.

The reachable author identity is `Luis Muñoz Martínez` with only the GitHub
noreply email `36764797+martinezelx@users.noreply.github.com`. Publication of
that name and noreply address is part of the maintainer's accepted disclosure.
Tests also contain synthetic credentials and personal-looking paths under
`example.test`, `example.com`, `C:\Users\Example\...` or redacted placeholders;
they exercise sanitization and are not operational secrets.

## Reachable refs and history review

The remote refs intended to become public were `main`,
`0.2.0-preview.1`, and tag `v0.1.0`; together they reached 204 unique commits
before the hardening push. The broader local `--all` review covered 243 unique
commits and 5,122 object-path entries, including local-only development refs.
Object-name review found no certificate/key, credential store, environment
file, database, archive or packaged desktop binary intended for publication.
The largest historical blobs were source files, below 400 KiB.

After hardening, the complete staged tracked tree was exported from the Git
index and scanned independently with the same pinned Gitleaks binary. It
scanned about 6.79 MB and reported zero findings; build outputs, dependency
caches and other ignored local files were outside this public-tree scan.

Gitleaks `v8.30.1` for Windows x86-64 was downloaded from its GitHub release and
its ZIP was verified as SHA-256
`d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e` against
the release checksum list. `gitleaks git --redact --log-opts=--all` reported 237
non-merge patch commits scanned, about 9.57 MB, and zero findings. The lower
count than `git rev-list --all --count` is the scanner's patch traversal omitting
merge commits; all reachable object paths and the current tree were reviewed
separately. `pnpm audit --prod` reported no known production vulnerabilities.

Targeted history searches found only synthetic authenticated URLs in tests and
documentation, using reserved/example hosts and dummy values. No provider
token, private-key signature, real authenticated URL, personal machine path,
deploy key, signing package or release binary was identified.

## Repository security baseline

Before hardening, the private GitHub Free repository had no repository
variables, Actions secrets, environments, deploy keys, rulesets or branch
protection. Actions allowed every provider and did not require SHA pinning.
Secret Scanning, Push Protection, Code Scanning and Dependabot controls were
not enabled or unavailable until public visibility.

The reviewed hardening change fixes every Action to a 40-character commit SHA,
removes direct shell interpolation of manual inputs, pins privileged workflow
runtime to its immutable workflow SHA, limits the release matrix to Windows and
Linux, adds CodeQL and Dependabot configuration, preserves read-only default
tokens and separates the destination credential from source-token validation.
No signing or publisher secret is configured by this change.

## Live public control activation

After the hardening commit was pushed and its local gates passed, the source
repository was made public under the accepted disclosure above. Actions now
allows only GitHub-owned Actions plus the exact pinned `pnpm/action-setup`,
`dtolnay/rust-toolchain` and `Swatinem/rust-cache` revisions used by this tree;
repository-wide SHA pinning is required. The default workflow token is
read-only and cannot approve pull requests.

Repository rulesets [Protect main](https://github.com/martinezelx/project-gitodile/settings/rules/22979730)
and [Protect release tags](https://github.com/martinezelx/project-gitodile/settings/rules/22979731)
are active. `main` rejects deletion and non-fast-forward changes and requires a
pull request, one approval, resolved review threads and the complete CI/CodeQL
status set for contributors without the repository-administrator bypass. Tags
matching `v*` can only be created, changed or deleted through that bypass. This
preserves the maintainer's explicitly requested direct-`main` operating model
without granting the same path to unreviewed contributors.

The five environments `production-windows-signing`,
`validation-updater-signing`, `production-updater-signing`,
`public-release-validation-draft` and `public-release-production` require the
named maintainer's approval, accept protected branches only and disallow an
administrator bypass. Self-review remains enabled because this personal
repository has a single eligible maintainer; every deployment still requires
the explicit environment approval. None contains a secret or variable at this
stage.

Secret Scanning and Push Protection are enabled and reported zero open secret
alerts. Public-repository code scanning became available without a separate
Advanced Security entitlement; [CodeQL run 34656016863](https://github.com/martinezelx/project-gitodile/actions/runs/34656016863)
then completed successfully. It exposed two instances of an incorrectly
escaped dynamic regular expression in a style architecture test; both were
corrected rather than dismissed. Secret-scanning validity checks remained
unavailable/disabled through the repository API, so the base scanner, push
protection and the independently checksum-verified Gitleaks history scan are
the recorded controls for this phase.

Dependabot version updates, vulnerability alerts and automated security fixes
are enabled. Its first public scan exposed vulnerable development versions of
`js-yaml`, Vitest's mocker and PostCSS. The tree now resolves `js-yaml` 4.3.2,
Vitest 4.1.11 and PostCSS 8.5.28; a full `pnpm audit` reports no known
vulnerabilities. The initial automatic jobs that said a security update was not
possible ran against the preceding lockfile and are retained as evidence rather
than concealed.

[Dependabot alert 9](https://github.com/martinezelx/project-gitodile/security/dependabot/9)
also identified the `glib::VariantStrIter` unsoundness in the Linux runtime
graph. The current Tauri 2.11.5 stack requires GTK/glib 0.18 and even Wry 0.57.0
still depends on GTK 0.18, so no patched version is resolvable. A source search
of GitOdile, Tauri, tauri-runtime-wry, Wry, WebKitGTK and GTK found no reference
to the affected `VariantStrIter` or `Variant::array_iter_str` API. The alert is
therefore dismissed specifically as `not_used`, with that bounded rationale,
and must be reassessed when Tauri migrates away from GTK/glib 0.18. This is an
explicit reachability mitigation, not a claim that the transitive crate itself
is patched.

## Clearance decision

The history and current-tree review found no secret requiring rewrite or ref
removal. The accepted strategic/personal disclosure and MIT consequence above
permit the controlled visibility change after the hardening commit passes its
gates. Immediately after making the repository public, enable restricted
Actions, SHA enforcement, `main`/`v*` protection, reviewer-protected
environments, Secret Scanning with Push Protection, Dependabot and CodeQL, then
review their live results before introducing any credential.

The audit and live controls are not signing or release evidence. A real Authenticode certificate,
separate updater keys with tested encrypted recovery, working-name clearance,
controlled validation origin, destination-scoped credential and real Windows/
Linux test environments remain external gates.
