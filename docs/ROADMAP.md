# Roadmap

This is directional product sequencing, not an implementation tracker or a
release promise. Approved work and acceptance criteria live under `work/`.

## Delivered foundation

- Cross-platform Tauri/React/Rust shell and system-Git diagnostics.
- Secure bounded Git runner, per-command policies, repository authorization,
  opaque sessions, typed invalidation, and architecture/IPC guards.
- Project opening, recent-project switching, startup restore, and live status.
- Working-tree overview, virtualized changes, file diffs, and file icons.
- Planned save-version and publish flows.
- Version-line discovery, create, switch, and guarded deletion.
- English/Spanish localization, themes, settings, command palette, and
  keyboard-accessible modal foundations.

## Current MVP work

- Check for team changes without modifying local files.
- Get and safely integrate team changes.
- History timeline.
- Guided conflict resolution.
- Recovery center and visible recovery lifecycle.

## Next local/remote capabilities

- Clone projects.
- Basic reversible restore flows backed by recovery references.
- Clear ahead/behind/diverged explanations throughout the app.
- Provider-neutral authentication contracts, with provider-specific onboarding
  only where it improves the experience.
- Better hook, signing, credential, and remote diagnostics.

## Progressive power

- Advanced mode with exact Git terminology and evidence.
- Set-changes-aside workflow.
- Tags/releases where they solve a validated user problem.
- Additional hosting-provider integrations.

## Later hypotheses

- Optional AI explanations and conflict assistance with explicit data consent.
- Team safety policies and educational modes.
- Pull-request workflows.
- Repository health checks.
- Extension model.

Core local workflows must remain usable without an account, subscription, or
mandatory cloud service.
