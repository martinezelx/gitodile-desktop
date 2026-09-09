---
id: 037-6
title: Handle non-text and structural conflicts honestly
status: active
priority: high
type: feature
areas:
  - conflicts
  - frontend
  - rust
  - platform
created: 2026-08-18
completed:
parent: "037"
queue: "12"
---

# Goal

Provide safe whole-file or specialized resolution paths for every non-text and
structural conflict in epic 037, with explicit fallbacks where GitOdile cannot
edit content meaningfully.

# User outcome

Binary, encoding, add/delete, rename, mode, symlink, directory/file, and
submodule overlaps are not hidden or forced through a text editor.

# Context

The text resolver cannot safely generalize to all index-stage shapes. This
slice completes coverage without pretending unsupported data is text.

# Scope

- Add whole current/incoming/delete/rename destination choices where valid,
  with previews, confirmation, snapshot recovery, and exact mode/path handling.
- Add external-editor/file-manager reconciliation for formats GitOdile cannot
  render, without treating launch success as resolution.
- Handle or explicitly block symlink, submodule, invalid encoding, binary,
  rename/rename, directory/file, and case-collision states with safe next steps.
- Reuse task 037-4 save/stage/reset contracts; do not add hidden auto-resolution.

# Out of scope

- Binary merging, image diffing, semantic language merging, recursive submodule
  resolution, or automatic rename choice.

# Acceptance criteria

- [ ] Every conflict class in the parent epic has a tested resolution path or a
      deliberate limitation that cannot corrupt content/index/path/mode.
- [ ] Whole-side/delete/rename actions bind exact stage objects and paths,
      require appropriate confirmation, and remain recoverable/resettable.
- [ ] External tools are reconciled by fresh state inspection and never imply
      save, stage, completion, or success.
- [ ] Cross-platform symlink, casing, mode, path, encoding, and submodule
      fixtures preserve unrelated content byte-for-byte.
- [ ] UI/accessibility/error states and Rust/frontend integration checks pass.

# Relevant files

- `work/active/037-guided-conflict-resolution.md`
- `work/active/conflicts/037-4-resolve-text-conflicts.md`
- `work/active/conflicts/037-5-complete-or-abort-merge.md`

# Dependencies

Tasks 037-1 through 037-5.

# Decisions

An honest blocked state is preferable to coercing unsupported content through
the text workflow.

# Implementation notes

Record class/action matrix, mode/path semantics, external-tool reconciliation,
and platform limitations.

# Validation

Record non-text fixture corpus, byte/mode/path assertions, desktop audits, and
focused command output.
