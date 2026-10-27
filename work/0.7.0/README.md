# 0.7.0 — Release candidate

Roadmap gate: [Gate 4](../../docs/ROADMAP.md#gate-4--release-candidate-070).

## Goal

Feature freeze. Harden diagnostics, qualify the shipped artifacts on every
advertised platform, and finish the evidence and OS signing the updater still
owes.

## Queue

| Queue | Task | Outcome |
| --- | --- | --- |
| 01 | [065-7](065-7-credential-remote-diagnostics.md) | Harden credential and remote diagnostics |
| 02 | [065-8](065-8-release-hardening.md) | Verify and distribute `1.0.0` |
| 03 | [065-9-13](065-9-13-updater-evidence-and-os-signing.md) | Record the remaining updater evidence and add OS signing |

## Exit condition

All `1.0.0` acceptance criteria in [epic 065](../1.0.0/065-release-1.0.md)
pass on the shipped artifacts and no known defect can silently lose work.
