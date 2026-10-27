# 0.6.0 — Safety visible and reusable

Roadmap gate: [Gate 3](../../docs/ROADMAP.md#gate-3--make-safety-visible-and-reusable-060).

## Goal

Every destructive or history-changing action GitOdile offers has a
discoverable recovery lifecycle, saved versions can be reversed safely, and
unfinished work can be set aside and restored.

The recovery center and the restore planner are also the foundation of the
post-`1.0.0` safety net. Build them inside their own scope, but follow the
[design seeds](../../docs/ROADMAP.md#design-seeds-in-100) so that net does not
require rewriting them.

## Queue

| Queue | Task | Outcome |
| --- | --- | --- |
| 01 | [065-5](065-5-recovery-center.md) | Make recovery records visible and actionable |
| 02 | [065-6](065-6-restore-saved-version.md) | Undo or reverse a saved version |
| 03 | [064-1](064-1-discover-saved-sets.md) | Discover and inspect saved sets |
| 04 | [064-2](064-2-set-changes-aside.md) | Set all or selected changes aside |
| 05 | [064-3](064-3-restore-saved-set.md) | Restore a saved set and keep its copy |
| 06 | [064-4](064-4-remove-and-recover-saved-set.md) | Remove one saved set with recovery |
| 07 | [064-5](064-5-stash-workflow-audit.md) | Audit the set-aside workflow |

Epic: [064 set changes aside safely](064-set-changes-aside-safely.md).

Blocked: [139 history and destructive console commands](139-console-history-and-destructive-commands.md)
waits for the recovery center (065-5). Give it a queue position when 065-5 is
done.

## Exit condition

Destructive and history-changing product actions have a discoverable recovery
lifecycle, and unfinished work can be moved aside and restored safely.
