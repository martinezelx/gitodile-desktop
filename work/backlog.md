# GitOdrile backlog

This file is an inbox for ideas that are not yet approved or sufficiently refined for implementation. Promote an item into `work/active/` using `work/templates/task.md` before coding it.

## Foundation

- Add structured Git command execution in Rust.
- Define typed Rust-to-frontend error contracts.
- Define typed operation plans, risk classification, confirmation, and recovery contracts.
- Add application logging with privacy-safe defaults.

## Repository experience

- Explain repository health in plain language.
- Show changed, staged, untracked, ignored, and conflicted files.
- Build a readable diff viewer.
- Detect changes caused only by line-ending normalization.
- Design repository watching, cancellation, and large-repository performance
  tests before adding continuous background refresh.
- Benchmark the complete Changes and save-version workflow with thousands of
  changed files once both flows exist; cover Rust parsing, Tauri payloads,
  list/diff rendering, refresh cancellation, and interaction responsiveness.

## Save and history

- Generate optional commit message suggestions locally or through an opt-in AI provider.
- Compare two saved versions.
- Restore an earlier version through a reversible plan.
- Define the lifecycle, naming, retention, and cleanup policy for recovery
  references.

## Sync and collaboration

- Guide users through overlapping changes.
- Support GitHub authentication after the local workflow is stable.

## Quality and verification

- Complete the manual desktop-QA pass task 012 closed without: the project
  switcher across expanded, collapsed, and narrow layouts with long,
  duplicate, non-ASCII, and overflowing project names; and the full
  keyboard/screen-reader/visible-focus/reduced-motion pass in both Spanish and
  English.

## Product and design

- Create the GitOdrile crocodile icon and mascot system.
- Define final light and dark color tokens.
- Design onboarding and Git diagnostics.
- Add command palette and keyboard shortcuts.
- Validate accessibility for the primary workflows.

## Distribution

- Generate signed Windows installers.
- Add macOS signing and notarization.
- Package Linux builds and document supported distributions.
- Design the update strategy.
