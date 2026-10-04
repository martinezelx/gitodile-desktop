# ADR 0021: Reuse GitHub CLI authentication for GitHub features

- Status: accepted
- Date: 2026-10-03

## Context

GitOdile needs an account connection ahead of PRs and Actions. Optional gh
tooling exists under [ADR 0020](0020-prepare-optional-github-cli-tooling.md).
Installing gh, GitHub API authorization, Git remote credentials and a GitOdile
account are separate concerns.

The concrete desktop problem is browser authorization without a terminal,
cached account state across Settings navigation, and keeping secrets outside
the renderer. [GitButler's registration](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/gitbutler-tauri/src/main.rs)
separates GitHub initiation, status and account commands. Extract that ownership
principle; no source or assets are adapted.

## Decision

Reuse gh's active github.com session. Never export/import its token, request a
PAT, store a second secret, configure Git credentials or generate/upload SSH keys.
`github_auth.rs` owns a memory-only service with five narrow IPC commands: cached
state, explicit check, login, targeted sign-out and cancellation by exact operation id. Both output
streams are drained with bounded memory; raw stderr is never returned or logged.
Child debug output is disabled. Fixed PATH-first discovery shares tooling's policy
and falls back only when an executable is missing.

Probe local `gh auth status --help` for JSON support; gh 2.80 lacks it. Status
checks use `--active --hostname github.com --json hosts`, never `--show-token`.
Decode entry states rather than relying on exit zero. A failed network check
preserves the last known identity without calling it connected.

Login runs `gh auth login --web --hostname github.com --skip-ssh-key
--clipboard=false` with null stdin and disabled prompts, without a protocol flag
or additional scopes. Extract only a strictly validated temporary code from the
fixed English output. The browser destination is the constant
`https://github.com/login/device`, never an arbitrary output URL. The human-output
adapter has fake-process coverage and must be requalified if gh changes it.
The source contract was inspected against
[gh 2.96](https://github.com/cli/cli/tree/v2.96.0/pkg/cmd/auth).

Checks have short deadlines and drain for app installation. Login has a 15-minute
deadline and holds an installation blocker until the child exits. Actions are
serialized; cancellation reaps the child before releasing its worker and clears
the code. Cancellation may race with persistence, so it asks the user to check
the shared authorization rather than claiming nothing changed or running logout.

`features/github` owns its typed port, controller, eager account body, copy and
styles. The app composition root injects this body into Settings. Opening it
reads native memory only; hidden Settings suspends cached polling. Detection,
checks and login are explicit user network actions.

## Consequences

- GitHub authorizes **GitHub CLI**, with its default `repo`, `read:org` and `gist`
  scopes. This is not a GitOdile-branded authorization.
- The session is shared with other gh consumers. Targeted local sign-out is
  supported after confirmation; the account picker was initially deferred and
  is added by the follow-up below. Do not
  describe shared logout as an integration-only toggle.
- gh can fall back to a plaintext file if its system credential store fails.
  Disclose this before login and warn when status reports file storage. This
  decision accepts gh's persistence policy; it does not guarantee no plaintext.
  Unknown storage is reported honestly, without exposing a local credential path.
- Environment tokens take precedence. Show the source category, never its value,
  and block login/sign-out when environment credentials control authentication.
- Authentication does not prove access to a repository or permission to merge,
  rerun or dispatch workflows. Future features retain repository/session
  authorization and specific bounded operation plans, never generic gh execution.
- No startup authentication traffic or changes to Git credentials/SSH keys.
  Real macOS/Linux credential-store and browser qualification remains open per
  [ADR 0006](0006-defer-macos-and-linux-runtime-validation.md).

## Alternatives considered

- Own OAuth/device flow and OS secret storage: independent sessions and stricter
  persistence, with registration, permission and revocation responsibilities.
  Prefer it if guaranteed no-plaintext persistence or independent accounts become
  a requirement.
- Export gh's token and use another HTTP client: adds a secret boundary without a
  present benefit for features planned around gh.
- Require a PAT or terminal: adds manual credential handling to onboarding.

## Follow-up: avatars and targeted sign-out (2026-10-03)

The user requested both additions in task 148-1. Extend the existing account
owner rather than adding a renderer HTTP/token boundary. A fixed gh `api user`
query provides a numeric id only after its returned login matches the verified
account. Download `https://avatars.githubusercontent.com/u/<id>?s=96` through a
separate unauthenticated native client, with redirects disabled, a three-second
deadline and a 256 KiB PNG/JPEG cap. Cache inline image data only in memory.
Profile/download failure keeps authentication successful and uses the previous
avatar for the same identity or a placeholder. This client reuses the updater
dependency's TLS provider but has its own credential-free policy. The existing
image encoder moves to a neutral shared module. The existing transitive Rustls
dependency becomes explicit so the avatar client can initialize the same ring
provider before any updater check. No alternate TLS provider, compiled library
or CSP scope is introduced. A failed worker always releases its busy state.

Local sign-out targets the username shown in the preview with
`gh auth logout --hostname github.com --user <login>`. Validate it against the
cached account and serialize the worker with other auth actions. The command
does not revoke OAuth tokens or close browser sessions. After confirmed removal,
clear the previous cached identity even if checking fails; if gh automatically
selects another stored account, show that account's actual status. Cancellation
may race with removal and therefore asks for verification. No all-account logout
or recovery copy of a secret is created. Reconnection uses the existing browser
flow, and environment-controlled credentials remain managed externally.

Primary references: [login](https://cli.github.com/manual/gh_auth_login),
[status](https://cli.github.com/manual/gh_auth_status),
[environment](https://cli.github.com/manual/gh_help_environment),
[logout](https://cli.github.com/manual/gh_auth_logout).

## Follow-up: saved account rows and switching (2026-10-04)

The user approved the interactive Settings prototype and requested its
implementation. Extend the same owner with a sixth narrow command,
`switch_github_account`, and an in-memory list of saved github.com accounts.
The original active-only status choice is superseded: run
`gh auth status --hostname github.com --json hosts` and decode each entry's
state, storage category and active flag. Require unique identities, one active
account for nonempty lists and a maximum of 32 entries. gh can report the same
identity twice when an environment token overrides a saved credential; retain
only its active environment-backed entry. Invalid inactive credentials do not
hide a healthy active account. Tokens, source paths and raw errors stay native.

Rows reuse the shared installation primitive, with an avatar, identity and
status chip on the left and actions on the right. Selecting a stored account
runs `gh auth switch --hostname github.com --user <login>` with a validated
cached username and verifies the resulting active identity. It changes the
shared local session and is disclosed beside the account controls. Sign-out
can remove any confirmed cached account; a failed follow-up check clears only
the removed identity and marks remaining metadata as requiring verification.
Environment credentials block mutations, and uncertain operations require a
fresh explicit check before another selection or removal.

For avatars, the original `api user` query is superseded by the fixed
`api users/<login>` public-profile endpoint with a validated username. Enrich up
to four accounts concurrently during explicit account actions. Selecting a
previously unenriched account moves it first. Cached images survive optional
profile/download failures; the existing CDN and transport limits remain.
Opening Settings or polling its cached receipts still initiates no network work.

The command ownership principle from GitButler's registration remains unchanged;
no GitButler source or assets are adapted. Own OAuth credentials, GitHub
Enterprise and repository-level permissions remain outside this decision.
Primary references: [status](https://cli.github.com/manual/gh_auth_status),
[switch](https://cli.github.com/manual/gh_auth_switch), and
[gh 2.96 status implementation](https://github.com/cli/cli/blob/v2.96.0/pkg/cmd/auth/status/status.go).
