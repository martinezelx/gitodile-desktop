---
id: 065-7
title: Make credential and remote failures actionable
status: active
priority: high
type: hardening
areas:
  - credentials
  - sync
  - security
  - platform
  - frontend
  - rust
created: 2026-08-18
completed:
parent: "065"
queue: "16"
---

# Goal

Prove and harden the provider-neutral system-Git credential path used by clone,
check/get, and publish, with safe diagnostics for common remote failures.

# User outcome

When a network action cannot proceed, the user can tell whether the problem is
connectivity, trust, credentials, permissions, remote configuration, policy,
or an uncertain outcome and knows a safe next step.

# Context

GitOdrile intentionally uses system Git and preserves user configuration. A
native provider account is not required for `1.0.0`, but private-repository
workflows cannot be considered functional without tested credential-helper and
prompt behavior on each platform.

# Scope

- Inventory every network command and apply one shared typed classification for
  offline/DNS, timeout, proxy, TLS, SSH host key/key, authentication, permission,
  missing remote/ref, protected branch/rules, hooks, size limits, and uncertain
  post-send outcomes.
- Verify Git Credential Manager and representative native/helper configurations
  on Windows, macOS, and Linux without reading or storing secrets in GitOdrile.
- Define when an interactive helper may appear, how cancellation is surfaced,
  and how headless/non-interactive failures avoid hanging.
- Redact URL userinfo, query/fragment, helper output, tokens, private keys, and
  sensitive environment values from logs, IPC, errors, and diagnostics.
- Add a bounded copyable diagnostic report containing versions, operation phase,
  remote alias/provider-neutral host evidence, and remediation without source
  content or secrets.
- Align clone, fetch/check/get, and publish error copy and retry behavior.

# Out of scope

- OAuth/device-flow accounts, embedded credential storage, provider APIs, SSH
  key generation, certificate installation, or changing global Git config.
- Automatic retries of remote mutations with uncertain outcomes.

# Acceptance criteria

- [ ] Every network execution policy has bounded prompt, timeout, cancellation,
      redaction, failure, and uncertain-outcome semantics.
- [ ] Configured HTTPS and SSH credential paths are exercised on the advertised
      platforms using test accounts/helpers appropriate to release QA.
- [ ] Common failures classify consistently across clone, check/get, and publish
      and offer a safe retry/configuration next step.
- [ ] Automated secret-canary tests prove credentials never reach UI-safe
      diagnostics, logs, IPC fixtures, persisted settings, or recent projects.
- [ ] Diagnostic reports are useful, bounded, local, and explicit before the
      user copies them; repository content is excluded.
- [ ] Native login is not implied by the UI or docs.
- [ ] Integration, desktop, security, and platform checks pass and
      `pnpm run check` passes.

# Relevant files

- `src-tauri/src/sync.rs`
- `src-tauri/src/git.rs`
- `src-tauri/src/error.rs`
- `src-tauri/src/operation.rs`
- `src-tauri/src/tooling.rs`
- `docs/adr/0006-defer-macos-and-linux-runtime-validation.md`

# Dependencies

- Tasks 065-2, 065-3, and 065-4 so every `1.0.0` network path exists.
- Existing publish/check/get classification and bounded runner.

# Decisions

- System Git helpers are the `1.0.0` credential contract.
- Provider accounts remain post-release work.
- Remote mutations with ambiguous evidence are never retried automatically.

# Implementation notes

Record helper matrix, prompt process behavior, redaction corpus, classification
precedence, diagnostic schema, and platform findings.

# Validation

Record account/helper test environments without secrets, canary results,
failure matrix, desktop evidence, and final check output.
