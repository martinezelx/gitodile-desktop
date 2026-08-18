---
id: 037
title: Add a complete guided conflict-resolution workspace
status: active
priority: high
type: epic
areas:
  - conflicts
  - frontend
  - rust
  - recovery
  - accessibility
  - performance
created: 2026-08-08
completed:
---

# Goal

Add a complete, resumable conflict-resolution experience that lets a user
understand, edit, verify, finish, or safely abandon a conflicted merge without
leaving GitOdrile or needing to interpret conflict markers and Git index stages.

The interaction quality should be comparable to the three-way merge tools in
IntelliJ IDEA and VS Code while remaining native to GitOdrile's language,
visual system, safety model, project sessions, and modular architecture.

The first implementation resolves ordinary Git merge conflicts. Its domain
model must be extensible to rebase, cherry-pick, revert, stash-apply, and patch
conflicts, but those operation-specific continue/skip/abort workflows are not
implemented by this epic.

# User outcome

When Git pauses because two sets of work overlap, the user can:

- see what operation is paused and whether their work is safe;
- find every affected file and understand the type of conflict;
- compare the common starting point, the current version line, and the incoming
  version line using their real names rather than ambiguous `ours`/`theirs`
  labels;
- accept one side, combine both sides, or edit the final result directly;
- move between individual conflict regions and files without losing progress;
- resolve non-text conflicts through safe whole-file choices or an external
  editor when an in-app merge is not possible;
- review the complete result before creating the merge saved version;
- leave the resolver and resume later without cancelling the merge;
- explicitly abort the merge through a preview that explains what will change
  and which recovery path is available.

# Context

Conflict resolution is one of GitOdrile's core differentiators: it is where a
beginner most needs technical truth translated into a safe, guided workflow.
The current implementation already detects conflicted status entries, orders
them first in Overview and Changes, displays a conflict-specific diff state,
detects Git operations in progress, and blocks save/version-line operations
while conflicts remain. It does not expose the three index stages, maintain a
resolution session, edit or stage a result, complete a merge, or abort one.

This epic must begin only after the modular architecture epic (tasks 022–031)
has completed. It must be implemented as an owned `conflicts` feature using the
post-refactor Rust services, typed IPC/session contracts, frontend feature
runtime, invalidation model, style layers, and translation ownership. It must
not add conflict orchestration back to `main.tsx` or Git workflow logic back to
the Tauri composition root.

## Product and navigation decision

**Do not add Conflicts as a permanent primary-sidebar destination.** A conflict
is a temporary repository state and a paused operation, not a place users visit
when everything is healthy. A permanent destination would be empty almost all
the time, compete with Changes, and teach the wrong mental model.

Use a hybrid integration instead:

1. Overview shows the project's highest-priority attention card when a merge is
   paused, with progress and **Resolve overlapping changes**.
2. Changes groups conflicted files first and replaces the passive conflict note
   with the same contextual action.
3. An operation started inside GitOdrile may open the resolver immediately
   after Git reports conflicts, after first explaining that the merge paused.
4. A merge started outside GitOdrile is detected through repository
   invalidation; the app surfaces a non-destructive attention state and lets the
   user choose when to open the resolver.
5. The command palette exposes **Continue resolving overlapping changes** only
   while a supported conflict session exists.
6. The action opens a dedicated project-scoped workspace registered with the
   screen/feature runtime but omitted from persistent navigation. Back returns
   to the originating screen and does not cancel or discard anything.
7. Closing or navigating away preserves the paused merge and saved resolution
   work. **Leave resolver** and **Abort merge** are always separate actions.

This follows the useful common pattern in IntelliJ IDEA and VS Code: conflicts
are discoverable in the normal changes area, but complex resolution gets a
focused three-way editor. It also adopts GitButler's useful principle that a
resolution session should be an explicit, resumable mode with a visible exit
and recovery path, without adopting GitButler's virtual-branch or conflicted-
commit model.

## Selected interaction structure

The dedicated workspace is a focused “resolution desk,” not a modal and not a
replacement visual world. It inherits GitOdrile's opaque Friendly Card
surfaces, semantic tokens, typography, icons, controls, focus treatment, and
compact density for code. Warning color identifies unresolved state; it must
not tint the whole workspace or turn a demanding task into an alarm screen.

```text
┌ Resolve overlapping changes ─ 2 of 5 files complete ────────────────┐
│ Merge paused: feature/login → main        [Leave] [Abort merge…]    │
├───────────────┬──────────────────────────────────────────────────────┤
│ File queue    │ Current: main │ Editable result │ Incoming: feature │
│ ✓ resolved    │ read-only     │ source of truth │ read-only         │
│ ● current     │               │                 │                   │
│ ○ unresolved ├────────────────┴─────────────────┴───────────────────┤
│               │ Conflict 2 of 4   [Use current] [Combine] [Use in.] │
└───────────────┴──────────────────────────────────────────────────────┘
```

- At wide desktop sizes, show the file queue and three aligned panes: current
  version, editable result, and incoming version. The common base is available
  through a labeled comparison toggle/details view.
- At medium widths, keep the file queue and place the two read-only sources
  side by side above a full-width result editor.
- When panes would become unreadably narrow, use the established Changes
  list/detail transition: show either the file queue or the selected file, and
  expose Current / Result / Incoming / Base as keyboard-accessible views.
- Never rely on hover, color, or horizontal scrolling to reveal the action that
  resolves a conflict.
- Preserve the user's sidebar preference. Responsive resolver layout, not a
  surprise change to global navigation state, is responsible for making room.

# Scope

## 1. Conflict domain and session model

- Add an operation-neutral conflict domain that can represent:
  - `merge` in the first implementation;
  - future `rebase`, `cherryPick`, `revert`, `stashApply`, and `applyPatch`
    variants without changing file-side semantics;
  - externally initiated conflicts where GitOdrile does not possess a trusted
    pre-operation snapshot.
- Model the operation, current step, source refs/commits, common base when one
  exists, merge head(s), start origin, repository/session epoch, state token,
  recovery evidence, progress, and allowed next actions.
- Model file resolution independently from operation completion. At minimum,
  distinguish `unresolved`, `editing`, `saved`, `markedResolved`, `stale`, and
  `unsupported` states.
- Derive human labels from operation roles and actual refs. Do not serialize
  generic `ours` and `theirs` as the only meaning: their interpretation changes
  in rebases and other future operations.
- Treat Git's unmerged index entries as authoritative. Do not parse working-
  tree conflict-marker text as the source of truth.
- Read stage 1 (common ancestor), stage 2 (current/HEAD), and stage 3
  (incoming/MERGE_HEAD) through bounded, machine-safe Git plumbing such as
  `git ls-files -u -z` and batched object reads. A missing stage is valid for
  add/delete conflict classes.
- Preserve raw bytes, object IDs, modes, symlink information, paths, and
  rename/origin metadata. Repository content and path names are untrusted.
- Define bounded payloads and lazy per-file content reads; opening a session
  must not send every full file across IPC.
- Persist only the minimum session metadata needed to resume safely. Repository
  identity plus session epoch and fresh Git state remain authoritative after an
  app restart.

## 2. Conflict classification and complete file coverage

Represent and test at least:

- text content conflicts;
- add/add;
- modify/delete and delete/modify;
- rename/rename, rename/delete, and divergent destination paths;
- file/directory conflicts;
- mode and executable-bit conflicts where the platform exposes them;
- symlinks;
- binary files;
- submodule/gitlink entries;
- missing common-base stages;
- paths with spaces, newlines, non-ASCII text, decomposed Unicode, and
  case-only collisions;
- text with LF, CRLF, mixed endings, no final newline, very long lines, and
  unsupported/non-UTF-8 encoding;
- multiple merge heads: detect and explain them, but block unsupported octopus
  resolution rather than guessing at a two-sided model.

Text files get a structured three-way editor. Binary, submodule, symlink,
unsupported-encoding, and structural conflicts get a truthful specialized
decision surface: inspect metadata or supported preview, keep one whole side,
delete when valid, open externally, or leave unresolved. “Complete” means every
Git conflict class has a safe path or an explicit supported limitation; it does
not mean pretending every byte sequence can be merged as text.

## 3. Structured three-way merge data

- Produce aligned regions for base → current and base → incoming changes,
  including automatically merged context and genuinely overlapping regions.
- Preserve Git's already merged non-conflicting work and any user edits in the
  working file. Merely opening the resolver must never regenerate or overwrite
  the working tree.
- Represent regions as structured lines and source ranges. Raw conflict markers
  may be shown in advanced evidence but must not drive the main interaction.
- Bound CPU, memory, line count, line length, Git output, and IPC size. Large
  files must use virtualized rendering and an honest fallback, not freeze the
  WebView.
- Decide the three-way alignment implementation after the architecture
  refactor through a small, recorded spike. Compare at least:
  - using existing Git diff output/parsers plus base-coordinate alignment;
  - a focused Rust diff/merge library behind the Git domain boundary;
  - editor-provided merge primitives.
- Record any new dependency, license, bundle cost, worker strategy, and
  cross-platform consequence. Do not migrate repository semantics away from
  system Git as a side effect.

## 4. Editor foundation

- Select a production editor foundation through an ADR/spike rather than
  building a code editor from `contenteditable` or a plain textarea.
- Evaluate at least CodeMirror 6 and Monaco against:
  - editable result plus synchronized read-only panes;
  - custom conflict gutters and aligned regions;
  - undo/redo, search, selection, copy, syntax-aware display, and large files;
  - keyboard and screen-reader behavior;
  - IME, RTL text, tabs, long lines, and clipboard handling;
  - Vite/Tauri integration, worker/CSP requirements, bundle size, startup cost,
    memory, and lazy loading.
- Lazy-load the resolver/editor chunk only when a project has a supported
  conflict session or idle-prefetch it after such a session is detected. It
  must not affect normal startup or the warm navigation cost of other screens.
- Syntax highlighting is a display aid, never required for resolution
  correctness. Unsupported languages fall back to readable plain text.
- Reuse file-type detection where appropriate without coupling conflict domain
  logic to icon or editor presentation modules.

## 5. Per-region and per-file resolution

- For each overlapping region provide explicit actions:
  - use the current version;
  - use the incoming version;
  - combine both, with the resulting order stated before application;
  - edit the result manually;
  - restore the region to its initial unresolved result.
- Use actual version-line names in visible labels where space allows. Plain
  labels must remain stable when a ref is long, absent, or non-UTF-8.
- Navigate previous/next unresolved region and previous/next unresolved file.
- Show conflict and file progress textually, not only through color or icons.
- Provide undo/redo within the result editor and a separate, confirmed **Reset
  this file's resolution** action.
- Keep **Save result** (write the working file) distinct from **Mark file
  resolved** (update the index). Explain the latter the first time in plain
  language and expose exact `git add`/`git rm` behavior in technical details.
- A whole-file “keep current,” “keep incoming,” or “delete file” action requires
  a scoped preview when it discards one side's complete file.
- Never offer a bulk “accept everything from one side” action without a file
  count, consequences, explicit confirmation, and a recoverable pre-state.
- Deterministic simple-resolution suggestions may be offered with a preview,
  but must never be silently applied or marked resolved.
- External-editor changes invalidate the displayed draft. Offer compare/reload
  choices and never overwrite them automatically.

## 6. Safe writes, staging, reset, and recovery

- Classify result writes and mark-resolved operations as local mutations;
  classify merge completion as a history mutation; classify abort/reset actions
  according to the files, index, and history they can change.
- Every mutation must acquire the post-refactor repository coordinator lock,
  validate canonical repository identity, session epoch, operation kind,
  affected path, object IDs, file token, and overall session token immediately
  before changing data.
- Write result files atomically where filesystem semantics allow. Preserve file
  mode, symlink behavior, line endings, final newline, and unchanged raw bytes.
  Report Windows file locks and partial/uncertain outcomes explicitly.
- Mark a saved file resolved using path-separated Git arguments and the correct
  add/remove behavior. Never construct a shell string or trust a frontend path.
- Before the first resolution mutation, create a recoverable conflict-session
  snapshot that captures enough index and working-tree evidence to:
  - reset an individual file's resolution;
  - recover from a failed/partial write or staging operation;
  - distinguish a GitOdrile-started clean merge from an externally started
    merge whose original dirty state is unknown.
- Define the snapshot storage, lifetime, cleanup, privacy, collision behavior,
  linked-worktree behavior, and reconstruction algorithm in an ADR. A branch or
  commit reference alone is insufficient because it does not capture unmerged
  index stages or unsaved working-file content.
- Restoration of index stages must be implemented through a validated,
  temporary-index strategy and integration tests; do not patch the live index
  opportunistically from the frontend.
- Keep session recovery evidence until the merge completes successfully or the
  user explicitly accepts its cleanup policy. Never delete it on a mere view
  change or app restart.

## 7. Merge completion

- Enable **Finish integration** only when a fresh backend read proves there are
  no unmerged index entries.
- Present a final plan containing:
  - the current and incoming version lines/commits;
  - resolved file count and bounded change summary;
  - the saved version that will be created;
  - hooks/signing implications;
  - the durable recovery reference and conflict-session snapshot;
  - local/history consequences and the fact that nothing is published yet.
- Require explicit confirmation because completion creates history.
- Revalidate the entire operation and state token immediately before executing
  `git merge --continue` or the post-refactor equivalent.
- Reuse established identity, commit-message, hook, signing, structured-error,
  recovery-reference, and post-mutation invalidation contracts. Do not bypass
  hooks, signing, or Git configuration.
- Handle a hook/signing/editor/identity failure without losing resolved files or
  claiming the merge completed. Let the user correct the problem and retry.
- Verify resulting `HEAD`, merge-operation markers, index, working tree,
  recovery references, and session invalidations before showing success.
- On success, return to Overview with a concise explanation and a link to the
  created saved version. Publishing remains a separate action.

## 8. Leaving and aborting

- **Leave resolver** only navigates away. It must state that the merge remains
  paused and preserve all saved work.
- **Abort merge…** opens a Rust-produced plan that identifies files/index/history
  affected, known pre-merge state, available snapshot/recovery reference, and
  whether exact reconstruction can be guaranteed.
- Require explicit confirmation before aborting. Use the operation-specific Git
  abort mechanism only after revalidation; for the first implementation this is
  `git merge --abort` or a safer equivalent justified by the recovery ADR.
- Git documents that `merge --abort` may not fully reconstruct a pre-merge
  state when non-trivial uncommitted changes existed before the merge. Never
  promise exact restoration for an externally initiated merge unless the
  evidence proves it.
- If abort or verification has an uncertain outcome, retain every snapshot and
  recovery reference, report observed repository state, and direct the user to
  Recovery/diagnostics. Do not run a destructive “repair.”

## 9. Integration with the existing app

- Add the resolver through the post-refactor feature descriptor/runtime. Its
  contextual screen, lazy loader, command-palette action, open-project guard,
  keep-alive behavior, and project-scoped eviction must come from that one
  registration contract.
- Keep conflict session state in the originating `ProjectSession`/feature
  store. Switching projects cannot move progress, errors, selection, drafts,
  announcements, or completion actions to another project.
- Screen visibility must never initiate a repository fetch. Project activation,
  explicit refresh, operation results, and typed invalidation events own
  freshness.
- Watch worktree, index, operation-marker, HEAD/ref, and shared-worktree changes
  through bounded typed invalidations. Coalesce bursts caused by saves/staging
  and suppress stale self-responses without hiding external changes.
- Disable incompatible GitOdrile mutations while a merge is paused, with a
  direct explanation and resolver action. Rust remains authoritative if a
  caller bypasses the UI.
- Overview and Changes render the same cached conflict-session summary; they do
  not each rediscover Git state.
- Reuse existing diff/file-list/empty-state visual language where it fits, but
  keep editor and code surfaces fully opaque and highly readable.
- Add English and Spanish copy together. Simple mode leads with “overlapping
  changes”; advanced details name merge, index stages, refs, object IDs, and
  exact commands.

## 10. Accessibility and desktop interaction

- Provide complete keyboard operation for file selection, pane/view switching,
  previous/next conflict, source-choice actions, save, undo/redo, mark resolved,
  leave, final review, and dialogs using platform conventions.
- Maintain visible focus and return focus to the invoking file/action when a
  dialog or the resolver closes.
- Expose pane names, source roles, progress, unresolved counts, and mutation
  results to screen readers without announcing every cursor movement or watcher
  refresh.
- Include an accessible linear conflict view that does not depend on visually
  synchronized columns. The visual three-pane editor alone is not sufficient.
- Do not communicate additions, deletions, conflicts, selection, or resolution
  only through red/green color. Preserve text/sign/gutter/icon cues and WCAG AA
  contrast.
- Support zoomed/scaled text, high-contrast/forced-colors behavior where the
  WebView exposes it, IME input, reduced motion, and comfortable pointer targets.
- Avoid global shortcuts that conflict with editor text entry, OS conventions,
  or assistive technology.

## 11. Performance, cancellation, and diagnostics

- Establish measurable budgets after task 023's baseline for:
  - resolver lazy chunk size and first-open time;
  - Git process count to discover a session and open a file;
  - per-file IPC bytes and output caps;
  - typing latency, scroll performance, memory, and pane synchronization;
  - thousands of conflicted files and very large text conflicts.
- Batch object reads and metadata discovery where it improves process count,
  while retaining lazy/bounded file contents.
- Move expensive diff/alignment work off the WebView interaction path using the
  architecture selected by the spike. Support cancellation/supersession.
- A cancelled read may retain the last truthful snapshot; a cancelled mutation
  must report whether it changed the working file or index.
- Diagnostics may contain object IDs, paths according to privacy policy, bounded
  Git errors, and operation phases, but never raw source content, credentials,
  authenticated URLs, or unbounded hook output.

## 12. Delivery slices

This file is the product/architecture epic. Before implementation, refine it
into focused child tasks without weakening the end-to-end acceptance criteria:

1. [`037-1`](conflicts/037-1-conflict-domain-and-recovery.md): conflict-session
   ADR, Git classification, stage reader, snapshots, and Rust fixtures;
2. [`037-2`](conflicts/037-2-editor-foundation-spike.md): editor/diff spike and
   dependency decision;
3. [`037-3`](conflicts/037-3-read-only-conflict-workspace.md): contextual
   discovery, navigation, file queue, and read-only three-way view;
4. [`037-4`](conflicts/037-4-resolve-text-conflicts.md): editable results, safe
   writes, per-region choices, staging, and per-file reset/recovery;
5. [`037-5`](conflicts/037-5-complete-or-abort-merge.md): merge completion,
   abort planning/execution, hooks/signing, and uncertain outcomes;
6. [`037-6`](conflicts/037-6-non-text-and-structural-conflicts.md): non-text and
   structural conflict surfaces plus external-editor reconciliation;
7. [`037-7`](conflicts/037-7-conflict-workflow-audit.md): accessibility, i18n,
   performance stress, cross-platform desktop QA, and independent audit.

Child tasks may land incrementally only behind honest disabled/incomplete
affordances or a development flag. Do not ship a resolver that can edit results
but cannot safely resume, reset, finish, or abort the operation.

# Out of scope

- Initiating a non-fast-forward merge or choosing a divergence strategy. This
  epic consumes an existing supported merge-conflict state.
- Rebase, cherry-pick, revert, stash-apply, or patch-specific continue, skip,
  edit-commit, and abort behavior. The contracts must allow future variants.
- Interactive rebase, octopus-merge editing, recursive submodule conflict
  resolution, or semantic language-aware merges.
- Automatic or silent conflict resolution.
- An AI resolver. Optional AI assistance remains a later, separately consented
  feature that must disclose exactly which source is transmitted.
- Provider-specific pull-request conflict resolution or cloud editing.
- Replacing the user's global `merge.tool`, `merge.conflictStyle`, editor, line-
  ending, attribute, hook, or signing configuration.
- Publishing the completed merge.
- Turning Recovery into a full primary screen if it has not already been built;
  this epic defines only the minimum conflict-session recovery integration.
- Redesigning Overview, Changes, the application shell, or GitOdrile's visual
  system beyond the contextual states and dedicated resolver workspace.

# Acceptance criteria

## Product and navigation

- [ ] Conflicts are discoverable from Overview, Changes, command palette, and
      an app-started merge result without a permanent sidebar destination.
- [ ] The resolver is a dedicated, project-scoped workspace; leaving it never
      aborts, stages, discards, or completes anything.
- [ ] Simple mode uses plain language and real version-line names; advanced
      details expose exact Git operation, refs, commits, stages, and commands.
- [ ] The workspace matches GitOdrile's established visual system in light and
      dark themes and supports wide, medium, and narrow desktop layouts.

## Domain correctness

- [ ] A typed session distinguishes merge origin, roles, operation state,
      allowed actions, recovery evidence, file states, epochs, and stale tokens.
- [ ] Index stages/object IDs, not working-tree markers, are the authoritative
      conflict source; content is read lazily and within explicit bounds.
- [ ] Every conflict class listed in Scope has a tested in-app resolution path
      or an explicit safe limitation/fallback that cannot corrupt it.
- [ ] Current/incoming role labels remain technically correct under the future
      operation variants represented by the contract.
- [ ] Opening, refreshing, closing, or revisiting the resolver never overwrites
      the working tree or index.

## Resolution and recovery

- [ ] Text conflicts support aligned base/current/incoming evidence, editable
      result, per-region choices, manual editing, search, undo/redo, navigation,
      save, mark resolved, and file reset.
- [ ] Binary, encoding, symlink, submodule, add/delete, rename, and structural
      conflicts provide safe whole-file/specialized choices or remain honestly
      blocked.
- [ ] Save and mark-resolved are distinct, Rust-validated local mutations with
      atomic/bounded failure handling and stale-state rejection.
- [ ] A durable, documented snapshot exists before the first mutation and can
      restore a file's original unmerged index stages and working content.
- [ ] External edits, app restarts, watcher bursts, project switches, linked
      worktrees, and direct concurrent IPC calls cannot silently lose or cross
      resolution state.
- [ ] Bulk side choices and resets require consequences, confirmation, and a
      recovery path; no conflict is ever silently resolved.

## Completion and abort

- [ ] Completion is enabled only after a fresh Rust check finds no unmerged
      entries and requires a history-mutation preview and confirmation.
- [ ] Merge completion revalidates, runs hooks/signing normally, creates or
      retains recovery evidence, verifies the resulting state, and never
      publishes automatically.
- [ ] Hook, signing, identity, editor, state-drift, lock, and verification
      failures preserve resolved work and provide a retry or recovery path.
- [ ] Abort has a separate plan/confirmation and never promises exact recovery
      for an external dirty merge without supporting evidence.
- [ ] Partial or uncertain completion/abort outcomes retain recovery artifacts
      and report observed Git state without destructive automatic repair.

## Accessibility, performance, and quality

- [ ] The entire primary workflow is keyboard accessible with visible focus,
      correct focus restoration, restrained announcements, and a screen-reader-
      usable linear alternative to the visual three-pane editor.
- [ ] Status and diff meaning never depend on color alone; both themes, reduced
      motion, forced colors where available, English, Spanish, text scaling,
      IME, RTL content, and platform shortcuts are audited.
- [ ] Resolver code/editor/dictionaries are lazy and do not regress normal
      startup, screen switching, or unrelated feature chunks.
- [ ] Process/output/IPC/content/memory bounds, cancellation, virtualization,
      typing latency, large-file behavior, and thousands-of-files behavior meet
      the budgets recorded after task 023.
- [ ] Windows desktop validation passes; macOS and Linux behavior is covered in
      CI/manual environments where available, with concrete residual risks.
- [ ] An independent final audit verifies the complete flow from an actual
      conflicted temporary repository through resolve, reset, resume, complete,
      abort, recover, and app restart.

# Required tests and audit

## Rust unit tests

- Porcelain/unmerged-index parsing for every stage combination and conflict
  class, including malformed and bounded output.
- Operation-role mapping, state tokens, epoch validation, allowed actions, and
  stale-state classification.
- Three-way alignment/hunk generation, line endings, missing base, long lines,
  invalid encodings, binary detection, modes, and symlinks.
- Snapshot manifest, collision/retention policy, temporary-index reconstruction,
  atomic write outcomes, and privacy-safe diagnostics.
- Complete/abort planners and structured errors for identity, hooks, signing,
  locks, cancellation, verification, and uncertain outcomes.

## Rust integration tests

Use temporary repositories and real system Git for:

- content, add/add, modify/delete, rename, directory/file, mode, symlink,
  binary, submodule, and multiple-file conflicts;
- conflicts initiated inside and outside GitOdrile, with clean and dirty
  pre-merge states;
- save, stage, unstage/reset resolution, restart/resume, final merge commit,
  abort, failed abort, and snapshot recovery;
- hooks, signing, missing identity, file locks, non-ASCII/newline paths, CRLF,
  non-UTF-8 bytes, linked worktrees, concurrent mutations, and stale epochs;
- byte-for-byte preservation of content/mode/index outside intended paths;
- recovery artifacts retained after every injected partial failure.

## Frontend tests

- Contextual entry visibility and absence from permanent navigation.
- File queue ordering/filtering/progress and every file/session state.
- Source-role labels, region actions, result editing, undo/redo, navigation,
  save/mark/reset, stale/external-edit prompts, leave, completion, and abort.
- Project switch/close/reopen isolation and ignored stale responses.
- Wide, medium, narrow, light, dark, loading, empty, unsupported, error,
  partial, success, and recovery states in English and Spanish.
- Keyboard, focus, screen reader, accessible linear diff, color-independent
  meaning, reduced motion, text scaling, IME, and RTL-content behavior.

## Desktop and performance audit

- Real Tauri workflow on Windows plus available macOS/Linux environments.
- Large text conflicts, long lines, large binary files, and thousands of files.
- Editor lazy-load/chunk/CSP/worker behavior, first-open timing, typing latency,
  scroll/pane synchronization, memory release, Git process counts, and IPC caps.
- External editor and terminal mutations while the resolver is open.
- App crash/relaunch or forced close at each mutation boundary.

# Relevant files

- `AGENTS.md`
- `PRODUCT.md`
- `DESIGN.md`
- `docs/PRODUCT_STRATEGY.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `work/active/architecture/022-modular-feature-architecture.md`
- `work/active/architecture/024-rust-execution-and-repository-access.md`
- `work/active/architecture/025-ipc-session-and-watcher-contracts.md`
- `work/active/architecture/026-frontend-feature-runtime.md`
- `work/active/architecture/028-migrate-repository-read-features.md`
- `work/active/architecture/029-migrate-save-and-publish-mutations.md`
- `work/active/architecture/030-feature-styles-and-translations.md`
- `work/active/architecture/031-architecture-integration-audit.md`
- `work/done/009-changes-and-diff-viewer.md`
- `work/done/020-live-working-tree-updates.md`
- `src/screens.tsx`
- `src/changes.tsx`
- `src/repositoryOverview.ts`
- `src/projectSessions.ts`
- `src/appError.ts`
- `src-tauri/src/lib.rs`

# External references and extracted principles

- [JetBrains: Resolve Git conflicts](https://www.jetbrains.com/help/idea/resolve-conflicts.html)
  — contextual discovery in Changes; dedicated three-pane tool; editable result;
  per-region choices; file sequence; reset of a resolution.
- [VS Code: Resolve merge conflicts](https://code.visualstudio.com/docs/sourcecontrol/merge-conflicts)
  — Merge Changes grouping; incoming/current/result roles; unresolved count;
  manual result editing; explicit complete/abort actions; alternate layouts.
- [Git: `git merge`](https://git-scm.com/docs/git-merge)
  — authoritative index stages, operation markers, continue/abort semantics,
  `AUTO_MERGE`, and the limitation of abort after pre-existing dirty changes.
- [GitButler: Conflict Resolution](https://docs.gitbutler.com/cli-guides/cli-tutorial/conflict-resolution)
  and [Operations History](https://docs.gitbutler.com/features/timeline) — explicit,
  resumable resolution mode and pre-operation snapshots. Reuse the principles,
  not GitButler's conflicted-commit storage or virtual-branch model.

References are product/engineering evidence, not specifications. Recheck exact
versions and licenses during implementation and record any adapted architectural
conclusion in the required ADRs.

# Dependencies

- Tasks 022–031 must be complete; task 031's audit must prove the greenfield
  feature/runtime contract before this epic begins.
- Task 028 must own repository status/diff reads and task 029 must own mutation
  planning/execution before the resolver adds new conflict reads and mutations.
- The conflict-session recovery ADR may extend the recovery-reference contract
  introduced by inbound integration work, but must not assume a commit/ref alone
  captures unmerged index and working-tree state.
- Task 014's fast-forward-only behavior remains unchanged; it cannot produce a
  merge conflict. A future guided non-fast-forward integration task may invoke
  this resolver, but this epic must also handle an already-paused external merge.

# Decisions

- This is an epic because an IntelliJ-quality resolver crosses Git plumbing,
  recovery, editor infrastructure, mutation safety, navigation, accessibility,
  performance, and cross-platform behavior. Child tasks will be refined after
  the architecture refactor.
- No permanent Conflicts navigation item. Use contextual entry points and a
  dedicated transient workspace.
- Implement merge conflicts first; design operation roles and state transitions
  for future rebase/cherry-pick/revert support without implementing them.
- Use index stages as truth and keep working-tree contents as the user's current
  result; opening the resolver is read-only.
- Separate save, mark-resolved, finish, leave, and abort. None implies another.
- Preserve a conflict-session snapshot before mutation; a branch reference is
  not sufficient recovery for unmerged/unsaved state.
- No silent resolution, global one-side acceptance, Git-config rewrite, hook or
  signing bypass, automatic publish, or AI transmission.
- Editor and diff dependencies require a measured ADR/spike after refactoring.
- Dense editor surfaces remain opaque and use the established design tokens;
  the resolver extends GitOdrile rather than creating a separate IDE aesthetic.

# Implementation notes

Complete during implementation. Record child-task IDs, ADRs, final module and
port paths, public IPC shapes, editor/diff decision, dependency licenses,
snapshot format and retention, operation-state machine, invalidation rules,
Git commands/process counts, performance budgets, platform deviations, and
follow-up operation variants.

# Validation

No implementation checks apply to this planning-only task yet. During each
child task, record exact focused checks and the required project-wide commands:

```bash
pnpm run typecheck
pnpm run test
pnpm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

The epic is complete only after every acceptance criterion and the independent
end-to-end desktop audit pass; completing an editor demo is not sufficient.
