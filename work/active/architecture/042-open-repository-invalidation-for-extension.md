---
id: 042
title: Let features subscribe to repository invalidation instead of being wired in
status: active
priority: normal
type: chore
areas:
  - frontend
  - architecture
created: 2026-08-10
completed:
---

# Goal

Replace the read coordinator's positional per-feature parameters with registered
invalidation subscribers, so adding a screen that needs freshness does not mean
editing another feature.

# User outcome

No visible change. Freshness behavior — watcher coalescing, mutation
supersession, deferral during unsettled operations — must stay identical.

# Context

`createRepositoryReadCoordinator(repository, status, versionLines)` in
`src/features/repository/readCoordinator.ts` takes one positional controller per
dependent feature, and `refreshAll` and `refreshAfterMutation` call each by name:

```ts
void versionLines.refresh({ projectId: path, sessionEpoch: epoch });
...
versionLines.supersede(query);
```

Task 031's greenfield proof built a History-shaped screen and found this is the
one place a new screen cannot avoid touching another feature. Adding it meant a
fourth parameter plus two hardcoded calls, so the repository feature ends up
knowing about every feature that consumes invalidation, and the list grows with
each screen.

It is compile-checked and it works. It did not block History. But it is the only
seam in the architecture that gets worse with each addition, which makes it the
right thing to fix before History, Recovery and conflicts each add a line.

The refactor has a real trap. `refreshAll` is ordered on purpose: it reopens the
repository and dispatches identity first, then refreshes version lines, then
awaits status. A naive subscriber list that fans out concurrently would change
which snapshot wins a race. Whatever replaces it must preserve ordering and the
await points, or prove with a test that the new order is equivalent.

ADR 0003 rejects "indirection with one concrete use". This has three consumers
today and a fourth arriving with History, so a registry here is justified —
but it must stay a list of subscribers, not a framework.

# Scope

- Introduce a narrow invalidation-subscriber contract — enough for `refresh` and
  `supersede` against a project/epoch query, and nothing more.
- Let the composition root register the status, version-lines and any future
  feature controllers as subscribers.
- Preserve `refreshAll`'s ordering guarantees and its identity-first dispatch.
- Keep the existing mutation-supersession, watcher-deferral and
  session-close semantics exactly as they are.
- Cover the ordering with a test that would fail if subscribers fanned out
  concurrently.
- Update the frontend feature guide §8, which currently records this as the one
  remaining gap for greenfield screens.

# Out of scope

- Changing what any feature does on invalidation.
- A general event bus, dependency container or plugin system.
- Moving the coordinator out of `features/repository`. Repository identity is
  genuinely the freshness owner; only the fan-out mechanism is at issue.

# Acceptance criteria

- [ ] Adding a feature that consumes invalidation requires no edit inside
      `features/repository`.
- [ ] `refreshAll` ordering and await points are preserved, with a test that
      catches reordering.
- [ ] Existing repository, status and version-lines controller tests pass
      unchanged.
- [ ] Watcher burst deferral, mutation supersession and session-close cleanup
      behave identically.
- [ ] The frontend feature guide no longer lists this as a gap.
- [ ] Full `AGENTS.md` validation passes.

# Relevant files

- `src/features/repository/readCoordinator.ts`
- `src/features/repository/controller.test.ts`
- `src/main.tsx`
- `docs/architecture/frontend-feature-guide.md`

# Dependencies

None. Should land before task 015 (History) if History is worked in parallel,
so History is not wired in by hand and then migrated.

# Decisions

- Subscribers, not an event bus. The coordinator keeps deciding *when* and *in
  what order* to refresh; it stops needing to know *who*.

# Implementation notes

Complete during implementation.

# Validation

Run the complete `AGENTS.md` command set.
