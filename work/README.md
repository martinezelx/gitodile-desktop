# Local work management

GitOdrile tracks product and engineering work inside this directory. The repository is the source of truth; external issue trackers are optional mirrors, never required context.

## Structure

- `backlog.md` — unrefined ideas and future work. Items here are not approved for implementation.
- `active/` — approved tasks that may be implemented.
- `blocked/` — tasks that cannot proceed, with the blocker documented.
- `done/` — completed tasks kept as a lightweight project history.
- `templates/task.md` — template for new task files.

## Task naming

Use a zero-padded numeric ID and a short kebab-case title:

```text
001-open-local-repository.md
002-detect-git-version.md
```

IDs are permanent and must not be reused, even after a task moves to `done/`.
A narrowly scoped child may append a suffix to its parent's ID (for example,
`010-1-version-title-and-description.md`); that full ID is also permanent and
unique.

A multi-task epic may group its child task files in a subfolder under
`active/` (e.g. `active/architecture/`) to signal priority and keep the
folder root readable. The subfolder name matches the epic's theme, not its
task ID.

## Workflow

1. Capture rough ideas in `backlog.md`.
2. Refine an idea into an individual task using `templates/task.md`.
3. Put approved work in `active/` with `status: active`.
4. Work on one active task at a time unless the user explicitly approves parallel work.
5. Keep scope, acceptance criteria, decisions, and notes updated while implementing.
6. If work cannot continue, set `status: blocked`, explain why, and move it to `blocked/`.
7. Before completion, run `pnpm run check` and record the results honestly.
8. When complete, check the acceptance criteria, add implementation notes, set `status: done`, add `completed`, and move the file to `done/`.

## Agent rules

- Read `AGENTS.md`, `DESIGN.md`, relevant files under `docs/`, this file, and the selected active task before coding.
- Do not implement an item from `backlog.md` unless it has been promoted to `active/` or the user explicitly asks for it.
- Do not silently broaden scope.
- Record material scope changes and decisions in the task.
- Never mark an acceptance criterion complete unless it is actually satisfied.
- Never claim checks passed unless they were executed successfully.
- Keep durable product or architectural knowledge in `docs/`; task files should record execution-specific context.
- Do not delete completed task files. Move them to `done/`.
- Keep relative Markdown links valid after moving a task; `check:docs` enforces
  links, folder/status consistency, completion dates, and unique IDs.

## Status values

Use exactly one of:

- `active`
- `blocked`
- `done`

Backlog ideas do not require frontmatter until promoted into a task.
