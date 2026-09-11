# Roadmap

This roadmap defines the capability sequence and release gates for GitOdile.
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
5. check for, get, and publish project changes, including a diverged history;
6. resolve overlaps without silent data loss;
7. set unfinished work aside and restore it later;
8. recover from the destructive/history-changing operations GitOdile performs;
9. install, update, and run a verified build on Windows, macOS, and Linux.

The local workflow remains provider-neutral and usable without an account.
Native GitHub account login, forks, pull requests, issues, checks, worktrees,
tags/releases, and advanced history rewriting are not part of the `1.0.0`
contract.

## Current baseline

Already delivered:

- open, validate, remember, restore, and switch local projects;
- clone remote projects and safely create a new local project or initialize an
  ordinary existing folder;
- inspect live working-tree state and bounded, readable file diffs;
- save all or selected files with hooks, signing, and index protection;
- discard files or all unsaved work with persistent recovery and Undo;
- discover remotes, check/fetch, fast-forward safely, and publish;
- list, create, switch, and safely delete local version lines;
- browse bounded current-line saved-version history and inspect typed commit
  diffs without changing the project;
- configure Git identity, line endings, themes, language, watching, and
  confirmations;
- enforce typed IPC, repository/session authorization, bounded Git execution,
  mutation planning, invalidation, and architecture checks.

The release-oriented audit of this baseline is complete. Task
[`065-1`](../work/done/065-1-core-workflow-audit.md) owns the capability matrix,
hermetic journeys, Windows desktop evidence, and remaining platform limits.

## GitHub Desktop reference cut

GitHub Desktop is a coverage reference for the basic workflow, not GitOdile's
product specification.

| User capability | Current state | `1.0.0` decision |
| --- | --- | --- |
| Add/open a local repository | Delivered | Audit and harden |
| Clone by remote URL or Git path | Delivered | Staged, verified, provider-neutral flow |
| Create/initialize a local repository | Delivered | Planned, revalidated, explicit local/remote effects |
| Inspect changes and file diffs | Delivered | Audit and harden |
| Commit all or selected files | Delivered | Required; partial-line commits deferred |
| Browse commit history and commit diffs | Delivered | Audit and harden |
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
The order below prioritizes the updater for preview distribution, followed by
the remaining product dependencies. Only one active implementation task should
be worked at a time.

`queue` is the simple ascending execution number. Task IDs remain permanent
references and therefore do not change when priorities move.

| Queue | Task | Outcome |
| --- | --- | --- |
| Q01 | 065-9-1 | Define updater contracts and supported installations |
| Q02 | 065-9-2 | Protect operations and drafts before app installation |
| Q03 | 065-9-3 | Implement the native signed updater lifecycle |
| Q04 | 065-9-4 | Integrate update controls and preferences |
| Q05 | 065-9-5 | Build signed release artifacts in private CI |
| Q06 | 065-9-6 | Publish public releases and stable preview feeds |
| Q07 | 065-9-7 | Qualify signed upgrades and release operations |
| Q08 | 037-1 | Establish conflict truth and recovery |
| Q09 | 037-2 | Select the editor foundation |
| Q10 | 037-3 | Add the read-only conflict workspace |
| Q11 | 037-4 | Resolve text conflicts safely |
| Q12 | 037-5 | Complete or abort a merge |
| Q13 | 037-6 | Handle non-text and structural conflicts |
| Q14 | 037-7 | Audit the conflict workflow |
| Q15 | 065-4 | Integrate local lines and diverged project changes |
| Q16 | 065-5 | Make recovery records visible/actionable |
| Q17 | 065-6 | Undo or reverse a saved version |
| Q18 | 064-1 | Discover and inspect saved sets |
| Q19 | 064-2 | Set all or selected changes aside |
| Q20 | 064-3 | Restore a saved set and keep its copy |
| Q21 | 064-4 | Remove one saved set with recovery |
| Q22 | 064-5 | Audit the set-aside workflow |
| Q23 | 065-7 | Harden credential and remote diagnostics |
| Q24 | 065-8 | Verify and distribute `1.0.0` |

### Preview distribution — current priority

- **Q01–Q07 / 065-9: Signed application updates.** Complete the seven children of
  [epic 065-9](../work/active/release-1.0/065-9-signed-application-updates.md)
  in order: contracts, install protection, native updater, interface, signed
  builds, public publishing, and real upgrade qualification.
- This enables preview distribution before the rest of the 1.0.0 feature set.
  New operations and drafts must integrate with install protection as they land.
  Git credential diagnostics remain Q23 / 065-7; final product qualification
  remains Q24 / 065-8. Completing this epic does not establish 1.0.0 readiness.

### Gate 0 — Prove the existing loop (completed 2026-08-21)

- **065-1: Core workflow audit.** Exercise open → inspect → save → check → get
   → publish → close/reopen against real temporary repositories. Fix only
   defects that violate the already-delivered contract and record a capability
   matrix.

Exit condition met: the current feature set has repeatable end-to-end journeys
and honest Windows desktop evidence. macOS/Linux runtime evidence remains task
065-8's release gate.

### Gate 1 — Complete project entry and understanding

- **065-2 (completed 2026-08-21): Clone a remote project safely.** URL/path validation, destination
   preview, progress/cancellation, partial-clone cleanup, credential errors,
   and automatic opening after verification.
- **065-3 (completed 2026-08-22): Create or initialize a local project.** New
   folder and existing non-repository flows, explicit README/first-save choices,
   exact cleanup ownership, and a separate provider-neutral remote preview.
- **015 (completed 2026-08-24): History timeline.** Bounded, snapshot-aware,
  read-only current-line history and first-parent/root commit details using the
  established typed diff renderer, with a recent-history summary in Overview.

Exit condition: a first-time user can acquire or create a project, make and
save a change, and verify the result in History.

### Gate 2 — Complete collaboration and overlaps

- **Q08–Q14 / 037: Guided conflict resolution.** Deliver its child slices from conflict
   truth/recovery through editing, completion/abort, accessibility, and audit.
   It first supports an externally started merge so its safety model can be
   proven independently.
- **Q15 / 065-4: Integrate version lines and diverged project changes.** Add previewed
   local-branch merge and non-fast-forward team integration. Clean results
   complete normally; overlaps enter task 037's established session contract.

Exit condition: both the clean and conflicting collaboration paths can finish
without a terminal. Rebase and force push remain excluded.

### Gate 3 — Make safety visible and reusable

- **Q16 / 065-5: Recovery center.** Inventory supported recovery records, explain
   retention/eligibility, and perform only state-token-safe restores.
- **Q17 / 065-6: Restore a saved version.** From History, choose a reversible
   strategy: undo unpublished local work or create a new reverting version for
   shared work. Never hide history rewriting or use a destructive hard reset.
- **Q18–Q22 / 064: Set changes aside.** Deliver the five epic children in order;
  discovery/create come first, then restore and
   removal after the conflict and recovery contracts they consume are stable.

Exit condition: destructive and history-changing product actions have a
discoverable recovery lifecycle, and unfinished work can be moved aside and
restored safely.

### Gate 4 — Release candidate

- **Q23 / 065-7: Credential and remote diagnostics.** Verify system credential
    helper behavior for clone/fetch/publish, classify common provider-neutral
    failures, and give actionable remediation. Native provider login remains
    post-`1.0.0`.
- **099 (completed 2026-09-01): Visual-system closure.** Audited every shipped screen, shell
    region, menu, popover, dialog, control family, and representative state
    against the settled radius and control-geometry system. Fix and guard all
    drift before the final platform matrix.
- **Q24 / 065-8: Release hardening and distribution.** Run the complete workflow
    matrix, accessibility and large-repository audits; validate real WebView
    behavior on all supported platforms; produce signed/notarized packages;
    qualify updates and reinstall recovery, versioning, release notes, and
    support docs.

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

current baseline ──> 065-9-1 → 2 → 3 → 4 → 5 → 6 → 7 signed updates
                                                        │
all functional gates ──> 065-7 diagnostics ───────────────┤
099 visual closure (complete) ───────────────────────────┤
                                                        └─> 065-8 release candidate
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
