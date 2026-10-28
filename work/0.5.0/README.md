# 0.5.0 — Collaboration complete

Roadmap gate: [Gate 2](../../docs/ROADMAP.md#gate-2--complete-collaboration-and-overlaps-050).

## Goal

Both the clean and the conflicting collaboration paths finish inside
GitOdile: overlapping changes are resolved at GitHub Desktop level (keep one
side per file or edit it in the user's editor) without silent data loss, and
local branches and diverged project changes can be integrated with a preview.

The three-pane conflict editor is not part of this version; it is epic
[206](../after-1.0/206-three-way-conflict-editor.md) after `1.0.0`.

## Queue

| Queue | Task | Outcome |
| --- | --- | --- |
| 01 | [037-3](037-3-read-only-conflict-workspace.md) | Show every overlap and what each side changed, read-only |
| 02 | [037-6](037-6-resolve-files.md) | Resolve each file by side or in the user's editor |
| 03 | [037-5](037-5-complete-or-abort-merge.md) | Finish or abort a merge |
| 04 | [037-7](037-7-conflict-workflow-audit.md) | Audit the conflict workflow |
| 05 | [065-4](065-4-integrate-branches.md) | Integrate local branches and diverged project changes |

Done: [037-1](../done/037-1-conflict-domain-and-recovery.md), conflict truth,
recovery, and how detected overlaps become sessions.

Epic: [037 resolve overlapping changes](037-guided-conflict-resolution.md).

## Exit condition

Clean and conflicting collaboration complete without a terminal. Rebase and
force push remain excluded.
