---
id: 148-12
title: Run safe gh and glab shortcuts from the project console
status: active
priority: normal
type: feature
areas:
  - frontend
  - platform
  - credentials
created: 2026-10-06
completed:
parent: "148"
queue: "04"
---

# Goal

Add a closed set of read-only GitHub CLI (`gh`) and GitLab CLI (`glab`)
shortcuts to the project console, as a child of
[epic 148](148-connect-github-account.md). People who connected a hosting
account can see pull/merge requests, issues and CI runs for the open project
without leaving GitOdile.

# User outcome

Typing `prs`, `issues` or `runs` in the console of a GitHub or GitLab project
shows the same answer `gh` or `glab` would give in a terminal, and never
changes anything on the hosting service.

# Context

The owner asked on 2026-10-06 for gh/glab in the console. They agreed that
arbitrary gh/glab lines need their own classifier: `gh api`/`glab api` can
make any authenticated request (including deleting a repository), `gh
extension` and `gh alias set '!…'` run programs, and `gh auth token` prints a
secret into the transcript. The first step is shortcuts only, the way task 134
started the Git console. [ADR 0028](../../docs/adr/0028-console-runs-changes-without-a-read-only-mode.md)
removed the console's read-only mode for Git. This task keeps every gh/glab
shortcut read-only by construction instead.

GitOdile already detects, installs and updates both CLIs (`tooling.rs`, task
146 and 148-4) and shares their login with Settings › Accounts (148-2, 148-4,
148-10), so the CLI's own login is the account the person already sees.

# Scope

- A Rust-owned catalogue of fixed argument templates, like `console/catalogue.rs`.
  The renderer sends a shortcut ID and never a gh/glab argument. Candidate set,
  to be confirmed against each CLI's current docs:
  - `prs`: `gh pr list` / `glab mr list`
  - `mine`: `gh pr status` / `glab mr list --author=@me`
  - `issues`: `gh issue list` / `glab issue list`
  - `runs`: `gh run list -L 20` / `glab ci list`
  - `checks`: `gh pr checks` / `glab ci status` (current line)
  - `repo`: `gh repo view` / `glab repo view`
- Provider-neutral names: the project's remote decides whether gh or glab runs,
  and `help` and the output show the exact command. A project with no
  supported remote, or with an ambiguous one, gets a plain explanation and no
  process.
- Run the resolved executable from `tooling.rs` with separate arguments, a
  bounded output/time budget and a non-interactive environment: no pager,
  no prompts, no colour, no update notifier, and the host pinned for company
  servers (`GH_HOST`, glab's equivalent). Strip terminal controls as the Git
  console does.
- Missing CLI, signed-out CLI and unreachable host each get their own message,
  pointing to Settings › Accounts or the tooling install, never raw stderr as
  the main error.
- Shortcut names follow the console's existing rename/remove/add rules and
  appear in `help`, completions and [docs/console-shortcuts.md](../../docs/console-shortcuts.md).

# Out of scope

- Typed `gh …`/`glab …` lines, and any gh/glab command that writes (creating,
  merging, closing, commenting, rerunning). Those need a classifier and an ADR
  of their own.
- `api`, `extension`, `alias`, `auth`, `config`, `browse`, `--web` and anything
  else that opens a browser, runs a program or prints a secret: never part of
  the catalogue.
- Bitbucket: it has no official CLI; say so honestly in `help`.
- Injecting GitOdile-saved tokens into gh/glab. The CLI's own login is used.

# Acceptance criteria

- [ ] Each shortcut runs only from a Rust template; a Rust test proves no
      renderer input reaches the argument vector.
- [ ] GitHub, GitHub Enterprise Server, GitLab.com and GitLab Self-Managed
      remotes pick the right CLI and host.
- [ ] Missing CLI, signed-out CLI and unreachable host each produce a clear,
      translated message and no hang.
- [ ] Output is bounded, sanitized and readable in both themes.
- [ ] `help`, completions and shortcut docs list the new shortcuts with the
      exact commands.
- [ ] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/console/catalogue.rs`
- `src-tauri/src/tooling.rs`
- `src/features/console/`
- `docs/console-shortcuts.md`

# Dependencies

None beyond the completed account tasks of epic 148.

# Decisions

- 2026-10-06: shortcuts only, read-only, using the CLI's own login (owner).

# Implementation notes

# Validation
