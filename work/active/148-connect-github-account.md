---
id: 148
title: Complete GitHub integration with reusable provider accounts
status: active
priority: high
type: epic
areas:
  - frontend
  - credentials
  - platform
created: 2026-10-03
completed:
parent:
queue:
---

# Epic expansion (2026-10-04)

The user requested a complete hosting integration, beginning with GitHub and
preparing shared accounts/access for GitLab and Bitbucket. Reopen task 148 as
an epic; the original completed implementation and evidence below remain historical.

The user clarified that the existing browser login should remain available
without registering GitOdile as another OAuth client. The GitHub adapter therefore
continues to reuse gh, behind the shared contract in
[ADR 0022](../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md).

Milestones, in dependency order:

- [x] Browser connection and cached account status (original task 148).
- [x] Avatars and targeted sign-out ([148-1](../done/148-1-github-avatar-and-sign-out.md)).
- [x] Saved account rows and shared gh switching ([148-2](../done/148-2-github-account-rows-and-switching.md)).
- [x] Shared accounts and project-scoped Git access ([148-3](../done/148-3-shared-accounts-and-git-access.md)).
- [ ] GitLab.com and Bitbucket Cloud accounts/access ([148-4](148-4-gitlab-and-bitbucket-accounts.md)).
- [ ] Repository discovery across all three providers ([148-5](148-5-provider-repository-browser.md)).
- [ ] Pull/merge requests: list/details/create/checks and safe branch opening ([148-6](148-6-pull-request-screen.md)).
- [ ] Actions/CI: runs/status/logs and planned rerun/cancel/dispatch ([148-7](148-7-actions-and-ci-screen.md)).
- [ ] Subsequent scope: GitOdile-owned GitHub authorization, with browser sign-in independent of gh (see below).

Each child owns qualification of its account/access/API behavior across supported
platforms and must record deferred evidence honestly. GitHub Enterprise and independently branded
OAuth remain subsequent scope. Provider features use shared accounts/access
but keep their own API permissions and operation plans. No current account row
may imply these screens already exist.

## Comparative implementation references

The approved research informs ownership and workflow, not copied code or assets:

| Reference | Principle used in GitOdile |
| --- | --- |
| [GitHub Desktop](https://github.com/desktop/desktop/blob/development/app/src/lib/trampoline/trampoline-credential-helper.ts) | An app-owned helper coordinates the chosen identity with system Git. |
| [GitKraken Desktop](https://help.gitkraken.com/gitkraken-desktop/github-gitkraken-desktop/) | Provider accounts support repository discovery and subsequent collaboration features. |
| [SourceTree](https://support.atlassian.com/sourcetree/kb/viewing-remote-hosted-repositories/) | A remote repository browser is distinct from local project operations. |
| [Tower](https://www.git-tower.com/help/guides/remote-repositories/connect-authenticate/windows) | Hosting account connection, HTTPS authentication and SSH configuration need clear boundaries. |
| [GitButler](https://docs.gitbutler.com/features/forge-integration/github-integration) | Multiple accounts and project selection belong in a shared hosting layer. |

GitOdile retains the user's accepted gh browser login now. Own OAuth is a future
adapter decision, not a requirement imposed on users or a reason to block this epic.

## Pending: GitOdile-owned GitHub authorization

Recorded at the user's request on 2026-10-04. Keep the current gh browser login
working; this is future work, not an instruction to implement or register an app now.
It does not block completion of the current account/HTTPS-access foundation.

- [ ] Register GitOdile's own GitHub authorization application and choose the
  supported browser flow; users must not need to register an application themselves.
- [ ] Implement authorization behind the shared provider account/access contracts,
  preserving project account selection and avoiding a separate accounts subsystem.
- [ ] Manage credentials in native OS secret storage, with cancellation, denied
  authorization, expired/revoked access and sign-out handled explicitly.
- [ ] Provide an explicit transition for existing gh accounts without silently
  copying credentials or changing the user's gh session or Git configuration.
- [ ] Verify browser sign-in and HTTPS access with gh absent, including supported
  platforms, and update the security/architecture decision before implementation.

The account/HTTPS-access foundation is complete in task 148-3. The expanded
integration remains open for the four linked children and their platform
qualification; independently branded authorization is a later enhancement.

# Original completed goal

The historical sections below describe the original account milestone, not the
scope of the newly queued provider/discovery/PR/CI children.

Detect and connect the active github.com GitHub CLI account from Settings,
with a reusable native authentication boundary for future PRs and Actions.

# User outcome

Users can connect in their system browser and see which GitHub account will be
used, without copying a token or changing Git credentials.

# Context

The user approved this follow-up to [task 146](../done/146-github-cli-and-tooling-settings.md)
on 2026-10-03 and explicitly requested immediate implementation. Work uses the
existing release/0.3.1 branch. The task took the first queue position while active;
existing queued work retained its relative order.

# Scope

- Explicit account detection and connection checking; cached Settings rendering.
- Bounded, cancellable browser login with a temporary code and strict URL validation.
- A shared GitHub authentication service and feature-owned typed port/controller.
- Honest shared-session, environment-credential and plaintext-storage disclosures.
- English/Spanish states, keyboard access, tests and durable architecture documentation.

# Out of scope

- PRs/Actions screens, GitOdile account login, custom OAuth or token import.
- Git credential setup, SSH keys, global account switching or logout.
- GitHub Enterprise, publishing this release, unrelated HTML explorations.

# Acceptance criteria

- [x] Existing active accounts are detected only after explicit network action.
- [x] Compatible gh is verified without contacting GitHub; old versions request update.
- [x] Login shows a copyable code and opens only the official device authorization URL.
- [x] Concurrent actions, cancellation, timeout, denied login and browser failure are handled.
- [x] Cached account identity survives Settings navigation; hidden Settings suspends polling.
- [x] No access token, raw output or secrets cross IPC or enter diagnostics.
- [x] Git configuration, credential helpers and SSH keys are unchanged.
- [x] Shared session and plaintext fallback are disclosed before login and after detection.
- [x] Native fake-process integration and frontend regression checks pass.
- [x] The development app is exercised where the available UI tools permit it.
- [x] pnpm run check passes and platform validation limits are recorded.

# Relevant files

- [Architecture](../../docs/ARCHITECTURE.md)
- [Design](../../DESIGN.md)
- [ADR 0020](../../docs/adr/0020-prepare-optional-github-cli-tooling.md)

# Dependencies

Completed optional gh tooling; system gh with JSON authentication-status support.

# Decisions

- Reuse gh's active session without exporting, importing or storing an access token.
- Prompt before browser login about shared state and gh's possible plaintext fallback.
- Retain a previous known account on network failure; distinguish invalid authentication.
- Do not create another branch/worktree or run a real login during automated tests.

# Implementation notes

Implemented the native memory-only authentication service, fixed command plans,
bounded streaming, exact-operation cancellation and account/status parsing.
The feature-owned controller and eager Settings body use the existing composition
root, translations, design tokens and exact browser capability scope.

The noninteractive gh login and secure-storage behavior were inspected in GitHub
CLI's public implementation. gh 2.80 lacks auth-status JSON, so local capability
detection precedes auth actions. See
[ADR 0021](../../docs/adr/0021-reuse-github-cli-authentication.md).

# Validation

- Focused native authentication tests: 8 passed, including fake executables,
  streamed device-code output, overflow, unsupported CLI, denied login,
  timeout/cancellation, retained identity and secret-safe serialization.
- Full frontend suite: 122 files / 1,199 tests passed; TypeScript, architecture
  checks and production build passed.
- Windows Tauri development app: inspected initial account state, expanded and
  dismissed consent without login, detected the existing account through the
  native service, and verified it remained visible after General/GitHub navigation.
- gh 2.96.0 with an isolated empty temporary configuration returned `hosts: {}`
  with exit zero, confirming the signed-out parser contract without changing
  the user's configuration.
- A new OAuth grant was not performed against the user's account. Device login
  is covered by fake-process and frontend interaction tests; real macOS/Linux
  browser and credential-store qualification remains deferred under ADR 0006.
- `pnpm run check` passed: documentation, release/icon contracts, architecture,
  TypeScript, all 1,199 frontend tests, production build, Rust formatting,
  Clippy with warnings denied, and all 497 native tests. The 8 authentication
  tests are included in that native total.

# First epic commit review (2026-10-04)

The user requested four executable children for subsequent conversations, then
a review and first commit of the pending epic implementation on release/0.3.1.
Tasks 148-4 through 148-7 take queue positions 01–04; previous work keeps its
relative order. PRs and CI have separate owners/plans; qualification belongs to
each child. Own GitHub authorization remains a later explicit pending item.

Reviewed the native account/authentication owners, Git helper and transfer
facade, clone planning/publication, IPC/admission inventory, frontend receipts,
Settings/account selection, permissions, tests and documentation. Corrected:

- A completed clone with failed account persistence returned an error that the
  UI localized generically and offered to retry. Preserve its verified result
  and destination instead, finish any staging cleanup, then explain manual
  account setup without cloning or opening automatically with another identity.
- A failed fresh account check retained old connected flags in the catalog.
  Keep identity/avatar metadata, mark those rows unchecked and require explicit
  verification before selecting them again; existing project bindings remain.
- Reject credentials/query parameters/wrong hosts or ports for selected-account
  clone previews, consistently with the transfer helper's validation.
- Installation guidance now points below the account body in both languages.

Validation: `pnpm run check` passed after those corrections: documentation and
release/icon contracts, frontend architecture, strict TypeScript, 123 frontend
files / 1,220 tests, production build, Rust formatting, Clippy with warnings
denied, 522 native library tests and one actual-binary/system-Git helper test
(523 native tests total). Focused UI regressions also cover account persistence
failure with and without staging cleanup. No new OAuth grant, real sign-out,
private clone or publishing is part of these checks. Packaged macOS/Linux
qualification remains deferred as documented in ADR 0006.

Windows Tauri smoke check after the aggregate gate: the account body appears
before installed gh 2.96.0, with accessible account/status labels and matching
right-aligned actions. Arrival shows the unchecked cached state without an
authentication action; Settings dismissal by Escape was exercised. New warning
and failure variants are covered by isolated automated UI/native fixtures.

Exploratory root HTML files and the mock screenshot stay in the workspace,
outside the production implementation commit. No remote push is requested.
