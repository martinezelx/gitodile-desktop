---
id: 148-5
title: Browse and clone projects across connected hosting providers
status: active
priority: high
type: feature
areas:
  - frontend
  - repository
  - credentials
created: 2026-10-04
completed:
parent: "148"
queue: "02"
---

# Goal

Offer one repository browser for GitHub, GitLab.com and Bitbucket Cloud inside
[epic 148](148-connect-github-account.md), backed by their connected accounts.

# User outcome

Find personal and organization/group/workspace projects without copying a URL,
then clone through the existing destination preview and safe acquisition flow.

# Scope

- Provider-native discovery adapters behind a small shared paginated repository
  contract, using the chosen account for API access without changing CLI state.
- Account/provider selection, accessible search, bounded pagination and clear
  ownership/private/archive metadata. Respect each provider's search semantics.
- User and accessible organization/group/workspace repositories; permissions,
  rate limits and incomplete pages must be reported accurately.
- Hand off verified HTTPS/SSH addresses and the HTTPS account to the existing
  clone controller; keep destination validation, cancellation and plan binding.
- Cache by provider, host and account; account changes/logout invalidate only
  the relevant data. Reject stale responses after switching accounts.
- Network requests follow explicit discovery/search/page/refresh intent. Opening
  a hidden or cached screen must not trigger speculative remote work.

# Out of scope

- Hosted repository creation, fork creation/deletion or bulk cloning.
- Self-hosted/enterprise providers, PRs and CI operations.
- A replacement clone engine or an unbounded all-repositories download.

# Acceptance criteria

- [ ] The same browser works with all three connected providers and handles
  multiple accounts without mixing private repository results.
- [ ] Personal and team repositories are discoverable with bounded pagination,
  useful search and no false claim that a partial page is the full inventory.
- [ ] Selected repository/account reaches the existing reviewed clone plan;
  the completed project retains its chosen HTTPS account.
- [ ] Empty, signed-out, expired, denied, offline and rate-limited states offer
  clear next actions; cancellation and stale responses do not corrupt selection.
- [ ] Remote URLs are validated natively; secrets and private raw API output
  never enter diagnostics, renderer storage or clipboard automatically.
- [ ] Large lists remain virtualized within the DOM budget; keyboard access,
  English/Spanish and light/dark styling follow DESIGN.md.
- [ ] Feature owns typed ports/adapters and screen registration if applicable;
  hidden work suspends and visibility never acts as network invalidation.
- [ ] Provider pagination/parser fixtures, controller race tests and clone
  handoff regressions pass; runtime UI validation and platform limits are recorded.
- [ ] Documentation and `pnpm run check` pass.

# Relevant files

- [Architecture](../../docs/ARCHITECTURE.md)
- [Screen guide](../../docs/architecture/frontend-feature-guide.md)
- [ADR 0022](../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md)
- [Shared accounts](../../src/features/accounts/index.ts)
- [Clone feature](../../src/features/clone/index.ts)
- [Native clone owner](../../src-tauri/src/clone.rs)

# Dependencies

Complete [148-4](148-4-gitlab-and-bitbucket-accounts.md) first. Existing 148-3
credentials and clone behavior must remain intact.

# Execution handoff

Read this file, AGENTS.md and the linked contracts; inspect the completed provider
adapters and current primary API docs before implementation. Keep provider detail
inside adapters, reuse clone, and do not implement PRs/CI as part of this task.

# Implementation notes

Pending implementation.

# Validation

Pending implementation.
