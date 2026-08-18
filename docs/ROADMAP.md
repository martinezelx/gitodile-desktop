# Roadmap

This roadmap defines the capability sequence and release gates for GitOdrile.
It is not a calendar promise. Approved implementation scope and acceptance
criteria live under [`work/active/`](../work/active/).

## Release objective

The next product milestone is a trustworthy `1.0.0`, not feature-count parity
with every GitHub Desktop menu item. A `1.0.0` user must be able to complete the
ordinary lifecycle of a project without falling back to the terminal:

1. open an existing project, clone a remote project, or create a local project;
2. understand and inspect current changes;
3. save all or selected files as a version and review saved history;
4. create, switch, publish, integrate, and remove version lines safely;
5. check for, get, and publish team changes, including a diverged history;
6. resolve overlaps without silent data loss;
7. set unfinished work aside and restore it later;
8. recover from the destructive/history-changing operations GitOdrile performs;
9. install, update, and run a verified build on Windows, macOS, and Linux.

The local workflow remains provider-neutral and usable without an account.
Native GitHub account login, forks, pull requests, issues, checks, worktrees,
tags/releases, and advanced history rewriting are not part of the `1.0.0`
contract.

## Current baseline

Already delivered:

- open, validate, remember, restore, and switch local projects;
- inspect live working-tree state and bounded, readable file diffs;
- save all or selected files with hooks, signing, and index protection;
- discard files or all unsaved work with persistent recovery and Undo;
- discover remotes, check/fetch, fast-forward safely, and publish;
- list, create, switch, and safely delete local version lines;
- configure Git identity, line endings, themes, language, watching, and
  confirmations;
- enforce typed IPC, repository/session authorization, bounded Git execution,
  mutation planning, invalidation, and architecture checks.

The first action is therefore a release-oriented audit of this baseline, not a
new feature. Task [`065-1`](../work/active/release-1.0/065-1-core-workflow-audit.md)
owns that evidence.

## GitHub Desktop reference cut

GitHub Desktop is a coverage reference for the basic workflow, not GitOdrile's
product specification.

| User capability | Current state | `1.0.0` decision |
| --- | --- | --- |
| Add/open a local repository | Delivered | Audit and harden |
| Clone by remote URL | Missing | Required: task 065-2 |
| Create/initialize a local repository | Missing | Required: task 065-3 |
| Inspect changes and file diffs | Delivered | Audit and harden |
| Commit all or selected files | Delivered | Required; partial-line commits deferred |
| Browse commit history and commit diffs | Missing | Required: task 015 |
| Create, switch, publish, and delete branches | Mostly delivered | Audit; publish uses the existing remote flow |
| Fetch, fast-forward pull, and push | Delivered | Audit and harden |
| Merge a local branch or diverged upstream | Missing | Required: task 065-4 |
| Resolve merge conflicts | Missing | Required: epic 037 |
| Stash and restore unfinished work | Missing | Required: task 064 |
| Undo/revert earlier work safely | Partial recovery plumbing only | Required: tasks 065-5 and 065-6 |
| GitHub login, forks, pull requests, issues, checks | Missing | Deferred; provider-specific and not needed for the local core |
| Rebase, force push, amend, cherry-pick, squash, reorder | Missing | Deferred; history rewriting is not needed for the first safe workflow |

## Ordered path to `1.0.0`

The release epic is [`065`](../work/active/release-1.0/065-release-1.0.md).
The order below is dependency order; only one active implementation task should
be worked at a time.

`queue` is the simple ascending execution number. Task IDs remain permanent
references and therefore do not change when priorities move.

| Queue | Task | Outcome |
| --- | --- | --- |
| Q01 | 065-1 | Audit the existing core workflow |
| Q02 | 065-2 | Clone and open a remote project |
| Q03 | 065-3 | Create or initialize a local project |
| Q04 | 015 | Browse saved-version History |
| Q05 | 037-1 | Establish conflict truth and recovery |
| Q06 | 037-2 | Select the editor foundation |
| Q07 | 037-3 | Add the read-only conflict workspace |
| Q08 | 037-4 | Resolve text conflicts safely |
| Q09 | 037-5 | Complete or abort a merge |
| Q10 | 037-6 | Handle non-text and structural conflicts |
| Q11 | 037-7 | Audit the conflict workflow |
| Q12 | 065-4 | Integrate local lines and diverged team changes |
| Q13 | 065-5 | Make recovery records visible/actionable |
| Q14 | 065-6 | Undo or reverse a saved version |
| Q15 | 064-1 | Discover and inspect saved sets |
| Q16 | 064-2 | Set all or selected changes aside |
| Q17 | 064-3 | Restore a saved set and keep its copy |
| Q18 | 064-4 | Remove one saved set with recovery |
| Q19 | 064-5 | Audit the set-aside workflow |
| Q20 | 065-7 | Harden credential and remote diagnostics |
| Q21 | 065-8 | Verify and distribute `1.0.0` |

### Gate 0 — Prove the existing loop

- **Q01 / 065-1: Core workflow audit.** Exercise open → inspect → save → check → get
   → publish → close/reopen against real temporary repositories. Fix only
   defects that violate the already-delivered contract and record a capability
   matrix.

Exit condition: the current feature set has one repeatable end-to-end test and
honest desktop evidence. This is the immediate next task.

### Gate 1 — Complete project entry and understanding

- **Q02 / 065-2: Clone a remote project safely.** URL/path validation, destination
   preview, progress/cancellation, partial-clone cleanup, credential errors,
   and automatic opening after verification.
- **Q03 / 065-3: Create or initialize a local project.** New folder and existing
   non-repository folder flows, optional starter files, identity guidance, and
   an explicit remote-connection path.
- **Q04 / 015: History timeline.** Bounded, read-only current-line history and
   commit details using the established diff renderer.

Exit condition: a first-time user can acquire or create a project, make and
save a change, and verify the result in History.

### Gate 2 — Complete collaboration and overlaps

- **Q05–Q11 / 037: Guided conflict resolution.** Deliver its child slices from conflict
   truth/recovery through editing, completion/abort, accessibility, and audit.
   It first supports an externally started merge so its safety model can be
   proven independently.
- **Q12 / 065-4: Integrate version lines and diverged team changes.** Add previewed
   local-branch merge and non-fast-forward team integration. Clean results
   complete normally; overlaps enter task 037's established session contract.

Exit condition: both the clean and conflicting collaboration paths can finish
without a terminal. Rebase and force push remain excluded.

### Gate 3 — Make safety visible and reusable

- **Q13 / 065-5: Recovery center.** Inventory supported recovery records, explain
   retention/eligibility, and perform only state-token-safe restores.
- **Q14 / 065-6: Restore a saved version.** From History, choose a reversible
   strategy: undo unpublished local work or create a new reverting version for
   shared work. Never hide history rewriting or use a destructive hard reset.
- **Q15–Q19 / 064: Set changes aside.** Deliver the five epic children in order;
  discovery/create come first, then restore and
   removal after the conflict and recovery contracts they consume are stable.

Exit condition: destructive and history-changing product actions have a
discoverable recovery lifecycle, and unfinished work can be moved aside and
restored safely.

### Gate 4 — Release candidate

- **Q20 / 065-7: Credential and remote diagnostics.** Verify system credential
    helper behavior for clone/fetch/publish, classify common provider-neutral
    failures, and give actionable remediation. Native provider login remains
    post-`1.0.0`.
- **Q21 / 065-8: Release hardening and distribution.** Run the complete workflow
    matrix, accessibility and large-repository audits; validate real WebView
    behavior on all supported platforms; produce signed/notarized packages;
    establish updates, rollback, versioning, release notes, and support docs.

Exit condition: all `1.0.0` acceptance criteria pass, there are no known
data-loss defects, and every advertised platform has evidence from the actual
artifact being shipped.

## Dependency map

```text
065-1 audit
  ├─> 065-2 clone ───────────────┐
  ├─> 065-3 create/connect ──────┤
  └─> 015 history ──> 065-6 restore saved version

037 conflict resolver ──> 065-4 branch/divergence integration
          │
          └──────────────> 064 stash restore

existing recovery records + 037 recovery contract
          └──────────────> 065-5 recovery center ──> 065-6

all functional gates ──> 065-7 diagnostics ──> 065-8 release candidate
```

Task 064 discovery and create slices may be developed before task 037, but its
restore-conflict path cannot be complete until task 037 owns `stashApply`.
Task 065-8 is the only task allowed to make a release-readiness claim.

## Version markers

These markers describe maturity and may be combined into fewer public builds:

- `0.2`: audited existing core loop;
- `0.3`: clone/create/history complete;
- `0.4`: clean and conflicting collaboration complete;
- `0.5`: recovery center, saved-version restore, and set-aside complete;
- `0.9`: feature freeze; diagnostics and release hardening only;
- `1.0.0`: every release-epic gate satisfied on shipped artifacts.

Version numbers advance only when their exit conditions are met. They are not
deadlines.

## After `1.0.0`

Post-`1.0.0` priorities are selected from [`work/backlog.md`](../work/backlog.md)
using the product test in [`PRODUCT_STRATEGY.md`](PRODUCT_STRATEGY.md). Likely
themes are partial-file/line workflows, compare and advanced history actions,
provider integrations, worktrees, repository health, and optional local or
consented AI assistance.
