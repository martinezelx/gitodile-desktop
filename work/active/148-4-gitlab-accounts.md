---
id: 148-4
title: Connect GitLab through shared provider accounts
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

# GitHub-first sequencing (2026-10-04)

The user approved finishing GitHub connection and repository discovery before
GitLab. Complete [148-9](../done/148-9-github-token-connections.md) and
[148-5](../done/148-5-provider-repository-browser.md) first. PR/Actions screens are later
work and do not block starting GitLab once that integration is closed.

Extend the same repository-browser port/controller with GitLab discovery and
native URL validation as part of this provider task. Reuse GitHub's browser/token
connection model where appropriate, with explicit per-host secret namespaces
and credential-source identities. glab's single verified CLI identity remains
a restriction of its browser adapter, not a reason to silently change a project's
account or to route a native token through glab. No GitLab implementation is
included in the preceding GitHub work.

# Goal

Extend [epic 148](148-connect-github-account.md)'s account/HTTPS-access foundation
to GitLab.com, preserving the existing GitHub integration.

# User outcome

Connect, inspect and disconnect GitLab accounts, and choose the
account used when cloning or transferring a project's changes over HTTPS.

# Context

The user requested GitLab and Bitbucket as the first next milestone on
2026-10-04. These are hosting providers, not replacements for system Git.
[148-3](../done/148-3-shared-accounts-and-git-access.md) completed the shared
registry, catalog, picker, persistent project bindings and Git helper.
Create adapters behind those contracts rather than a second account store,
helper protocol or project-selection UI for each provider.

On 2026-10-04 the user approved separate provider tasks after the feasibility
review. This task retains ID 148-4; GitHub completion now precedes it. Bitbucket Cloud
is tracked independently in [148-8](../blocked/148-8-bitbucket-accounts.md).

The user subsequently chose GitHub through `gh` and GitLab through `glab` as
the only providers in the current milestone, including repository discovery.
Bitbucket is deferred. This first GitLab adapter uses one currently verified
GitLab.com CLI identity; the shared contracts remain capable of later adapters.

# Scope

- Reuse GitLab CLI (`glab`) browser/device authorization for GitLab.com.
  Add local detection, compatibility checks and supported installation guidance.
  Inspect the required version, permissions, refresh behavior and Git access;
  never assume glab offers GitHub CLI's multi-account or credential behavior.
- Implement GitLab.com account connection, cached identity,
  avatar fallback, explicit verification and targeted sign-out in Settings.
- Extend native provider contracts only where required for provider identities,
  hosts and Git credential usernames; GitLab identities must not be forced
  through GitHub's login grammar.
- Keep secrets native and out of IPC, diagnostics and process arguments/env.
  If GitOdile owns credentials, use native OS secret storage without an
  undisclosed plaintext fallback. Document permissions and shared CLI sessions.
- Reuse clone/project account selection, with explicit provider/host validation,
  no fallback to another identity and no global Git or SSH changes.
- Extend the typed repository-browser API from [148-5](../done/148-5-provider-repository-browser.md)
  using the same verified identity as HTTPS access. Retain bounded output,
  cancellation, permission handling and explicit network actions.
- Detect changed external glab identity and retain an unavailable project binding;
  require an explicit selection rather than sending another account's credential.
- Reuse glab's registered application; no GitOdile OAuth registration or
  real-account mutation is implied by this implementation task.

# Out of scope

- New repository-browser screens, PR/MR and CI screens (the subsequent tasks).
  GitLab discovery in the existing clone browser is in scope.
- Bitbucket account integration (task 148-8), self-hosted GitLab and GitHub Enterprise.
- GitOdile-owned GitHub OAuth (still a later epic enhancement).
- GitOdile-owned GitLab OAuth and multiple simultaneous GitLab.com identities.

# Acceptance criteria

- [ ] GitLab implements shared account/access contracts; GitHub still works.
- [ ] Account identity, avatar, connection status and targeted sign-out are clear
  in English/Spanish, with keyboard access and empty/loading/error/offline states.
- [ ] One verified glab GitLab.com identity can be selected per project; HTTPS
  clone/fetch/push and subsequent API discovery use exactly that identity.
- [ ] An external CLI identity change makes old bindings unavailable; no transfer
  or API request silently switches identity. GitHub multiple-account support remains.
- [ ] Missing/old glab has actionable local diagnostics and installation guidance;
  browser connection explains shared CLI state, permissions and storage fallback.
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

Completed task 148-3; a compatible installed glab is required for GitLab connection.
Verify the chosen version's authorization and credential interfaces before
promising a working browser flow; document unsupported states honestly.

# Execution handoff

Implement this file in the existing approved release branch. Read AGENTS.md and
the linked owners first, inspect current APIs, then implement and verify the
smallest coherent shared adapters. Do not mutate real accounts
just to make tests pass. Keep acceptance and validation evidence current.

# Approved authorization scope (2026-10-04)

The user chose glab after the task split and deferred other providers. This
explicit scope change narrows the first GitLab integration to one CLI identity:

- Reusing GitLab CLI (`glab`) requires installation, like the current GitHub
  adapter's `gh` dependency. It offers browser/device authorization on GitLab.com
  without a new GitOdile application registration. Inspect the supported version,
  permissions, refresh lifecycle and any shared-session changes; disclose its
  possible plaintext credential fallback. See [GitLab authentication](https://docs.gitlab.com/cli/authentication/).
- The inspected [glab configuration](https://gitlab.com/gitlab-org/cli/-/raw/main/internal/config/config.go)
  keys credentials by host rather than offering gh's exact saved-user lookup.
  Do not claim multiple GitLab.com accounts are supported by merely wrapping
  its default session or change that session before every transfer.
- GitOdile-owned [OAuth with PKCE](https://docs.gitlab.com/api/oauth2/)
  remains future scope if independent multi-account support is needed. It is
  not part of this implementation or a prerequisite for the approved glab route.

When the external CLI session changes, identity revalidation and stale binding
handling must protect the previously selected account. Do not hide the single
GitLab account limit or weaken GitHub's existing multi-account behavior.

# Implementation notes

Pending implementation. The approved authorization route is glab; extend the
repository browser completed for GitHub using its account/access contract.

# Validation

Pending implementation; no provider qualification is claimed.
