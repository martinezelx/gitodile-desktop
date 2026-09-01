# Task 023 GitButler research record

GitButler was inspected only to answer narrow GitOdile architecture questions:
how to isolate desktop transport, normalize IPC failures, keep feature services
independent of Tauri, model watcher invalidations and centralize repository
context. This record is evidence for [ADR 0003](../adr/0003-adopt-a-modular-feature-architecture.md),
not a source-code dependency or a target repository layout.

## Exact revision and license

- Repository: `gitbutlerapp/gitbutler`.
- Revision: [`b98b6dc84a6d8a33332eb41543f20d97cab676a9`](https://github.com/gitbutlerapp/gitbutler/commit/b98b6dc84a6d8a33332eb41543f20d97cab676a9),
  committed 2026-08-07 at 15:12:34 UTC.
- License inspected at that revision:
  [`LICENSE.md`](https://github.com/gitbutlerapp/gitbutler/blob/b98b6dc84a6d8a33332eb41543f20d97cab676a9/LICENSE.md),
  FSL-1.1-MIT.

The FSL terms prohibit Competing Use before the applicable Future License
date, after which the covered version becomes MIT. The license defines that
date per version as the second anniversary of the version becoming available;
the commit timestamp alone is useful traceability but is not substituted for
legal advice about a particular file or release. GitOdile therefore treats
this snapshot as restricted reference material: no source, macros, tests,
crate topology, product language or visual assets were copied or adapted.
Only independently expressed engineering principles were retained.

## Small subsystems inspected

| GitButler file at the pinned revision | Question asked | Independently retained principle |
| --- | --- | --- |
| [`apps/desktop/src/lib/backend/backend.ts`](https://github.com/gitbutlerapp/gitbutler/blob/b98b6dc84a6d8a33332eb41543f20d97cab676a9/apps/desktop/src/lib/backend/backend.ts) | Can feature code depend on a desktop capability without importing Tauri everywhere? | Put the narrow invoke/listen capability behind an application-owned backend contract and wire its implementation at the composition root. |
| [`apps/desktop/src/lib/backend/ipc.ts`](https://github.com/gitbutlerapp/gitbutler/blob/b98b6dc84a6d8a33332eb41543f20d97cab676a9/apps/desktop/src/lib/backend/ipc.ts) and [`tauri.ts`](https://github.com/gitbutlerapp/gitbutler/blob/b98b6dc84a6d8a33332eb41543f20d97cab676a9/apps/desktop/src/lib/backend/tauri.ts) | Where should transport errors and Tauri-specific details stop? | Normalize transport failures once, keep the adapter small and expose stable application errors to callers. |
| [`apps/desktop/src/lib/files/fileService.ts`](https://github.com/gitbutlerapp/gitbutler/blob/b98b6dc84a6d8a33332eb41543f20d97cab676a9/apps/desktop/src/lib/files/fileService.ts) | What should a frontend feature service receive? | Inject the capability it needs instead of importing a global desktop API from visual components. |
| [`crates/but-api/src/watcher.rs`](https://github.com/gitbutlerapp/gitbutler/blob/b98b6dc84a6d8a33332eb41543f20d97cab676a9/crates/but-api/src/watcher.rs) | How can watcher output express meaning rather than raw filesystem noise? | Translate platform events into tagged domain invalidations before crossing the renderer boundary. |
| [`crates/but-ctx/src/project_handle.rs`](https://github.com/gitbutlerapp/gitbutler/blob/b98b6dc84a6d8a33332eb41543f20d97cab676a9/crates/but-ctx/src/project_handle.rs) | Where should repository/project context be established? | Centralize conversion from project identity to an authorized repository context instead of reopening arbitrary paths in each command. |

## GitOdile conclusions

These principles support, but do not dictate, the selected design:

- renderer features use feature-owned ports with a small Tauri adapter;
- Rust IPC validates and delegates to application modules;
- repository authorization and related-worktree scheduling live in one Rust
  coordinator keyed by `commonGitDir` where appropriate;
- watcher events become typed invalidations and carry GitOdile's own session
  epoch contract;
- errors are normalized at the transport boundary without exposing raw Git or
  command output as the primary message.

GitOdile deliberately does not adopt GitButler's monorepo/crate boundaries,
Svelte/Redux choices, virtual-branch workflow, cloud services or naming. The
smallest independent implementation remains the rule for tasks 024-031.
