# ADR 0035: Use branches as the product vocabulary

- Status: accepted
- Date: 2026-10-21
- Supersedes: the experimental branch vocabulary and stored names; recovery
  safety policies from ADRs 0016 and 0034 still apply.

## Context

An earlier private branch metaphor introduced an unfamiliar noun for a concept
people already recognize in Git, hosting services and learning material.
GitOdile is still in development and has no users to migrate. The user explicitly
accepts breaking old preferences and recovery compatibility, and requests the
same vocabulary in historical documentation, release notes and prototypes.

## Decision

Use **branch / branches** in English and **rama / ramas** in Spanish, including
simple mode. Navigation is **Branches / Ramas**. Actions still explain intent
and consequences in ordinary language. A branch is distinct from a linked
worktree; workspace describes that workspace rather than a synonym for a branch.

The frontend feature is `src/features/branches/`, the Rust owner `branches.rs`,
and the screen identifier `branches`. Types, components, CSS classes, functions,
fields, History scopes and IPC commands use the same vocabulary. Text lines,
command lines, line endings, software-version rows and graph strokes retain
their actual meaning.

Read only current preferences: branch favourites use
`gitodile-favourite-branches`, folds use `gitodile-branch-folds`, and navigation
validates current destination IDs. Invalid or unavailable storage is handled
safely. The built-in console shortcut is `all-branches`, running
`git branch -a -vv`. There are no old-key readers, alias rewrites or branch
preference migration tests. Existing unused data is left untouched.

Branch-deletion recovery uses
`refs/gitodile/recovery/v1/delete-branch/<owner-id>/<recovery-id>` and manifests
under `<common-git-dir>/gitodile/history-recovery/v1/delete-branch/`.
Batch clean-up uses the corresponding `clean-up-branches` namespace and
directory. The record's operation follows that slug. No legacy reader or
migration is provided; old experimental records and refs remain untouched.
Team-update recovery is unchanged.

Normalize the branch concept in existing ADRs, completed tasks, measured
baselines, release material and prototypes too. Rename related filenames and
repair their links, preserving task IDs, dates, commit hashes and measured
numbers. Git history retains the original versions.

All recovery safety requirements remain: verified references before supported
destructive operations, per-worktree ownership, pending-record reconciliation,
retention of 20 single-delete or 50 clean-up records, and accurate partial or
uncertain outcomes. This change does not rename actual repository branches or
delete user data.

## Consequences

- Product language and implementation names match Git and other tools.
- Frontend and Rust must ship the contract change together.
- Development preferences and old recovery namespaces have no compatibility
  guarantee; migration scaffolding would add maintenance without users to serve.
- Historical text uses the canonical vocabulary while retaining its evidence.

## Alternatives considered

- Keep a private metaphor: rejected because it requires learning another noun.
- Rename only navigation: rejected because it leaves conflicting copy and code.
- Add compatibility readers: rejected because the user explicitly accepts the
  break and there are no existing users to migrate.
- Preserve the old terminology in historical material: rejected by the user's
  follow-up request to normalize those references too.
- Replace text-line and graph terminology as well: rejected because they are
  different concepts.
