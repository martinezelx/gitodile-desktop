# ADR 0006: Defer macOS and Linux runtime validation until release hardening

- Status: accepted
- Date: 2026-08-12

## Context

GitOdrile targets Windows, macOS and Linux, but development hardware currently
provides only Windows 11 with WebView2. Task 031 measured startup ordering,
screen switching, virtualization, DOM bounds and memory on that machine. The
same protocol has never run inside WKWebView or WebKitGTK, and no assistive-
technology pass has exercised keep-alive `hidden`/`inert` behavior there.

GitHub Actions already runs Rust formatting, clippy and the complete Rust test
suite on Ubuntu, Windows and macOS. Those tests cover parsers, planners,
repository identity, temporary Git repositories, execution policy and much of
the platform-independent native behavior. They do not launch the desktop UI,
drive a real WebView, sample a process tree, exercise system credential stores
or validate signed/notarized packages.

Task 045 proposed obtaining hardware or VMs now and treating those manual
measurements as the final condition for epic 038. The product is still early
enough that repeating a costly manual platform matrix before workflows and
packaging stabilize would produce short-lived baselines. The required hardware
is not currently available.

## Decision

Defer the task-023 runtime and memory protocol on macOS and Linux until release
hardening, when the application is mature enough for results to guide shipping
decisions. Until then:

1. CI is the automated cross-platform gate. Rust formatting, clippy and tests
   continue on Ubuntu, Windows and macOS.
2. CI additionally runs `pnpm tauri build --no-bundle` on Ubuntu and macOS.
   This compiles the TypeScript/Vite renderer and the Tauri release executable
   together on both non-Windows targets, catching platform compilation,
   dependency and configuration drift without claiming a runtime observation.
3. Product and architecture documents must label macOS/Linux WebView behavior,
   accessibility, memory, credentials and packaging as unmeasured. Windows
   budgets may not be extrapolated to either platform.
4. Before GitOdrile makes a release-readiness claim for macOS or Linux, create
   a new validation task and run the complete task-023 protocol on representative
   hardware or VMs. Record the commit, hardware, OS/desktop build, WebView
   version, Git version and assistive technology used.

The future validation must include the standard and 5,000-change fixtures,
virtualized scrolling/selection, warm navigation, first-diff latency, settled
Git processes, platform-appropriate memory metrics, `hidden`/`inert` behavior
with assistive technology, credentials, filesystem casing/symlinks and the
actual packaging/signing path intended for release.

## Consequences

### Positive

- Epic 038 can close with an explicit, dated and owned limitation instead of a
  silent assumption or a permanently blocked task.
- Every change is still compiled and Rust-tested on all three target operating
  systems; macOS and Linux also prove the complete release executable builds.
- Manual measurements happen when their baselines and discovered defects can
  influence a real release rather than an unstable prototype.

### Negative

- GitOdrile cannot yet claim observed runtime correctness, accessibility,
  performance or memory behavior on macOS or Linux.
- Hosted CI runners do not represent end-user hardware and a successful
  headless compile can coexist with WKWebView/WebKitGTK defects.
- Packaging, signing/notarization, credential stores and desktop integration
  remain outside the automated evidence.

## Alternatives considered

### Keep task 045 open indefinitely

Rejected. An active task with unavailable hardware does not create evidence or
ownership; it obscures whether the architecture epic is structurally complete.
This ADR makes the limitation and the release gate durable and reviewable.

### Launch the desktop UI on hosted CI runners

Rejected for now. A virtual display can provide a smoke test on some Linux
runners, but it does not validate a user's compositor, accessibility stack,
WKWebView behavior, credentials or memory. It would add brittle automation
while inviting a stronger claim than the evidence supports.

### Treat a successful cross-platform compile as runtime support

Rejected. Compilation is useful evidence and is now required, but it is named
precisely as compilation. Runtime support remains unmeasured until the manual
release-hardening protocol runs.
