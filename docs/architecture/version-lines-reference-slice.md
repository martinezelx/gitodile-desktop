# Version-lines reference slice

Task 027 is the first complete feature slice through the screen registry,
frontend lifecycle, typed Tauri boundary and Rust domain service. Its public
frontend API is `src/features/version-lines/index.ts`; its native owner is
`src-tauri/src/version_lines.rs`.

## Mandatory feature contracts

New repository-backed screens must preserve these mechanics:

1. Keep domain types, UI, controller/store, typed port and concrete adapter
   with the feature owner. The app shell may construct and connect them, but it
   must not know command names, request generations or cache transitions.
2. Key repository snapshots by both canonical project id and Rust-issued
   session epoch. A close invalidates the old generation; reopening the same
   path creates an unrelated cache entry.
3. Deduplicate one in-flight request per query, let mutation results supersede
   older reads, reject stale generations, preserve object identity for an
   unchanged answer, and keep the last truthful snapshot visible on error.
4. Warm caches only from project activation, explicit refresh, successful
   mutation or typed repository invalidation. Screen arrival is not a refresh
   reason. Hidden screens unsubscribe and synchronize to the current atomic
   snapshot when reactivated.
5. Bound inactive snapshots and evict the complete project incarnation on
   close. Version lines retains at most eight inactive project snapshots.
6. Keep the frontend port free of Tauri names and casing. Only the adapter maps
   the stable task-025 commands and payloads. Every migrated call supplies its
   session epoch.
7. Keep Tauri adapters thin. Rust services authorize repository access at the
   application boundary, use the common-Git-dir coordinator and the bounded
   Git runner, and return the established structured error envelope.

## Version-lines policy that must not be generalized

- `head_or_refs` and `shared_repository` invalidate branch inventory;
  `worktree` alone does not. Another feature must choose its own taxonomy.
- Structural equality compares branch tips, upstream state, uniqueness and
  worktree occupancy because those facts control this screen. History will
  need commit-page equality, not this comparator.
- The eight-snapshot limit is appropriate for the small bounded branch
  inventory. It is not a default page count or byte limit for every feature.
- Search, prefix/state filters, `Local-only first`, popup behavior and
  create/switch/delete plans belong only to Version lines.

## Applying the slice to History

History should add `src/features/history/` and follow the mandatory contracts
above without copying the Version-lines store or invalidation policy. Define a
typed history query (including pagination/cursor identity), page equality and
an explicit byte/row eviction budget. Register one lazy `ScreenModule`, render
the cached first page on arrival, suspend subscriptions while hidden, and warm
only from activation or relevant invalidations. History is read-only in its
first task, so it should expose only read ports; do not inherit mutation phases
or branch state tokens merely because the reference slice has them.

On Rust, add a history-owned service module that depends inward on application
authorization, repository access and the Git runner. Do not place parsing or
graph walks in `lib.rs` or `ipc.rs`, and extend the repository-owned Rust
architecture test when the new module introduces another enforceable edge.
