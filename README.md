# GitOdile

> **Git without the fear.** A friendly desktop Git client built around user
> intent, clear consequences, and safe recovery paths.

GitOdile is a pre-release, local-first Git client for Windows, macOS, and
Linux. It is designed for learners, AI-assisted builders, designers, writers,
and developers who want a calmer workflow without losing access to Git's
technical truth.

Current development version: **0.3.1**.
This candidate has not been tagged or published yet.

Source repository: [martinezelx/gitodile-desktop](https://github.com/martinezelx/gitodile-desktop).

Downloads, releases and issues: [martinezelx/gitodile](https://github.com/martinezelx/gitodile).
Use **More actions → Report an issue** to open an English or Spanish bug form
with the available app, system, WebView and Git versions. Reporting requires a
GitHub account. You review the public report before submitting it. Project
paths, code and remote URLs are not included. Browser launch failures offer
retry, copy link and a selectable address. Security reports use the tracker's
private vulnerability reporting channel.

Privacy and release trust are documented in the public
[privacy policy](docs/PRIVACY.md) and
[code-signing policy](docs/CODE_SIGNING_POLICY.md). GitOdile does not currently
offer a qualified public download; the release gates below remain closed
until the real Windows and Linux qualification evidence exists.

The pre-release naming reset uses a new desktop identity and recovery namespace.
Previous-brand preferences and recovery records are not migrated or discovered;
existing data is left untouched. See [ADR 0009](docs/adr/0009-use-only-the-canonical-product-identity.md).

## What works today

- Open a local project from its root or any nested folder, validate it in Rust,
  and switch between recent projects.
- Clone an HTTPS, SSH, Git, file-URL, or local-path project through a previewed
  provider-neutral two-screen flow: choose an address or GitHub/GitLab project, then
  choose the destination and clone. Complete GitHub/GitLab addresses get a cancellable
  read-only access check using the chosen connection. GitOdile stages privately, verifies the worktree,
  publishes without replacement, and opens it through the normal session
  lifecycle; select a saved account for GitOdile's HTTPS access or use existing
  Git credential helpers. SSH retains the user's configured keys.
- Create a named local project or turn an ordinary existing folder into one
  through a previewed, revalidated flow. Existing files are never replaced;
  README creation and the first saved version require explicit consent, and a
  provider-neutral remote URL can be connected through a separate preview.
- Restore the previous project session at startup and keep each open
  incarnation isolated with an opaque session epoch.
- Inspect the working tree in plain language, including staged, unstaged,
  untracked, deleted, renamed, conflicted, and ignored states.
- Review and copy readable, syntax-colored text diffs, inspect binary or
  oversized-file states, and navigate large change lists with virtualization
  and bounded native payloads.
- Discard one file or every unsaved change through a confirmed, state-checked
  flow that creates a persistent local recovery record and offers Undo. The
  confirmation can be turned off; the recovery record and Undo cannot.
- Bring discarded work back from a picker listing every stored recovery, not
  just the last one. A record the working tree has moved past stays listed and
  says why it cannot be applied, so a protected snapshot never reads as a lost
  one. A copy that is no longer wanted can be deleted from the same list, and
  says what goes with it before it does.
- Receive live, debounced repository updates without exposing raw filesystem
  paths to the frontend, or turn watching off — in which case Changes, History,
  and Lines disclose that their local snapshot may be out of date and offer a
  focused update.
- Save all or selected changes as a version with a title and description. The
  flow is planned and revalidated in Rust, preserves Git hooks and signing, and
  protects the real index through a collision-safe temporary-index workflow.
- Discover remotes and publish saved versions through a previewed,
  state-token-validated flow that reports uncertain remote outcomes honestly.
- Check the configured upstream for project changes without moving the current
  version line or files, manually or on an opt-in 15/30/60-minute cadence, with
  cached/fresh status and clear next steps.
- Review and get strictly newer upstream versions through a confirmed,
  fast-forward-only update. GitOdile blocks local work and path collisions,
  creates a verified durable recovery point first, and reports uncertain local
  outcomes without attempting an automatic repair.
- List, create, switch, rename, and safely delete version lines (local
  branches), with dirty-worktree checks and recovery references where required.
  A line is only called safe to delete when another local or remote-tracking
  reference already holds its saved work; a published line can have its remote
  copy removed with it, and the two halves are reported separately. The remote's
  own default line is never renamed or deleted.
- See one version line's recent saved versions, its saved-version count and
  where it stands against its remote, read on demand for the line you select
  rather than for every branch on every refresh.
- Use a project-scoped Console to type read-only Git commands such as
  `git log --graph --oneline -- src/`, `git show HEAD~2:README.md` or
  `git blame -L 10,20 file`; `help git` lists them. GitOdile reads the line
  itself, without a shell, and refuses anything that would change the project,
  reach the remote, run another program or leave the project, saying why.
  Settings › Console › Console mode offers three modes: read-only (the
  default), advanced and root, each move up behind a confirmation. Advanced
  also runs commands such as `git add`, `git commit -m`,
  `git switch`, `git stash push`, `git fetch`, `git pull` (fast-forward only)
  and `git push`: each prints what it will change and asks `[s/N]` first, and
  does not run if the project changed in between. Root drops the question,
  and the console's status line shows it in a colour of its own. Commands that rewrite history
  or can discard work stay unavailable.
  Twenty built-in read-only shortcuts, such as `look` (`git status`), `graph`,
  `today` or `unpublished`, are listed with the Git command each runs in
  [docs/console-shortcuts.md](docs/console-shortcuts.md) and in the console's
  `help`; you can rename them or add your own names, including names for whole
  command lines (`lg` → `git log --oneline -20`).
  Settings › Console turns suggestions and the welcome on or off and sets the
  cursor and text size. The transcript stays in memory for the open project
  session.
- Browse the active version line as a bounded, read-only saved-version
  timeline. Inspect author/date/publication/ref metadata, changed files, and
  root/first-parent/merge diffs through the same typed renderer as Changes.
- Review a bounded, redacted record of this session's app commands, Git
  operations, and failures before reporting an issue; copy it, save it locally to attach, or
  continue to the public GitHub form. Nothing is retained between sessions.
- Check for updates without opening a project from What's new, More
  actions, the command palette, or the Updates section of Settings. One shared controller mirrors the
  native lifecycle through download, signature verification, explicit
  install/restart consent, draft or active-work blockers, cancellation and
  observed-version confirmation. The startup check is on by default: it asks
  GitHub once when the app opens (and again every 24 hours while it stays
  open), records a notification when a release is found, and never downloads
  or installs anything by itself.
- Configure light/dark/system themes, reduced motion, English/Spanish copy,
  date and number formats, Git identity, installation diagnostics, supported
  Git update guidance, how diffs are read, and whether projects are watched
  and discards confirmed.
- Set the default version-line name for new projects (written to Git's own
  `init.defaultBranch`), choose how often project changes are checked
  automatically — from every minute to every day, or never — and decide whether
  GitOdile runs a project's Git hooks when it saves or publishes. Hooks run by
  default; turning them off is app-wide, writes nothing to any project, and the
  setting says plainly what stops running. When a hook rejects a save, its
  output is shown with a one-time way to save without running it.
- See and change what Git does to line endings in plain language, including
  when a project's own settings or `.gitattributes` override the global choice.
- Read what happened while you were elsewhere from a notification centre in the
  titlebar: project changes an automatic check found, checks that could not
  reach the remote, and versions you published. Everything stays inside the app
  — no operating-system notifications — and one switch in Settings turns the
  recording off.
- Navigate through a command palette, keyboard-accessible dialogs, and a
  keep-alive screen shell that retains screen state while suspending hidden
  work.
- Return to Projects from More actions or the command palette while projects stay
  open, use recent closed projects, and go Back to the project screen you left.

Not yet implemented: non-fast-forward/local-line integration, the recovery
center, guided conflict
resolution, and setting changes aside. Windows/Linux release qualification also
remains open. Windows Authenticode and macOS delivery are deliberately deferred
until after `1.0.0`; see
[ADR 0011](docs/adr/0011-defer-windows-authenticode-and-macos-delivery-until-after-1.0.md).
The dependency-ordered `1.0.0` plan is in the
[`roadmap`](docs/ROADMAP.md), with approved acceptance criteria under
[`work/active/`](work/active/) and the completed core-workflow evidence in
[`task 065-1`](work/done/065-1-core-workflow-audit.md), clone evidence in
[`task 065-2`](work/done/065-2-clone-remote-project.md), and local-creation
evidence in [`task 065-3`](work/done/065-3-create-local-project.md).
The completed History implementation and its validation are recorded in
[`task 015`](work/done/015-history-timeline.md).

## Publication checks

The updater has one channel: every release is a plain `X.Y.Z` version, tagged
from `main`, and every installation is offered it. Start a release with
`pnpm run release:prepare <X.Y.Z>` from a clean, current `main` (or from a
clean work branch that already contains `origin/main`); it produces the sole
valid `release/<X.Y.Z>` branch and prepares the authoritative metadata, the
public notes and the in-app highlights file that What's new is built from.
Develop the release on that branch; after filling the highlights,
`pnpm run release:notes` renders the notes' Highlights section from them.
After its same-repository pull request passes the complete check set and is
merged, protected default-branch automation creates the tag at the exact merge
SHA and dispatches the candidate build. Direct pushes and manual tags cannot
authorize a release. See
[ADR 0010](docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md),
[ADR 0019](docs/adr/0019-publish-updates-through-one-channel.md)
and [task 065-9](work/done/065-9-signed-application-updates.md); the evidence and OS-signing work still
open is tracked by [task 065-9-13](work/active/app-updates/065-9-13-updater-evidence-and-os-signing.md).
The native updater lifecycle and its visual controls are implemented in
Settings → Updates. The current release matrix enables only Windows x86-64
per-user NSIS and Linux x86-64 AppImage candidates. Releases currently publish
under a testing policy (Tauri updater signature, no platform qualification,
Authenticode deferred) so that updates can be exercised with real
installations; neither target is qualified until its real Tauri-signed
A-to-B evidence exists. Both macOS targets
are post-1.0 work under task 065-10; they are not advertised in feeds or
published as supported packages. The single release pipeline (validate, build,
OS-trust boundary, updater signing, staging and publication as jobs of one
run) and its protected evidence are implemented. One production Tauri updater
key is configured; there is no test-only key, feed or build profile, and
qualification evidence comes from real consecutive public releases.
Source-repository visibility grants no access to signing
material or publisher credentials. The merge-driven coordinator, automatic
protected public publisher,
immutable-asset reconciliation and the no-regression feed gate are implemented
and locally tested. Production remains closed until the enabled Windows/Linux
matrix is qualified and published. Authenticode is deliberately not a pre-1.0
gate, so Windows downloads must disclose that the operating system does not
know their publisher. Maintainers must follow the
[signed-build](docs/release/signed-builds.md) and
[public publishing](docs/release/public-publishing.md) runbooks; a private
artifact is not a release.

Before publishing a desktop build, run `pnpm run check:publication`. It runs
the complete local gate plus `check:feedback`, which checks the live public
repository settings and both languages' forms against
`src/app/issueReportContract.json`. CI runs that public contract check separately,
and the release pipeline's staging job repeats only the live contract part
(the repository gate already ran on the exact merge SHA); ordinary
`pnpm run check` does not depend on GitHub availability. For prepared
tracker changes, use `pnpm run check:feedback --local <feedback-checkout>` to
validate form files before publishing them. Preserve form filenames and field
IDs used by already released app versions.

### Code signing policy

Release tags are protected, candidate builds originate from reviewed GitHub
Actions runs, and published packages must retain their checksums and Tauri
updater-signature evidence. Windows packages through `1.0.0` intentionally lack
publicly trusted Authenticode and may trigger SmartScreen or unknown-publisher
warnings. [Task 065-9-13](work/active/app-updates/065-9-13-updater-evidence-and-os-signing.md)
owns OS-level signing (SignPath Foundation is the intended
provider) and the remaining qualification evidence. No external
signing-service application has been submitted yet.

## Architecture at a glance

```text
React feature UI
  -> feature controller and typed port
    -> feature-owned Tauri adapter
      -> thin Rust IPC adapter
        -> application policy + repository authorization
          -> product domain
            -> bounded Git/process/filesystem adapters
```

The frontend is a modular monolith. Product features live under
`src/features/<feature>/` and own their UI, controller, domain types, port,
Tauri adapter, translations, styles, and tests. `src/app/App.tsx` is the
composition root for cross-feature orchestration; the rest of the shell UI and
preferences live beside it under `src/app/`. Screens are declared once in
`src/app/screens.tsx` and consume the project-scoped runtime in
`src/runtime/` rather than fetching when they become visible.

Rust keeps transport, policy, coordination, domains, and infrastructure
separate:

- `ipc.rs` adapts Tauri arguments and responses;
- `application.rs` assigns one checked execution policy to every command;
- `repository_access.rs` coordinates concurrent reads and exclusive mutations
  by common Git directory;
- `repository.rs`, `clone.rs`, `initialize.rs`, `status.rs`, `changes.rs`, `console/`,
  `save_version.rs`, `sync.rs`,
  `publish.rs`, `recovery.rs`, and `version_lines.rs` own product behavior;
- `operation.rs` owns shared mutation classification and bounded/redacted
  diagnostic details;
- `index.rs` owns collision-safe temporary-index preparation shared by safe
  mutations;
- `git_command.rs` binds application policy to the bounded runner in `git.rs`;
- `platform.rs` owns the OS-specific exclusive directory publication primitive;
- `tooling.rs`, `watch.rs`, and `desktop.rs` own system-Git settings, repository
  invalidation, and desktop-shell services;
- the production body of `lib.rs` only registers modules, plugins, state, and
  IPC handlers; integration tests are grouped by domain under
  `src-tauri/src/tests/` with shared hermetic fixtures in `test_support.rs`.

The architecture is enforced by dependency analysis, seeded negative fixtures,
Rust syntax-based boundary tests, and a checked JSON IPC contract. Read the
[`architecture guide`](docs/ARCHITECTURE.md) before changing module ownership.

## Technology versions

The lockfiles are authoritative. This is the current resolved development
snapshot; the About dialog credits the Tauri, React, and Rust rows
of it, reading them from the same lockfiles at build time rather than from a
hardcoded list:

| Layer | Version |
| --- | --- |
| Node.js | `>=24` |
| pnpm | `pnpm@11.17.0` |
| Rust | stable (`rust-toolchain.toml`) |
| Tauri runtime / CLI | `2.12.1` / `2.12.1` |
| React / React DOM | `19.3.0` |
| TypeScript | `6.0.3` (intentionally pinned; see ADR 0005) |
| Vite / Vitest | `8.3.1` / `5.0.1` |
| TanStack Virtual | `3.14.13` |
| notify | `8.2.0` |

GitOdile uses the system Git executable. Git **2.23 or newer** is required for
version-line switching; diagnostics remain available when Git is missing or
unusable.

Settings → GitHub offers optional **GitHub CLI (`gh`)** diagnostics,
installation and update guidance. Windows starts WinGet for the exact
`GitHub.cli` package, with official instructions as a fallback; macOS and Linux
open the official platform instructions. Local version checks require no
GitHub account or network request. On macOS/Linux, detection checks `PATH`
first, then standard Homebrew/local installation paths when the executable is
missing. Windows update checks are explicit and
cached for five minutes; other platforms use the official update instructions.
An installer being started is not proof of installation: reopen GitOdile after
installing to inherit the updated `PATH`. This prepares the dependency for
future PRs and Actions; those screens are not yet implemented. Settings → GitHub
offers explicit account detection and browser connection through gh. It shows
the saved github.com accounts and cached avatars, with the active account first,
and retains their last known identities when offline,
with a temporary device code, browser retry and cancellation during login.
Opening Settings never checks authentication over the network. A gh version with
JSON authentication-status support is required; older versions request update.
The session is shared with GitHub CLI. Before connecting, GitOdile explains gh's
repository permissions and possible plaintext credential fallback; file-backed
and environment-provided credentials are disclosed afterwards. This browser
connection keeps credentials owned by gh and does not change persistent Git
credentials/SSH keys. Sign-out first explains
that it removes the selected account from the shared local gh session; it does
not revoke GitHub authorization or close the browser session. Another saved
account may become active. Users can activate a saved account, connect another
through the browser, or sign out an individual account. Switching also changes
the active account for other tools using the shared gh session. Each row uses
the same status chip and right-aligned actions as the installation settings.
Avatars are retrieved only during explicit account actions and cached in memory.
See
[ADR 0021](docs/adr/0021-reuse-github-cli-authentication.md). `gh` is never required
for ordinary local Git workflows.

Settings presents token connections first, browser connections second and gh
installation last. Browser connections and saved gh accounts require the CLI;
token connections work with or without it. Cloning a GitHub or GitLab.com HTTPS URL
and Project settings → Remote offer a shared account selector. Different projects
can use different saved accounts without switching gh's active account. The
native credential helper retrieves the exact saved account only when Git needs
it; retrieved credentials never return to the frontend or enter command arguments/environment.
Selections persist as local metadata, and a missing credential fails instead
of silently choosing another account. Choosing existing Git credentials preserves
the system's normal authentication. Account selection does not change commit
authorship, configure SSH or prove publishing permissions. GitHub and GitLab.com share this provider contract.
See [ADR 0022](docs/adr/0022-share-provider-accounts-and-scope-git-access.md).

Settings → GitHub starts with one **Accounts** list: every token and browser
connection of github.com and of each company server, grouped under its host,
with one check action and one **Add account** panel (method, then host). The
token method opens a masked field with storage guidance and expandable
permission details. GitOdile verifies the token's identity and saves it only
in the system's secure credential store, with no plaintext fallback. Up to eight
token connections coexist with browser connections; even the same username has
separate connection choices. Removing one deletes its local secret, leaves its
project selections unavailable and does not revoke the token on GitHub. After
restart, detect/check accounts explicitly before choosing them. Metadata stores
only usernames, and the token input clears when sent to Rust.

Clone a project → **GitHub** lets you choose a connection (the one used last
time, or the only usable one, is preselected) and lists its personal/team
projects as soon as a connection is chosen. Pages contain up to 100 projects
with private/archive metadata and a filter for the current page. Permissions and
organization/SSO approval may limit the inventory. Choosing a project fills its
HTTPS address and account into the existing destination review; nothing is
cloned until you confirm. Discovery uses exactly that connection without changing
gh's active account. Its private results are cached only for the app session.
See [ADR 0023](docs/adr/0023-add-native-github-tokens-and-repository-discovery.md).

Settings → GitLab follows the same layout: the **Accounts** list (tokens and the
glab browser connection per host), company servers, then optional
**GitLab CLI (`glab`)** tooling. Tokens work without
glab and stay in a separate OS secure-store namespace, with no plaintext fallback.
Use `read_api` for identity/project discovery, plus `read_repository` for clone/get
changes or `write_repository` to publish too; the broader `api` scope covers both.
Project membership still determines access. Expired/revoked tokens need replacing.
Up to eight token connections coexist independently of the single glab session.
Numeric GitLab user IDs keep selections stable after username changes.

Browser connection requires **glab 1.120.0+** and an explicit connection check.
It uses glab’s registered application and browser OAuth. Its GitLab.com session
is shared with other tools and supports one account at a time. GitOdile requests
system keyring storage; glab may fall back to a plaintext configuration file and
owns OAuth refresh. Sign-out rechecks the confirmed numeric identity first;
offline/invalid sessions must be repaired with glab rather than risking removal
of another account. External identity changes make old project selections
unavailable. Windows offers the exact WinGet package `GLab.GLab`; macOS/Linux
provide official installation/update instructions. Local diagnostics need no account.
After the Windows installer finishes, use the tooling card's recheck button.
GitOdile also checks the standard user/system installation locations, so the
running app can find glab even before its inherited PATH has been refreshed.

Clone a project → **GitLab** reuses the connection selector and project browser,
including group/subgroup names, current-page filters and explicit pagination.
Discovery and HTTPS transfers use the exact token or CLI connection selected;
there is no fallback to another source. API calls use only GitLab.com without
redirects. SSH stays outside this account adapter’s scope.
See [ADR 0024](docs/adr/0024-connect-gitlab-through-shared-hosting-accounts.md).
Automated fixtures and Windows UI/secure-store checks cover the implementation;
real GitLab OAuth, private clone/publishing and macOS/Linux runtime qualification
remain unclaimed until exercised with an authorized account and environment.

### Company servers

Settings → GitHub and Settings → GitLab each list their **company servers**
(**GitHub Enterprise Server**, **GitLab Self-Managed** or Dedicated) after the
accounts. Add a server by its HTTPS address (`https://git.example.com`, with
an optional port); GitOdile contacts it once, without credentials, to confirm
the product and a supported version (GHES 3.0+, GitLab 14.0+), then its
accounts appear in the Accounts list under its host. Up to 8 servers;
their accounts never mix with github.com/gitlab.com accounts, and a project can
use a personal and a corporate account at the same time. Clone a project →
GitHub/GitLab lists accounts from every host of that product, and project
settings → Remote show an **HTTPS access** row per host its remotes use, after
the remotes themselves. Removing a
server deletes its saved tokens from the OS secure store; gh/glab sessions are
left to those tools. API calls trust the certificates installed on the computer
and its proxy settings; Git uses its own proxy/CA configuration. Relative-URL
GitLab installations and GHE.com data residency are not supported yet. See
[ADR 0025](docs/adr/0025-connect-company-servers-as-provider-instances.md).
Behavior is covered by hermetic fixtures; no real corporate instance has been
qualified yet.

## Requirements

All platforms need Node.js 24+, Corepack/pnpm 11.17.0, Rust stable with
`rustfmt` and `clippy`, and system Git.

Tauri also requires platform build dependencies:

- Windows: Microsoft C++ Build Tools with **Desktop development with C++**, and
  WebView2 Runtime.
- macOS: Xcode Command Line Tools.
- Linux: WebKitGTK 4.1 and the distribution packages listed in the
  [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Development

Install reproducibly:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Run the desktop app:

```bash
pnpm run tauri dev
```

Run only the Vite frontend at `http://localhost:1420`:

```bash
pnpm run dev
```

The status bar, About and What's new share the version injected from
`package.json`. Vite watches that manifest as a configuration dependency and
reloads the frontend after a version change. A Git branch name alone does not
change the app version; installed packages retain the version they were built
with. Keep npm, Cargo and Tauri metadata synchronized when preparing a release.

Run the complete repository harness:

```bash
pnpm run check
```

The aggregate check validates Markdown links/task metadata, frontend dependency
rules, TypeScript, frontend tests, the production build, Rust formatting,
Clippy with warnings denied, and Rust tests. Individual commands remain
available as `check:docs`, `check:architecture`, `check:frontend`, and
`check:rust`.

Create an unsigned local desktop bundle with:

```bash
pnpm run tauri build
```

CI runs frontend checks on Linux and Rust checks on Windows, macOS, and Linux.
It also release-compiles the desktop executable on macOS and Linux. Real
WKWebView/WebKitGTK runtime, accessibility, memory, signing, and packaging
validation are still release-hardening gates documented in
[`ADR 0006`](docs/adr/0006-defer-macos-and-linux-runtime-validation.md).

## Documentation map

Each durable document has one owner to limit duplication:

- [`AGENTS.md`](AGENTS.md): executable engineering and safety rules.
- [`docs/PRODUCT_STRATEGY.md`](docs/PRODUCT_STRATEGY.md): product thesis,
  audience, positioning, and competitive context.
- [`DESIGN.md`](DESIGN.md): visual, interaction, content, and accessibility
  direction.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): current architecture and
  extension rules.
- [`docs/adr/`](docs/adr/): accepted, proposed, or superseded decisions and
  their rationale.
- [`work/`](work/): active work and historical execution notes; it is not the
  source of durable architecture.
- [`PRODUCT.md`](PRODUCT.md): compact machine-readable product brief used by
  design tooling; the product strategy remains authoritative.

Numbered files under `docs/architecture/` are evidence and historical
baselines. They should not duplicate the current-state guide.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before making changes and
[`SECURITY.md`](SECURITY.md) for vulnerability reporting.

## License

GitOdile is licensed under the GNU Affero General Public License v3.0 only
(`AGPL-3.0-only`). See [`LICENSE`](LICENSE).

Copyright © 2026 Luis M. Martínez.

The GitOdile name, logo, application icon, and visual identity are subject to
separate brand rights. The software license does not grant rights to use them.
