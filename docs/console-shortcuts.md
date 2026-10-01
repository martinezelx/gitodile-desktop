# Console shortcuts

The project console runs a shortcut when you type its name. Every built-in
shortcut is read-only: it shows something about the project and changes
nothing, in any console mode. You can rename, remove or add shortcuts with the
`shortcuts` command or the keyboard button in the console's status line;
`help` lists the ones you have, with the Git command each runs.

The names are an app-wide preference. When a GitOdile release adds a built-in
shortcut, it is added to a list you customised unless you had removed it, or
you already use its name for something else.

## Queries

These run a fixed command that Rust keeps for the console. The command shown is
the one you would type; GitOdile adds only what keeps the output inert: no
colour codes, no external diff or text-conversion program, and no signature
check that could start a signing program.

| Shortcut | What it shows | Git command |
| --- | --- | --- |
| `look` | Project status | `git status` |
| `diff` | Unstaged changes | `git diff` |
| `staged` | Changes ready to save | `git diff --cached` |
| `log` | Recent versions | `git log --oneline -20` |
| `graph` | Version graph | `git log --graph --oneline --decorate --all -40` |
| `last` | Latest saved version | `git show --stat HEAD` |
| `branches` | Local branches | `git branch --list` |
| `tags` | Tags | `git tag --list --sort=-creatordate` |
| `remotes` | Remote copies | `git remote -v` |
| `stashes` | Changes set aside | `git stash list` |
| `authors` | Authors | `git shortlog -sn --no-merges HEAD` |

## Command lines

These are ordinary command lines, planned and checked by Rust on every run
exactly as if you had typed them.

| Shortcut | What it shows | Git command |
| --- | --- | --- |
| `short` | Compact project status | `git status --short` |
| `stat` | Unstaged changes per file | `git diff --stat` |
| `today` | Versions saved today | `git log --oneline --since=midnight` |
| `week` | Versions saved this week | `git log --oneline --since=1.week.ago` |
| `unpublished` | Saved versions not yet published | `git log --oneline @{upstream}..HEAD` |
| `incoming` | Newer changes already fetched | `git log --oneline HEAD..@{upstream}` |
| `moves` | Recent moves of HEAD | `git reflog -20` |
| `all-lines` | All version lines, local and remote | `git branch -a -vv` |
| `size` | How much the project stores | `git count-objects -vH` |

`unpublished` and `incoming` compare the current line with its upstream, so on
a line that has never been published Git answers that there is no upstream.
`incoming` shows what the last check for team changes fetched; it does not
reach the remote itself.

## Your own shortcuts

A shortcut can also name a command line of your own, such as
`lg` → `git log --oneline -20`. Rust checks the line when you save it and plans
it again every time it runs; a line that would need more than the console mode
it was saved under does not run. See [ADR 0017](adr/0017-console-git-commands-by-permission-tier.md)
for what the console accepts in each mode.

The words `help`, `clear`, `shortcuts`, `settings` and `git` are reserved for
the console itself.
