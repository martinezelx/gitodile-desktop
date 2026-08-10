---
id: 046
title: Finish Settings feature ownership and stop paying for it at startup
status: active
priority: low
type: chore
areas:
  - frontend
  - architecture
  - performance
created: 2026-08-10
completed:
---

# Goal

Give the Settings feature its own styles and translations, and stop shipping its
panel in the entry chunk.

# User outcome

No visible change to the Settings overlay. A slightly smaller first download,
since a panel most sessions never open stops being part of the startup bundle.

# Context

Task 031 extracted the Settings overlay into `src/features/settings/` behind a
typed port, which removed seven direct `invoke` calls from `main.tsx`. It
deliberately stopped there and recorded two residuals.

**Styles and copy still live in the app namespace.** Settings rules occupy
`src/app/app-shell.css` lines 364–464, with responsive rules interleaved into
the shell's media queries at 517–529 and 567. Task 030 established that a
feature owns its CSS and that `src/styles.css` is a tested, deterministic
cascade manifest — app shell before features. Moving the Settings rules into a
feature file places them *after* the shell in the cascade, which can change the
rendered result. That is why the audit left them: reordering 796 rules inside an
audit was the wrong risk. It is the right work for a task that can verify it.

The counter-argument is real and should be settled rather than assumed: Settings
is registered as `kind: "overlay"`, `section: "application"` — app-level chrome,
not a project screen. Its dialog frame (`.settings-dialog*`) genuinely belongs
to the shell. Only the panel's own rules are in question.

**The panel is statically imported.** `main.tsx` lazily loads PublishDialog,
PendingVersionsSection and the version-line dialogs, but imports SettingsPanel
directly, so it sits in the entry chunk at 375.59 kB against a 378 kB warning —
2.4 kB of headroom. Making it lazy is the obvious reclaim. The audit left it
because the overlay has focus management (`settingsDialogRef`, `useModalFocus`)
and a Suspense boundary changes when content mounts relative to the focus trap.
That interaction needs testing, not assuming.

# Scope

- Split the Settings rules: panel rules to `src/features/settings/settings.css`
  registered in `src/styles.css`; dialog chrome stays with the app shell.
  Verify the cascade result is unchanged, including responsive and
  forced-colors behavior.
- Update `src/styleComposition.test.ts`'s expected import list and its
  feature-ownership assertions.
- Move Settings copy to `src/features/settings/translations.ts` following task
  030's namespace pattern, keeping navigation and palette strings in the app
  namespace.
- Make `SettingsPanel` lazy with a Suspense fallback, and prove the focus trap
  still moves focus into the dialog after the chunk arrives and returns it to
  the trigger on close.
- Re-measure the entry chunk.

# Out of scope

- Redesigning Settings or changing any copy.
- Moving the `.settings-dialog*` chrome out of the app shell.
- Changing the `SettingsPort` or `useGitTooling`.

# Acceptance criteria

- [ ] Settings panel rules and copy are feature-owned; the cascade manifest and
      its test reflect it.
- [ ] Rendered Settings appearance is unchanged in light and dark themes, at
      the narrow breakpoint, and under forced colors.
- [ ] The panel loads lazily and is no longer in the entry chunk.
- [ ] Opening Settings moves focus into the dialog and closing returns it to
      the trigger, covered by a test that would fail if the Suspense boundary
      broke it.
- [ ] Entry chunk is measurably smaller and stays below the 378 kB warning.
- [ ] Full `AGENTS.md` validation passes.

# Relevant files

- `src/features/settings/`
- `src/app/app-shell.css`, `src/app/translations.ts`
- `src/styles.css`, `src/styleComposition.test.ts`
- `src/main.tsx`, `src/modalFocus.ts`

# Dependencies

Task 041, which settles where shared primitives live before this moves more
files around them.

# Decisions

- Split by owner rather than by file: the overlay's chrome is shell, the panel's
  content is the feature. Moving all of it either way would be tidier and less
  true.

# Implementation notes

Complete during implementation.

# Validation

Run the complete `AGENTS.md` command set and compare rendered Settings against
the current build before and after.
