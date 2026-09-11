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

## Clearance decision

The history and current-tree review found no secret requiring rewrite or ref
removal. The accepted strategic/personal disclosure and MIT consequence above
permit the controlled visibility change after the hardening commit passes its
gates. Immediately after making the repository public, enable restricted
Actions, SHA enforcement, `main`/`v*` protection, reviewer-protected
environments, Secret Scanning with Push Protection, Dependabot and CodeQL, then
review their live results before introducing any credential.

The audit is not signing or release evidence. A real Authenticode certificate,
separate updater keys with tested encrypted recovery, working-name clearance,
controlled validation origin, destination-scoped credential and real Windows/
Linux test environments remain external gates.
