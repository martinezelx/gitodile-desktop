# Roadmap

This roadmap is directional rather than a promise.

## Phase 0 — Foundation

- Validate product language with beginners and AI-assisted builders.
- Establish design tokens and application shell.
- Implement secure Git process runner.
- Establish operation classification, preview, and recovery-plan contracts.
- Add repository diagnostics.
- Create temporary-repository integration test helpers.

## Phase 1 — Local workflow MVP

- Open recent/local repositories.
- Working-tree overview.
- Changed file list and diff viewer.
- Stage/unstage behavior hidden behind a coherent save-version flow.
- Create saved versions.
- History timeline.
- Create recovery references before risky local or history operations.
- Basic reversible restore flow.

## Phase 2 — Remote workflow

- Clone repositories.
- Fetch and remote-status explanation.
- Publish changes.
- Safe integration of remote changes.
- Clear ahead/behind/diverged states.
- Provider-neutral remote contracts, with GitHub authentication as the first
  provider-specific onboarding where useful.
- Explicit previews for operations that affect a remote or teammates.

## Phase 3 — Safety and conflicts

- Recovery center.
- Guided merge-conflict resolution.
- Recovery lifecycle, cleanup, and diagnostics.
- Improved diagnostics for hooks, signing, and credentials.

## Phase 4 — Progressive power

- Advanced mode.
- Branch/workspace management.
- Stash/set-aside workflow.
- Tags and releases where useful.
- GitLab and Bitbucket integrations.

## Later possibilities

- Optional AI explanations and conflict assistance.
- Team policies and educational mode.
- Pull-request workflows.
- Repository health checks.
- Extension system.
