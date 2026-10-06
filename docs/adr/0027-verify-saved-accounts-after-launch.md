# ADR 0027: Verify saved hosting accounts in the background after launch

- Status: accepted
- Date: 2026-10-06

## Context

ADRs [0022](0022-share-provider-accounts-and-scope-git-access.md),
[0023](0023-add-native-github-tokens-and-repository-discovery.md),
[0024](0024-connect-gitlab-through-shared-hosting-accounts.md) and
[0026](0026-connect-bitbucket-cloud-through-api-tokens.md) made verifying saved
connections an explicit **Check accounts** action. After every restart, saved
tokens were listed as unchecked and gh/glab browser accounts were unknown until
that check, so they could not be chosen to clone or publish. The owner judged
that requiring this on every launch makes no sense for users (2026-10-06).

Other desktop clients do not ask for it. GitHub Desktop restores its accounts
from the keychain and, in `loadInitialState`, refreshes every account's profile
from the API in the background (`accountsStore.refresh()`), signing out an
account whose token is rejected. Sourcetree and Fork use saved accounts directly
and detect expired tokens when they are used.

Verification does not protect the operations themselves: discovery rechecks the
exact identity on every page, and the Git helper answers only with the exact
selected credential. The check decides which saved connections are offered.

## Decision

Shortly after launch (three seconds, off the first-paint path), `hosting.rs`
runs the same check as **Check accounts** for each product — GitHub, GitLab and
Bitbucket, each including its company servers — on a background thread
(`sync_accounts_after_launch`). Each saved token costs one identity request; each
product with gh/glab costs one CLI status check. Failures mark only the affected
connections (unchecked, reconnect or offline), exactly like the manual action;
nothing is removed or replaced. A test keeps the synced products equal to the
registered ones.

The renderer keeps reading local receipts: opening a screen never starts a
check. `useAccounts` renders the last receipt at once when a section is shown
again, and the clone dialog waits for a running check before preselecting a
connection. **Check accounts** remains for checking again on demand.

## Consequences

Saved connections are usable without a manual step after launch. Every launch
contacts each provider that has saved tokens and runs gh/glab when installed,
even if the user does not use hosting that session; the cost is a handful of
small background requests and two short processes. Reading tokens from the OS
secure store happens at launch, so a platform that prompts for keychain access
(macOS) prompts then. Offline launches leave connections unchecked until the next
explicit check. Repository data and project discovery still require explicit
actions; this is the only background network activity the hosting features
start on their own.

## Alternatives considered

- **Check once per session when accounts are first needed** (Settings, clone,
  project access). Implemented first; it avoids traffic for users who never use
  hosting, but the first use still waits for a check. The owner preferred the
  GitHub Desktop behavior.
- **Offer saved tokens without verification.** No extra traffic for tokens, but
  gh/glab browser accounts would still need a check, and a stale token would be
  offered as connected.
- **Keep manual checks.** Rejected by the owner for the reason above.
