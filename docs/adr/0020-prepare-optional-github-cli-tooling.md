# ADR 0020: Prepare optional system GitHub CLI tooling

- Status: accepted
- Date: 2026-10-02

## Context

Future PRs and Actions need a GitHub integration dependency without making
GitHub an account requirement for local Git work. GitOdile already detects
system Git, launches exact WinGet packages on Windows and offers official
installation instructions on macOS/Linux. Installing a tool and granting
GitHub access are separate operations.

## Decision

Expose optional system `gh` readiness in Settings → GitHub through four narrow native
commands: local version diagnostics, installation, explicit update checking
and update launch. Reuse the existing Git platform plans, retaining independent
launch guards and caches for each tool. Use `GitHub.cli` on Windows and the
[official installation documentation](https://github.com/cli/cli#installation)
on other platforms. Never run a shell or accept renderer-provided commands.

Only `gh --version` runs automatically after first paint. It has bounded output,
a deadline, cancellation and disabled prompts/update notification. No credential,
authentication or repository data is read or transmitted by the probe. WinGet
checks are explicit; installer launch reports only that the process started and
holds an app-install blocker until exit.

GUI launches may omit shell-configured executable paths, as described in
[Tauri's macOS bundle documentation](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/distribute/macos-application-bundle.mdx).
Try `PATH` first and fall back only on a missing executable to fixed standard
macOS/Linux paths, including the
[default Homebrew prefixes](https://docs.brew.sh/Installation).
Do not launch a shell, modify the process environment or mask an unusable tool
found on `PATH`.

The concrete Tauri problem is keeping tooling workflows outside registration
and transport. A small study of
[GitButler's Tauri entrypoint](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/gitbutler-tauri/src/main.rs)
reinforces that command registration and application services have separate
owners. Apply that principle through GitOdile's existing `ipc.rs`/`tooling.rs`
boundary; no reference code or assets are adapted.

## Consequences

Local Git works with no `gh` installation. Installing `gh` does not sign in to
GitHub or to GitOdile, alter Git credential helpers, or enable new screens.
Future GitHub features must own repository authorization, authentication,
network consent and specific bounded command plans rather than a generic
execution endpoint. CLI readiness alone cannot mean PRs/Actions are ready.

Windows installers may need elevation and require an app restart to inherit
updated PATH. macOS/Linux runtime installation remains guided and must be
qualified on real systems separately; hermetic planner tests cannot qualify it.

## Alternatives considered

- Copy Git tooling for `gh`: duplicates process and lifecycle policy.
- Install through Homebrew or Linux package managers automatically: introduces
  privileged prompts and distribution-specific behavior beyond the existing flow.
- Bundle `gh`: creates another distribution, signing and updater responsibility.
- Implement OAuth and direct GitHub HTTP now: exceeds dependency-preparation
  scope and prematurely commits future PRs/Actions to an authentication design.
