# ADR 0004: Budget desktop memory as private bytes, not summed working set

- Status: accepted
- Date: 2026-08-10

## Context

Task 023 set a release memory budget of "> 300 MiB working set" as a warning and
"> 400 MiB working set" as a failure for the GitOdile process tree, and recorded
that it had no release baseline yet. Task 031 could not close epic 022 without
either satisfying that budget or explicitly revising it.

The release measurement, taken from `pnpm tauri build --no-bundle` output on
Windows 11 with the task-023 standard fixture, five samples at one-second
intervals after a ten-second settle:

| Session | Processes | Working set | Private bytes |
| --- | ---: | ---: | ---: |
| Overview only, no other screen visited | 7 | 405.1 MiB | 212.2 MiB |
| All three screens visited, returned to Overview | 7 | 415.6 MiB | 221.8 MiB |

The failure threshold is crossed by **a session that opened one screen**. Keeping
every visited screen mounted — the keep-alive behavior this budget existed to
police — costs 10.5 MiB working set and 9.6 MiB private, roughly 2.5% of the
total.

The reason is how Windows reports working set. GitOdile runs as seven processes
(the Tauri host plus a WebView2 browser, GPU, network, renderer and utility
tree). `WorkingSet64` counts every page currently resident for each process,
including pages shared between them and the mapped code of the WebView2 runtime
itself. Summing it across a seven-process tree counts those shared pages up to
seven times. The number therefore measures how Microsoft ships WebView2, not
what GitOdile allocates, and no amount of screen-retention work moves it.

`PrivateMemorySize64` counts only pages that cannot be shared. It is not
inflated by process count, it responds to the application's own allocations, and
it is the number that would grow if screen eviction regressed.

## Decision

Budget Windows desktop memory as **summed private bytes across the app's own
process tree**, and record summed working set as informational context.

- Warning: > 300 MiB private bytes.
- Failure: > 400 MiB private bytes.

The thresholds are deliberately unchanged in magnitude. The measured 221.8 MiB
leaves headroom that a real retention regression would consume, so the budget
still has teeth against the failure it was written to catch.

Two measurement rules are now normative, because getting either wrong produced a
wrong answer during this audit:

1. **Scope the sample to the application's own process tree** by walking
   `Win32_Process` parent links from `gitodile.exe`. A machine-wide query for
   `msedgewebview2` also captures every unrelated WebView2 host — during this
   audit that inflated the reading from 405 MiB to 720 MiB.
2. **Confirm exactly one instance is running.** Two live instances silently sum
   into one figure.

Measurement keeps the remote-debugging port enabled, because the protocol
requires visiting all three screens and there is no other way to drive a
packaged build. The port adds a protocol server, not DevTools. Task 023's
earlier 487.4 MiB figure came from a debug build and is not comparable to
either number here.

## Consequences

- Epic 022 closes on a measured number that reflects GitOdile's own memory
  rather than WebView2's baseline residency.
- A future screen that leaks retained state fails the private-bytes budget,
  which is the regression the original budget was written to catch.
- Working set stays in the record, so a genuine change in WebView2's residency
  is still visible rather than discarded.
- macOS and Linux still have no release baseline. Their equivalents
  (resident/private footprint, RSS/PSS from `smaps_rollup`) must be measured
  before any cross-platform memory claim, and this ADR does not authorize
  reusing the Windows numbers for them. ADR 0006 records why that validation is
  deferred and makes it a release-hardening gate.

## Alternatives considered

### Keep the working-set budget and record a failing measurement

Rejected. A budget that a single-screen session fails is not measuring the
behavior it names. Recording a permanent accepted failure trains reviewers to
ignore the row.

### Raise the working-set thresholds until the current number passes

Rejected. It preserves a metric whose value is dominated by process count, so
the new threshold would be just as arbitrary and would still not react to a
retention regression.

### Measure a single process instead of the tree

Rejected. The renderer holding GitOdile's retained screens is a child process;
measuring only the Tauri host would miss exactly what the budget exists to
watch.
