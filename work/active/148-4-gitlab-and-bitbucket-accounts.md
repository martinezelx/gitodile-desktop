---
id: 148-4
title: Connect GitLab and Bitbucket through shared provider accounts
status: active
priority: high
type: feature
areas:
  - credentials
  - frontend
  - platform
created: 2026-10-04
completed:
parent: "148"
queue: "01"
---

# Goal

Extend [epic 148](148-connect-github-account.md)'s account/HTTPS-access foundation
to GitLab.com and Bitbucket Cloud, preserving the existing GitHub integration.

# User outcome

Connect, inspect and disconnect accounts for each provider, and choose the
account used when cloning or transferring a project's changes over HTTPS.

# Context

The user requested GitLab and Bitbucket as the first next milestone on
2026-10-04. These are hosting providers, not replacements for system Git.
[148-3](../done/148-3-shared-accounts-and-git-access.md) completed the shared
registry, catalog, picker, persistent project bindings and Git helper.
Create adapters behind those contracts rather than a second account store,
helper protocol or project-selection UI for each provider.

# Scope

- Inspect current provider authorization/API documentation, permissions,
  credential lifecycle and HTTPS Git support before choosing each adapter.
  Prefer browser connection when supported; never assume a provider's CLI
  offers GitHub CLI's multi-account or credential behavior.
- Implement GitLab.com and Bitbucket Cloud account connection, cached identity,
  avatar fallback, explicit verification and targeted sign-out in Settings.
- Extend native provider contracts only where required for provider identities,
  hosts and Git credential usernames; Bitbucket UUIDs/identifiers must not be
  forced through GitHub's login grammar or username semantics.
- Keep secrets native and out of IPC, diagnostics and process arguments/env.
  If GitOdile owns credentials, use native OS secret storage without an
  undisclosed plaintext fallback. Document permissions and shared CLI sessions.
- Reuse clone/project account selection, with explicit provider/host validation,
  no fallback to another identity and no global Git or SSH changes.
- Record any required application registration as a maintainer prerequisite;
  end users must not have to register GitOdile themselves. No external app
  registration or real-account mutation is implied by this implementation task.

# Out of scope

- Repository browser, PR/MR and CI screens (the subsequent tasks).
- Self-hosted GitLab, Bitbucket Data Center and GitHub Enterprise.
- GitOdile-owned GitHub OAuth (still a later epic enhancement).

# Acceptance criteria

- [ ] Both providers implement shared account/access contracts; GitHub still works.
- [ ] Account identity, avatar, connection status and targeted sign-out are clear
  in English/Spanish, with keyboard access and empty/loading/error/offline states.
- [ ] Multiple saved identities can be selected per project independently of
  global CLI state; HTTPS clone/fetch/push use exactly the chosen identity.
- [ ] Provider-specific credential usernames and stable identifiers are tested.
- [ ] Wrong host/protocol, malformed inputs, missing/revoked credentials and
  stale selection cannot send a secret or silently choose another account.
- [ ] Cancellation, timeout, permission denial and missing registration/config
  provide actionable states, without asking users to paste secrets into logs.
- [ ] Tests use fake providers/isolated Git; approved real flows are exercised
  where available, and Windows/Linux qualification evidence or limits are recorded.
- [ ] Documentation/ADR, IPC contracts and `pnpm run check` are updated and pass.

# Relevant files

- [ADR 0022](../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- [Design](../../DESIGN.md)
- [Native registry](../../src-tauri/src/hosting.rs)
- [Shared credentials](../../src-tauri/src/credentials.rs)
- [GitHub adapter](../../src-tauri/src/github_auth.rs)
- [Shared frontend accounts](../../src/features/accounts/index.ts)

# Dependencies

Completed task 148-3. Resolve provider application configuration/registration
requirements before promising a working browser flow; document blockers honestly.

# Execution handoff

Implement this file in the existing approved release branch. Read AGENTS.md and
the linked owners first, inspect current APIs, then implement and verify the
smallest coherent shared adapters. Do not start 148-5 or mutate real accounts
just to make tests pass. Keep acceptance and validation evidence current.

# Implementation notes

Pending implementation.

# Validation

Pending implementation; no provider qualification is claimed.
