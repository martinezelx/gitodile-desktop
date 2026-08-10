---
id: 044
title: Keep test-only modules out of production space and teach the guard to see them
status: active
priority: low
type: chore
areas:
  - frontend
  - architecture
created: 2026-08-10
completed:
---

# Goal

Move `src/testScreenModule.tsx` where the architecture guard recognizes it as
test-only, so the existing "production must not import a test module" rule can
actually fire.

# User outcome

No visible change. It closes a hole in a guard the project already relies on.

# Context

`scripts/check-frontend-architecture.mjs` reports a violation when a production
module imports a test-only one. It decides what is test-only with:

```js
/(?:^|\/)(?:test-fixtures|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/
```

`src/testScreenModule.tsx` matches none of those. It is a fixture that exists
purely so `screenModule.test.tsx` can prove the runtime contract without giving
a real feature a test-only responsibility — a good reason for it to exist, and
the wrong place for it to live. The guard currently classifies it as production,
so if a production file imported it the check would pass.

Nothing imports it from production today. This is about the rule being
enforceable, not about a live defect. It is filed as low priority for exactly
that reason.

`src/testSetup.ts` is referenced by the Vitest config rather than imported by
application code and is a different case; check it while here but do not assume
it needs the same treatment.

# Scope

- Move the fixture somewhere the guard classifies as test-only — a
  `__tests__` directory or a `.test.` suffix — and update its importers.
- Add a seeded self-test proving the production-imports-test rule fires, the way
  the feature-to-app edge is already self-tested in
  `scripts/architecture-fixtures/`. A rule with no self-test is how this hole
  survived.
- Review `src/testSetup.ts` and any other root module that exists only for
  tests, and record the decision for each.

# Out of scope

- Changing what the fixture does or the contract it proves.
- Reorganizing real test files. Colocated `*.test.tsx` beside their subject is
  the established convention and stays.

# Acceptance criteria

- [ ] No module that exists solely for tests is classified as production by the
      architecture check.
- [ ] A seeded fixture proves the production-imports-test rule fires, and the
      check fails if that self-test stops reporting.
- [ ] All 241 frontend tests still pass.
- [ ] Full `AGENTS.md` validation passes.

# Relevant files

- `src/testScreenModule.tsx`
- `src/screenModule.test.tsx`
- `scripts/check-frontend-architecture.mjs`
- `scripts/architecture-fixtures/`

# Dependencies

None.

# Decisions

- Add the self-test even though the move alone fixes the instance. The seeded
  feature-to-app edge is why that rule is trustworthy; this one deserves the
  same.

# Implementation notes

Complete during implementation.

# Validation

Run the complete `AGENTS.md` command set.
