# ADR 0009: Use only the canonical product identity

- Status: accepted
- Date: 2026-09-02
- Supersedes: task 103's initial brand-compatibility decision and the namespace
  spelling in ADRs 0007 and 0008; their recovery protocols remain accepted.

## Context

The first rename to GitOdile retained the previous bundle identifier, a browser
storage migration, and previous-brand recovery namespaces to preserve existing
pre-release state. The owner subsequently renamed the official repository to
`https://github.com/martinezelx/project-gitodile` and explicitly requested that
all references to the previous name, including compatibility code, be removed.

The loss of automatic access to previous preferences and recovery records was
explained before this decision, and the owner expressly approved it. This is a
breaking pre-release identity reset, not a transparent upgrade.

The concrete engineering problem is to align the desktop identity, preference
keys, repository links, and recovery paths without deleting existing data or
weakening recovery for new operations.

### Bounded reference study

GitButler's [development configuration](https://github.com/gitbutlerapp/gitbutler/blob/914d0b79328a4d0f231f511d76b5079b819a9442/crates/gitbutler-tauri/tauri.conf.json)
and [release configuration](https://github.com/gitbutlerapp/gitbutler/blob/914d0b79328a4d0f231f511d76b5079b819a9442/crates/gitbutler-tauri/tauri.conf.release.json)
use distinct product names and identifiers. Its [operation-log state handle](https://github.com/gitbutlerapp/gitbutler/blob/914d0b79328a4d0f231f511d76b5079b819a9442/crates/gitbutler-oplog/src/state.rs)
resolves persisted state from a supplied base path. The reusable principle is
that application identity and persistent-state locations are explicit contracts,
not cosmetic display strings. No source code, assets, or workflow model was
copied. Tauri's [configuration schema](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-cli/tauri.config.schema.json)
also identifies the application identifier as part of bundle and WebView-data
configuration; changing it must not be described as preserving the old profile.

## Decision

- Use `GitOdile` for the product, `gitodile` for packages and technical names,
  and `app.gitodile.desktop` as the Tauri identifier.
- Read/write browser preferences only through the existing `gitodile-*` keys.
  Remove the previous-brand migration and its startup call. Keep unrelated
  preference-schema/default-repair behavior unchanged.
- Store discard snapshots under `<git-dir>/gitodile/recovery/` and history
  manifests under `<common-git-dir>/gitodile/history-recovery/v1/`.
- Create history recovery refs under
  `refs/gitodile/recovery/v1/get-team-changes/`. Keep schema version 1 because
  the manifest shape and safety protocol have not changed.
- Do not read, move, convert, or delete previous-brand application data,
  snapshots, manifests, or refs. Their automatic discovery is intentionally
  unsupported by this build.
- Point repository links and this checkout's `origin` at the renamed official
  repository. Do not move the active workspace directory or rewrite Git history.
- Normalize product-name references in historical text while retaining the
  original text in Git history. Pin current metadata and recovery paths in tests.

## Consequences

- The maintained project has one name, identifier and set of state namespaces.
- The new desktop identity can use a fresh WebView profile or coexist with the
  previous installation; old preferences are not automatically restored.
- Previous recovery records remain on disk, and previous refs still protect
  their commits, but this build neither discovers nor applies retention to them.
- Newly created recovery records still use the same confirmations, create-only
  refs, verification, retention and restart behavior from ADRs 0007 and 0008.
- Real installer-upgrade behavior on Windows/macOS/Linux remains a release
  validation concern; passing unit/build checks does not prove it.

## Alternatives considered

- **Retain legacy identifiers.** Originally chosen, then explicitly rejected by
  the owner in favor of a complete naming reset.
- **Dual-read or migrate old state.** Safer for existing installations, but
  contrary to the requested removal of brand-compatibility code.
- **Delete old data automatically.** Rejected: removing compatibility is not
  permission to erase recoverable user data.
- **Hide the old spelling through encoded or constructed strings.** Rejected:
  that would conceal compatibility rather than remove it.
