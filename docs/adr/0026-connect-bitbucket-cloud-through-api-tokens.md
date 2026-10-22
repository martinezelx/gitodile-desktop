# ADR 0026: Connect Bitbucket Cloud through API tokens

- Status: accepted
- Date: 2026-10-06

## Context

Task [148-11](../../work/active/148-11-bitbucket-token-connections.md) adds
Bitbucket Cloud (`bitbucket.org`) beside GitHub and GitLab. The shared account
registry, project bindings and Git helper of
[ADR 0022](0022-share-provider-accounts-and-scope-git-access.md), the native
token lifecycle of [ADR 0023](0023-add-native-github-tokens-and-repository-discovery.md)
and [ADR 0024](0024-connect-gitlab-through-shared-hosting-accounts.md), and the
provider instances of [ADR 0025](0025-connect-company-servers-as-provider-instances.md)
already exist. Bitbucket differs from both providers in ways that matter here:

- App passwords were removed (disabled 2026-06-09, deleted after the brownouts
  ended on 2026-07-28). Atlassian API tokens replace them; they must carry
  scopes and always expire.
- There is no official CLI comparable to gh or glab, so there is no browser
  session to reuse. A GitOdile OAuth consumer or Git Credential Manager would be
  a separate authorization design ([148-8](../../work/blocked/148-8-bitbucket-accounts.md)).
- The cross-workspace endpoints (`GET /2.0/repositories`,
  `/2.0/user/permissions/*`, `GET /2.0/workspaces`) were retired on 2026-04-14.
- Identities are UUIDs; usernames and display names can change, and the
  `username` field is no longer guaranteed in user objects.

## Decision

**Product and instance.** `ProviderKind::Bitbucket` is a third product with the
fixed instance ID `bitbucket`, host `bitbucket.org` and API origin
`https://api.bitbucket.org/2.0`. It is not a company-server product:
`ProviderKind::server_kind` refuses it, so Bitbucket Data Center cannot be added
through the server registry. `bitbucket_access.rs` is a distinct Tauri state type
over the shared `HostingAccessService`, like GitLab's.

**Tokens only.** A token-only adapter (`NoCli`) stands in for the CLI: no
browser rows, credentials or tooling. Tokens are stored in the OS secure store
under `GitOdile/Bitbucket/token/v1` with no plaintext fallback; metadata in
`bitbucket-token-accounts.json` holds UUIDs and display names only.

**Authentication.** User API tokens are sent as `Authorization: Bearer`, which
Atlassian documents as an alternative to Basic with the account email. The form
therefore asks only for the token; no email is collected or stored. Git over
HTTPS uses the static username `x-bitbucket-api-token-auth`, never the
case-sensitive personal username, so a username cannot select or conflate
accounts. The helper still requires the exact `bitbucket.org` authority.

**Identity.** `GET /2.0/user` must return a valid UUID. The account key is the
bare, lowercased UUID (`bitbucket:token.<uuid>`); the display name is the first
valid of `username`, `nickname` and `display_name` (bounded, no control
characters). A later check updates a renamed display name; a different UUID
behind a saved token fails closed. Metadata whose keys are not canonical UUIDs,
or lack a display name, is refused on load.

**Discovery.** Workspaces come from `GET /2.0/user/workspaces` (up to three pages
of 100, so at most 300 workspaces), then repositories from
`GET /2.0/repositories/{workspace}?role=member`, one Bitbucket page of up to 100
per GitOdile page. Pagination uses the body's `next` field only as a "more"
signal: GitOdile builds every request from the fixed origin and never follows a
server link. The browser numbers pages sequentially, so the service remembers,
per account and token generation, where each page already shown starts; a page
not reached in this session asks to start again from page 1. Up to 16 empty
workspaces are skipped within one request. Repository rows must have a UUID, a
valid slug, a `full_name` equal to `<workspace>/<slug>` and an HTTPS clone link on
`bitbucket.org` without port, password, query or fragment whose path is that
repository; the viewer name Bitbucket embeds in the link (`nickname@`) is dropped
and the clone URL is rebuilt. The repository ID shown to the renderer is a 53-bit
value derived from the UUID. Bitbucket has no archived state.

**Clone sources.** Native and renderer checks accept `bitbucket.org` HTTPS
(`workspace/repository` only) and SSH on the standard port. Addresses with a
username, including the ones Bitbucket's copy button produces, are not treated
as hosting sources and never select an account.

**Interface.** Settings gains a Bitbucket section with the shared Accounts list,
masked token form, scope guidance and a Bitbucket-specific refusal message for
`permission_denied` (usually missing scopes). The clone dialog gains a Bitbucket
source tab; project account pickers and remote warnings work through the shared
catalog.

## Consequences

Bitbucket users connect with a token they create and renew themselves; GitOdile
never renews or revokes it remotely. The required scopes are
`read:user:bitbucket` and `read:workspace:bitbucket` for identity and discovery,
`read:repository:bitbucket` to clone and `write:repository:bitbucket` to publish.
Memberships beyond 300 workspaces show only the first ones. Deep discovery pages
cost one request per workspace page and one `/user` identity check per page,
like the other providers. Existing clones whose remote embeds a username keep the
transfer guard's refusal until the remote is cleaned. Repository, project and
workspace access tokens (bot credentials without `/user`), Bitbucket Data Center,
avatars and OAuth stay out of scope. Real qualification requires a Bitbucket
account and a token created by the user.

## Alternatives considered

- **Basic authentication with the Atlassian email.** Documented and equivalent,
  but it would make the user type and GitOdile store an email for no added
  capability.
- **The personal username for Git.** Case-sensitive and renameable; the static
  username avoids both and cannot name another account.
- **Git Credential Manager or a GitOdile OAuth consumer.** Needs registration,
  owned refresh and shared-session disclosure; kept in 148-8.
- **Following Bitbucket's `next` links.** Simpler, but contrary to the fixed-origin
  rule every provider follows; rebuilding the request keeps a hostile link from
  receiving the token.
- **Flattening all workspaces before the first page.** Correct page numbers
  without remembered positions, but a large membership would delay the first
  page by many requests.
