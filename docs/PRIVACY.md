# Privacy policy

Last updated: 2026-10-04

GitOdile is a local-first desktop Git client. Repository contents, paths,
history, settings and recovery records stay on the user's device unless the
user explicitly starts an operation that communicates with a configured Git
remote or opens an external service.

GitOdile does not require a GitOdile account and does not include product
analytics, advertising trackers or telemetry. The application can contact:

- a user-configured Git remote when the user clones, fetches, pulls or pushes;
- the configured GitOdile update feed when update checks are enabled;
- the public GitHub feedback repository when the user chooses to report an
  issue or security problem.
- GitHub when the user explicitly detects/checks GitHub CLI accounts, activates
  a saved account, signs out, or starts browser authorization from Settings.
- GitHub's avatar CDN when an explicit account action retrieves the account image.

The GitHub connection uses the shared GitHub CLI session. GitOdile keeps account
metadata for saved accounts and their active selection in memory. Access tokens
never reach the renderer, and GitOdile does not include account
identity, temporary authorization codes or raw authentication output in diagnostic
reports. GitHub CLI owns credential persistence and can fall back to a plaintext
file if its system credential store fails. This is disclosed before connecting
and when a file-backed credential is detected. Opening Settings initiates no
GitHub authentication network check. Public account avatars are fetched by a
bounded native client without an authentication token, redirects or disk storage;
the renderer displays cached inline image data. Sign-out removes only the selected
account's local shared gh credentials, leaving the browser session and GitHub
authorization active. gh may activate another saved account, which is checked
and displayed. Selecting a saved account updates gh's local active-account
configuration and therefore affects other tools using its session. The subsequent
check verifies the selection; opening Settings only displays the cached list. See
[ADR 0021](adr/0021-reuse-github-cli-authentication.md).

Project-specific HTTPS account selections are saved as local metadata under the
native application configuration directory, indexed by a canonical-path digest.
They contain provider/account identifiers, not tokens or raw project paths.
These selections do not switch gh's active account. When Git requests credentials
for a selected account, a bounded native helper reads that account's gh token
and answers Git through its private credential pipe. No second credential store
is created; tokens do not enter command arguments, environment variables, IPC or
diagnostics. Other hosts and SSH retain their existing setup. See
[ADR 0022](adr/0022-share-provider-accounts-and-scope-git-access.md).

Issue reports are reviewed by the user before submission. GitOdile excludes
project paths, source code and remote URLs from the generated report. GitHub's
own terms and privacy policy apply after the user opens or submits through
GitHub.

The project's build and release services process maintainer credentials and
release artifacts, not end-user repositories. Public release artifacts,
checksums and evidence are retained to keep published versions independently
verifiable. GitHub retains workflow and security records according to the
repository and account settings.

Privacy or security questions may be reported through the private vulnerability
reporting channel in
[martinezelx/gitodile](https://github.com/martinezelx/gitodile/security/advisories/new).
