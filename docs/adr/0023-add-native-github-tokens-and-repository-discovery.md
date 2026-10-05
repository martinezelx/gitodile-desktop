# ADR 0023: Add native GitHub tokens and repository discovery

- Status: Accepted
- Date: 2026-10-04
- Amends: [ADR 0021](0021-reuse-github-cli-authentication.md) and
  [ADR 0022](0022-share-provider-accounts-and-scope-git-access.md)

## Context

The user approved a second connection method alongside gh browser authorization,
and asked to finish GitHub connection/discovery before GitLab. PR and Actions
screens are later work. Importing a PAT into gh would retain a CLI requirement
and its possible plaintext fallback; using gh's active API session could expose
the wrong account's repositories when a project chose an inactive identity.

The concrete desktop problem is durable secret storage that remains native,
while connecting explicit API intent to the same account used by system Git.
We studied GitButler's small [sensitive secret type](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/but-secret/src/lib.rs)
and its [Linux persistence incident](https://github.com/gitbutlerapp/gitbutler/issues/5493).
The reusable principles are to make secrets unavailable to ordinary diagnostics
and to choose a durable OS store rather than a kernel session keyring. The
[current license](https://github.com/gitbutlerapp/gitbutler/blob/master/LICENSE.md)
was inspected; no source, structure, assets or wording were adapted.

## Decision

`github_access.rs` aggregates gh and GitOdile-owned token connections under the
existing GitHub provider. Original `github:<login>` IDs remain unchanged;
`github:token.<lowercase-login>` identifies a distinct credential source, including
when both methods connect the same person. The internal key is separate from
the HTTP username. Selection never switches gh or changes Git configuration.

Tokens are verified against `/user` before storage. `keyring` uses Windows
Credential Manager, macOS Keychain or Linux Secret Service with Rust crypto.
There is no plaintext fallback. A bounded versioned metadata file contains
only logins (up to eight token connections); restart retains their identity but
requires an explicit network check to call them available. Inaccessible or
invalid metadata fails closed. Replacing a token requires removing its existing
connection first. Local removal does not revoke GitHub authorization or erase
project bindings: affected projects must explicitly choose another connection.

This adds one narrow IPC secret-ingestion exception: an uncontrolled password
field sends its value once to Rust and clears before awaiting the result. No
secret response, renderer persistence, diagnostics, command argument, Git URL
or child environment is permitted. The native secret is neither Debug nor
Serialize and wipes its owned buffer on drop. HTTP Authorization is marked
sensitive. Keychain work runs on blocking workers; errors contain no raw bodies
or library details. A separate mutation lock serializes secure-store changes;
OS prompts never hold the cached catalog lock or block its synchronous reads.
Queued storage writes recheck cancellation after acquiring the mutation lock.
Token mutations advance a native revision; repository reads reject obsolete
receipts and cannot invalidate a newly reconnected token. Settings rereads the
local catalog after either mutation outcome, including lost IPC receipts.
Cancellation stops HTTP; storage already committed is
discovered in the next catalog read, never silently undone.

Repository discovery is an eager feature inside the existing clone overlay,
with typed ports and its own controller, rather than a new navigation screen.
Explicit Find/Refresh/Page clicks perform bounded native GETs against the fixed
GitHub API origin. Every read retrieves exactly the selected credential and
checks `/user` before `/user/repos`; no CLI active-account API substitution is
allowed. HTTP redirects are refused; pagination uses numeric pages rather than
following server URLs. Each HTTP request has a 20-second deadline and a 2 MiB
body cap; pages have at most 100 projects. Native cancellation drops in-flight
HTTP and holds updater admission until the operation ends. Secret mutations
block installation; repository reads drain. OS credential prompts have their
own system lifecycle and cannot be cancelled by abandoning an HTTP request.

Session-only caches retain one page per connection. Account changes remove the
previous identity's visible results immediately, unavailable/deleted connections
discard their cache, and cancellation rejects late responses. The list is
virtualized with keyboard row navigation. Search explicitly filters the current
page; the interface never represents it as an entire account inventory. Token
permissions, organization approval and SSO can limit the visible repositories.
Verified HTTPS URLs and the exact connection populate the existing clone form;
destination review, cancellation, native plan binding and persisted project
selection continue to belong to clone.

GitHub's [repository endpoint](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)
and [PAT guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
inform permission copy. Identity verification and listing do not prove Contents
write permission. Cloning/getting changes needs repository read access, and
publishing needs write access; actual Git failures remain authoritative.

## Consequences

- Tokens work without gh and coexist with its browser connection.
- Settings presents tokens before browser connections and CLI tooling, using
  the shared settings groups and installation rows. Copy states that only the
  browser method requires gh; token permission details are progressively disclosed.
- API and Git access retain the project's chosen identity and credential source.
- Linux needs an available/unlocked Secret Service; macOS may prompt for Keychain
  access. There is no weaker automatic storage path. Runtime platform evidence
  remains subject to [ADR 0006](0006-defer-macos-and-linux-runtime-validation.md).
- Expiry/revocation is detected on explicit checks/API/Git access, not hidden
  polling. No refresh token, automatic privilege expansion or OAuth app is added.
- GitLab extends the shared contract after this GitHub milestone; PRs and Actions
  have not been implemented by adding repository discovery.

## Alternatives considered

- PAT import into gh: still requires a CLI and inherits its storage policy.
- Own OAuth now: requires registration and a separate authorization lifecycle;
  remains future scope alongside the accepted browser flow.
- Tokens in TypeScript REST clients or Git environment: unnecessarily widens
  the secret boundary and makes exact identity harder to enforce.
- Unbounded downloads or global GitHub search: exceed the local list budget or
  imply account-access semantics the authenticated repository endpoint lacks.
