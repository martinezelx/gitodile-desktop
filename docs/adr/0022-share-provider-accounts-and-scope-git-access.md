# ADR 0022: Shared provider accounts and project-scoped Git access

- Status: accepted
- Date: 2026-10-04

## Context

Settings already connects saved GitHub CLI accounts. System Git clone/fetch/push
does not automatically use that session. The user requested a complete GitHub
integration and a reusable foundation for GitLab and Bitbucket. They explicitly
asked to keep the existing browser login, without registering another OAuth app.

GitHub Desktop's [credential helper](https://github.com/desktop/desktop/blob/development/app/src/lib/trampoline/trampoline-credential-helper.ts)
coordinates accounts with Git. GitButler's
[account selection](https://docs.gitbutler.com/features/forge-integration/github-integration)
and [credential check](https://docs.gitbutler.com/guide) distinguish provider API
authorization from Git access. Its previously inspected narrow authentication
command registration remains the transport ownership reference from ADR 0021.
Extract those principles; no external source or assets are copied or adapted.

## Decision

`credentials.rs` owns account metadata, provider contracts, project selections
and the bounded internal Git-helper protocol. Hosting adapters own authorization
and secret retrieval. `hosting.rs` is the native adapter composition; `main.rs`
dispatches helper mode before starting Tauri. `features/accounts` owns a typed
port, local receipt controller and picker shared by clone and project settings.
GitHub-specific authorization and copy remain in their existing owner.

Preserve gh's browser/device login and secret persistence. Extend ADR 0021's
original no-token-export rule with one narrow exception: the native helper reads
`gh auth token --hostname github.com --user <validated-login>` into bounded
memory and writes it only to Git's private helper pipe. It never reaches IPC,
diagnostics, arguments, environment variables, browser persistence or a second
secret store. gh lookup disables debugging and environment-token overrides.
Its command contract was inspected against
[gh 2.96 token lookup](https://github.com/cli/cli/blob/v2.96.0/pkg/cmd/auth/token/token.go).

Bind a saved identity explicitly per canonical worktree root, separately from
commit name/email. Store only a versioned, bounded metadata mapping under the
app's native configuration directory, indexed by a canonical-path digest.
Validate selections against the locally cached verified catalog and compare
the previous selection on writes. Unreadable/invalid preference data fails
closed rather than choosing a different account. Browser sign-out remains a
shared gh action; it does not erase project bindings or silently switch them.

Each Git transfer uses process-only, exact-HTTPS-host credential-helper settings.
The helper validates protocol, exact host, username and bounded input before
secret lookup. Repeated array attributes such as `capability[]` and `wwwauth[]`
are valid in [Git's credential wire format](https://git-scm.com/docs/git-credential#IOFMT)
and are ignored by this password-only helper. Unused attributes are discarded
without interpreting opaque bytes; duplicate protocol, host or username fields
still fail closed, as do NUL bytes or invalid identity values. Its store/erase
operations do nothing. Failure sends `quit=true`
using [Git's helper protocol](https://git-scm.com/docs/gitcredentials) so other
helpers and askpass cannot silently replace the selected identity. Query only
HTTP configuration key names and mask matching path-specific extra headers for
the process; a wildcard header scope that matches a selected host (Git's
one-label `*` rule) fails closed with an explanation, because masking it would
also affect other hosts, while wildcards for other hosts are left untouched
(refined 2026-10-06). No global/project Git
configuration is written, and SSH/other hosts retain their configured access.
Existing provider remote URLs with embedded sign-in details are refused when a
project account is selected, because those URLs would bypass Git's helper.
HTTP and nonstandard HTTPS ports for that same provider are also refused because
they do not match the helper's standard HTTPS scope. SSH retains configured keys.
The common Git runner disables inherited Git trace output. Clone plans bind the
selected identity to their fingerprint and save its binding only after the
verified destination is published; a preference failure reports the completed
clone honestly instead of inviting another clone into the same destination.
The result carries `accountSelectionSaved: false`; the UI preserves the verified
destination, handles any staging cleanup, and explains manual account setup
without another clone or automatic opening with an unintended default account.

## Consequences

- No new OAuth registration is needed; GitHub continues to authorize GitHub CLI.
- gh installation is required for this adapter. An independently branded OAuth
  adapter can replace it without changing the shared picker/project preference.
- GitOdile does not promise stricter persistence than gh: its disclosed OS-store
  or plaintext fallback still applies. No token migration is performed.
- The active gh account remains shared for existing machine-level controls;
  project Git access uses an exact saved account without global switching.
- Missing/revoked credentials fail for that identity. Environment-managed
  accounts use existing Git setup instead of becoming saved project selections.
- Repository access, organization authorization and permissions are separate
  from connection status. A successful read does not prove publishing or Actions
  permissions. Future API calls must honor the same selected identity.
- Windows executable paths are quoted for Git's helper protocol; macOS/Linux
  packaging, helper execution and credential-store qualification remain open
  under [ADR 0006](0006-defer-macos-and-linux-runtime-validation.md).
- Providers implement the shared contract, not another project-selection store
  or secret-bearing frontend. GitLab/Bitbucket adapters are future work.

## Alternatives considered

- Run `gh auth setup-git`: changes the user's global Git behavior.
- Switch gh before every transfer: shared state races across projects/tools.
- Own OAuth immediately: requires a registered client and secret-storage lifecycle;
  not necessary for the user's accepted browser login.
- Put a token in Git's arguments/environment: widens the secret boundary.
