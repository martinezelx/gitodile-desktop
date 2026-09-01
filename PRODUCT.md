# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

GitOdile is primarily for people who work in software repositories without
deep Git knowledge: learners, junior developers, students, AI-assisted
builders, designers, writers, game developers, freelancers, and other
collaborators who need version control but do not want Git terminology to be
their starting point. Experienced developers who prefer a focused workflow are
a secondary audience.

## Product Purpose

GitOdile is a cross-platform desktop Git client that translates user intent
into understandable, safe Git operations. Success means users can save,
publish, integrate, experiment, and recover without fear of losing work or
needing to understand Git internals first.

## Positioning

GitOdile provides modern version control without the Git learning curve. It
does not merely map Git commands to buttons: it explains consequences,
preserves recovery paths, and exposes exact Git terminology progressively.

## Operating Context

The application runs locally on Windows, macOS, and Linux against repositories
managed by the system Git executable. It is used alongside editors, IDEs,
coding agents, app generators, and hosting providers, but core local workflows
must not depend on any one editor, provider, cloud account, or subscription.

## Capabilities and Constraints

- React, TypeScript, Vite, Tauri 2, Rust, and system Git are the established
  implementation stack.
- Repository content remains local unless the user explicitly invokes a remote
  or optional cloud feature.
- Git operations are modeled around intent and consequences, validated in Rust,
  and invoked without shell-constructed command strings.
- History-changing, remote-changing, and destructive actions require truthful
  previews, explicit confirmation where appropriate, and a recovery strategy
  when feasible.
- The default UI uses plain-language outcomes; exact Git concepts remain
  available through progressive disclosure and advanced views.
- Cross-platform paths, line endings, credentials, symlinks, filesystem casing,
  file locks, process behavior, and native shortcuts are part of correctness.
- AI assistance is optional and must disclose exactly what repository data
  would leave the machine.

## Brand Commitments

The working name is **GitOdile** and the working promise is **Git without the
bite**. The product voice is calm, direct, professional, and friendly without
being patronizing. The crocodile mark and mascot may add restrained personality
but must not trivialize errors or destructive operations.

## Evidence on Hand

- Durable product strategy: `docs/PRODUCT_STRATEGY.md`.
- Interaction and visual direction: `DESIGN.md`.
- Architecture and safety rules: `docs/ARCHITECTURE.md` and `AGENTS.md`.
- Existing product mark: `src/assets/gitodile-mark.svg`.
- Existing Overview, Changes, save-version, publish, project-session, watcher,
  and version-line implementations and tests under `src/` and
  `src-tauri/src/`.
- No testimonials, customer claims, usage benchmarks, or commercial proof are
  available and future work must not fabricate them.

## Product Principles

1. Human intent before Git commands.
2. Safety, recoverability, and truthful consequences before convenience.
3. Progressive disclosure without hiding technical truth.
4. Local-first, privacy-conscious behavior.
5. Professional native-desktop quality across supported platforms.

## Accessibility & Inclusion

Primary workflows require keyboard access, visible focus, semantic controls,
screen-reader support, non-color status cues, readable scaling, reduced-motion
support, and WCAG AA text contrast where practical. Copy and layouts must work
in both English and Spanish.
