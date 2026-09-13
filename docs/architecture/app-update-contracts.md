# Application update contracts

This document is the implementation boundary established by task 065-9-1 and
scoped for public Windows/Linux qualification by task 065-9-8.
[ADR 0010](../adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the durable decision; this document fixes the values and bounded types that
tasks 065-9-2 through 065-9-8 must implement and qualify. The executable cases
live in [`065-9-1-app-update-contract.json`](065-9-1-app-update-contract.json).

Task 065-9-3 implemented the native lifecycle on 2026-09-10. Nothing in this
document claims that any platform is qualified: enabled automatic targets remain
`qualification_required` until tasks 065-9-7 and 065-9-8 record real signed
A-to-B evidence. macOS is known but `planned_disabled`, owned by task 065-10,
and absent from the enabled release matrix.

Task 065-9-5 now supplies the secretless tag build, protected signing workflow,
complete-matrix/hash evidence and operator runbook. No production credential or
real signed run is evidenced yet, so this is pipeline readiness rather than a
signed-artifact or platform-support claim. See the
[signed-build runbook](../release/signed-builds.md).

Task 065-9-2's implemented process-wide gate, complete current operation/draft
inventory, and mandatory extension rules live in
[`install-admission-and-drafts.md`](install-admission-and-drafts.md). Later
updater work must consume that boundary rather than introducing a second busy
flag or screen-local draft check.

## Observed baseline and current implementation

The repository was inspected rather than treating the planning documents as
runtime evidence:

- npm, Cargo, Cargo's root lock entry, and Tauri all contain
  `0.2.0-preview.4`; the version is the unpublished starting candidate for the
  corrected validation pair;
- the Tauri identity is `app.gitodile.desktop` and bundling is active. The base
  `bundle.targets` remains `all`, but the mandatory platform overlays restrict
  Windows to `nsis`, Linux to `appimage`, and disable macOS bundling. These
  settings select the intended package families without claiming that either
  installed updater path is already qualified;
- resolved Tauri runtime / CLI versions are `2.11.5` / `2.11.4`;
- at the original planning baseline neither updater plugin was installed, updater artifacts were
  disabled, no public key or endpoint was embedded, and the WebView had no
  updater or process capability;
- ordinary CI runs tests on Windows, macOS, and Linux and release-compiles an
  executable on macOS/Linux with `--no-bundle`. Separate private candidate
  workflows can package and verify a complete matrix from an eligible tag, but
  no real signing/notarization run or installed update is currently evidenced;
- the public `martinezelx/gitodile-feedback` repository exists, is public, uses
  `main`, and had no releases on 2026-09-09. Both planned feed URLs returned
  HTTP 404;
- the source repository exposed no Actions secret names, variables, or
  environments to the authenticated maintainer query on 2026-09-09. Its
  visibility is not a release trust boundary.

The native implementation pins `tauri-plugin-updater` exactly at `2.11.0`
and uses only its Rust API. No `@tauri-apps/plugin-updater` or process guest
binding exists in the renderer. The pin is intentional because the plugin's
official source warns that its HTTP dependency may change in minor releases
when configuring the client. Task 065-9-3 re-reviewed that exact source; any
future upgrade remains deliberate.

Evidence: the current [Tauri updater guide](https://v2.tauri.app/plugin/updater/),
the official [`updater-v2.11.0` source](https://github.com/tauri-apps/plugins-workspace/blob/updater-v2.11.0/plugins/updater/src/updater.rs),
and the repository lockfiles.

## Delivered native lifecycle

`src-tauri/src/app_updates.rs` owns one process-wide snapshot, exact-operation
cancellation, check coalescence, the single pending candidate, its verified
bytes, native install-mode detection and bounded startup handoff state. The
exact updater plugin's `check()` is the only feed request and manifest
interpretation authority. GitOdile strictly validates the returned `raw_json`
against a closed static-manifest shape, cross-checks every selected value, and
then retains the official `Update` for Tauri's download, Minisign verification,
and platform installation. This avoids a second HTTP authority and a feed/cache
race while preserving structured plugin transport and schema errors.

The production feeds are fixed constants. The public key and key ID are build-
time values (`GITODILE_UPDATER_PUBLIC_KEY` and
`GITODILE_UPDATER_PUBLIC_KEY_ID`); when absent, checking is truthfully
unavailable rather than accepting a placeholder. Automatic installation is a
second compile-time deny-by-default gate,
`GITODILE_QUALIFIED_UPDATE_TARGETS`. It must remain empty in ordinary builds
until task 065-9-7 qualifies an exact target/mode with real signed packages.
The fixed A/B pair instead uses a compile-time `validation` profile, controlled
HTTPS feed and exact enabled target. That profile is rejected outside
preview.4 and preview.5, cannot carry URL credentials, and cannot enable a
different target or either disabled macOS target.

The renderer-facing feature exposes only typed GitOdile commands and opaque
candidate/operation IDs. There is no JavaScript updater dependency and the
Tauri capability contains neither updater nor process permissions. Renderer
install preparation protects drafts and suspends background participants before
native admission drains reads, blocks every mutation without cancelling it,
suspends watchers, revalidates the candidate and path, and invokes handoff.

## Version and release identity

Only these version forms are releaseable:

```text
stable:  X.Y.Z
preview: X.Y.Z-preview.N, where N >= 1
tag:     v<exact version>
```

Every numeric identifier is decimal without a leading zero unless it is exactly
`0`. Build metadata and every other prerelease suffix (`alpha`, `beta`, `rc`,
`nightly`, `preview.0`, or compound suffixes) are rejected before signing. The
only channel names are `stable` and `preview`.

For a release, one exact string must match all of these identities:

| Owner | Required value for version `V` |
| --- | --- |
| `package.json` | `version = V` |
| `src-tauri/Cargo.toml` | package `version = V` |
| `src-tauri/Cargo.lock` | root package `gitodile` has `version = V` |
| `src-tauri/tauri.conf.json` | `version = V` |
| source tag | `vV`, at the exact checked merge commit in `main` history |
| public release tag | `vV`, on an intentionally public feedback-repository commit |
| archived and channel manifests | top-level `version = V` |
| GitHub prerelease flag | `true` only for `preview`; `false` for `stable` |

The source and public tags share a name, not a commit identity. Protected build
evidence binds the source tag/SHA to the public release; a public tag must never
point at a source-repository commit. The release workflow receives the tag only,
proves its exact commit is reachable from `main`, then derives all other values.
There is no independent channel or prerelease input.

SemVer precedence is numeric across `major.minor.patch`, then preview number;
for the same core version every preview precedes stable. Equal and older
candidates yield `current`, not an error. A missing feed or target yields
`unavailable`, never `current`. A stable build rejects every preview candidate,
even if its core version is newer. A preview feed may contain the next preview
or a newer stable successor.

The two production feed identities are fixed in native build metadata:

| Build channel | Feed |
| --- | --- |
| `stable` | `https://raw.githubusercontent.com/martinezelx/gitodile-feedback/main/updates/stable.json` |
| `preview` | `https://raw.githubusercontent.com/martinezelx/gitodile-feedback/main/updates/preview.json` |

`BuildUpdateIdentity` is generated and validated while building:

```rust
struct BuildUpdateIdentity {
    version: ReleaseVersion,
    channel: ReleaseChannel,
    profile: Production | Validation,
    feed: KnownFeed,
    public_key_id: UpdaterPublicKeyId,
}
```

`ReleaseChannel` and `KnownFeed` are closed enums. Production values come from
the validated version and checked release configuration. A validation build
uses a compile-time controlled feed, exact build target and distinct validation
public key, but it cannot promote either production feed. The renderer can request a
check; it cannot provide a channel, URL, public key, installer path, target, or
arbitrary request headers.

## Target and installation matrix

Tauri static manifests use the documented `OS-ARCH` keys. Known targets and
the current enabled matrix are deliberately explicit:

| Manifest target | Release state | Build target and first install | Automatic contract | Current evidence / gate | Manual fallback |
| --- | --- | --- | --- | --- | --- |
| `windows-x86_64` | Enabled | `x86_64-pc-windows-msvc`; per-user NSIS `-setup.exe` | Reuse the final NSIS executable, `passive` mode; installer handoff exits the old process | Needs real Authenticode, updater signature, installed A→B and locked/low-space/path QA | Download the same signed NSIS installer |
| `linux-x86_64` | Enabled | `x86_64-unknown-linux-gnu`; AppImage | Replace only the exact running AppImage when its backing file is regular and writable; relaunch and confirm version | Needs updater signature, oldest-supported-glibc decision and installed A→B across the advertised distro baseline | Download the signed AppImage, mark executable, and replace it manually |
| `darwin-aarch64` | Planned, disabled | Future `aarch64-apple-darwin` signed/notarized app and DMG | No automatic contract is advertised | Task 065-10 must resolve or independently mitigate the official [replacement-safety report](https://github.com/tauri-apps/plugins-workspace/issues/3505), then prove notarization and real host A→B | No supported download is published in this phase |
| `darwin-x86_64` | Planned, disabled | Future `x86_64-apple-darwin` signed/notarized app and DMG | No automatic contract is advertised | Task 065-10 additionally needs real Intel evidence | No supported download is published in this phase |

Only enabled, qualified targets may enter a manifest or public release asset
set. The publisher rejects either Darwin key while macOS is disabled. The
updater feed contains one Windows installer family: NSIS. A current MSI or
machine-wide install is not silently converted to NSIS. Tauri documents both
Windows families and `passive` as the default/recommended updater mode; using
only NSIS prevents family ambiguity. macOS uses a DMG only for first/manual
installation; the updater artifact is the signed `.app.tar.gz`. Tauri reuses the
AppImage itself for the v2 Linux updater artifact. See the official
[Windows installer](https://v2.tauri.app/distribute/windows-installer/),
[DMG](https://v2.tauri.app/distribute/dmg/),
[AppImage](https://v2.tauri.app/distribute/appimage/), and
[updater](https://v2.tauri.app/plugin/updater/) documentation.

Detection is native and includes package/install mode, not merely OS and CPU.
These modes are never automatically replaced:

| Detected installation | Outcome |
| --- | --- |
| Linux `.deb` / `.rpm`, AUR, Snap, Flatpak, or another managed package | `blocked(unsupported_installation)` with package-manager guidance |
| Windows MSI, machine-wide install, Microsoft Store, or an unknown installer family | Manual signed installer/store guidance; no NSIS handoff |
| Mac App Store | Store-managed guidance; no direct bundle replacement |
| App run from a mounted DMG/AppImage mount, translocated location, temporary extraction, network/mounted volume, or other non-regular backing path | `blocked(read_only_installation)` or `blocked(unsupported_installation)` with copy/install guidance |
| App bundle/AppImage whose target or parent is not writable, including permissions or immutable/read-only media | `blocked(read_only_installation)`; never request an unrelated path from the renderer |
| Unknown OS, architecture, target key, package type, or path identity | `unavailable(unsupported_installation)` and public manual-download guidance when applicable |

No package becomes advertised as automatically supported until task 065-9-7
records two real consecutive signed installations for that exact target and
mode. Compilation and mocked replacement tests are insufficient.

## Native state and payload contracts

The native service owns a single process-wide snapshot. The renderer receives a
read-only projection and refers back only to opaque IDs:

```ts
type UpdateState =
  | { kind: "idle" }
  | { kind: "checking"; operationId: string; source: "manual" | "background" }
  | { kind: "current"; checkedAt: string }
  | { kind: "available"; candidate: UpdateCandidate }
  | { kind: "downloading"; candidate: UpdateCandidate; transfer: TransferProgress }
  | { kind: "verifying"; candidate: UpdateCandidate; receivedBytes: number }
  | { kind: "ready"; candidate: UpdateCandidate }
  | { kind: "blocked"; candidate: UpdateCandidate; error: UpdateError }
  | { kind: "installing"; candidateId: string }
  | { kind: "cancelled"; stage: "checking" | "downloading" }
  | { kind: "unavailable"; error: UpdateError }
  | { kind: "failed"; error: UpdateError };

type TransferProgress =
  | { length: "known"; receivedBytes: number; totalBytes: number }
  | { length: "unknown"; receivedBytes: number };

type UpdateCandidate = Readonly<{
  candidateId: string;
  version: string;
  channel: "stable" | "preview";
  target: "windows-x86_64" | "darwin-aarch64" | "darwin-x86_64" | "linux-x86_64";
  publishedAt: string | null;
  notes: string;
  expectedBytes: number | null;
}>;
```

`candidateId` is the hex SHA-256 of a versioned canonical encoding of the
validated build channel, candidate version, target, detected installer mode,
release tag, manifest digest, artifact URL, and artifact signature. It excludes
mutable UI state. The native pending object retains those exact validated
values and the verified bytes; later commands accept only `candidateId` and an
operation ID. A mismatch or superseded ID is stale and cannot retarget an
operation. At most one candidate and one transfer exist; a newer successful
check releases the previous native resources.

Remote notes are normalized bounded plain text. They are never rendered as
HTML/Markdown, never load images or links, and are excluded with a typed
`notes_too_large` failure rather than truncated into a misleading signed-release
description. Bundled notes remain independent and available offline.

Errors are closed, stage-aware data rather than raw library strings:

```ts
type UpdateError = Readonly<{
  code:
    | "offline" | "timeout" | "http_status" | "feed_unavailable"
    | "invalid_manifest" | "invalid_version" | "channel_mismatch"
    | "target_unavailable" | "unsupported_installation" | "read_only_installation"
    | "notes_too_large" | "payload_too_large" | "truncated_download"
    | "signature_invalid" | "insufficient_space" | "install_blocked"
    | "install_handoff_failed" | "post_install_unconfirmed" | "internal";
  stage: "check" | "download" | "verify" | "admission" | "install" | "startup";
  retryable: boolean;
  httpStatus?: number;
  safeDetail?: string;
}>;
```

`safeDetail` is redacted and capped at 512 UTF-8 bytes. It contains no URL,
filesystem path, signature, key, response body, credential, installer output,
or repository data. `offline`, `timeout`, non-success HTTP, malformed manifest,
missing feed, missing target, bad version/channel, truncated data, and invalid
signature remain distinct. Cancellation is a normal `cancelled` state, not a
failure and never an installable result.

Checks and downloads are cancellable by their exact operation ID. Verification
may finish atomically once it starts; a pending cancellation prevents `ready`
and releases the result. Installation is not advertised as cancellable after
native handoff. Late events for a cancelled/superseded operation are inert.

## Network and resource bounds

| Boundary | Limit |
| --- | ---: |
| Canonical serialized `raw_json` manifest | 256 KiB |
| Remote notes within that response | 16 KiB UTF-8 |
| Platform entries | 8 |
| Signature text | 4 KiB |
| Artifact, known or streamed length | 256 MiB |
| Metadata check | 15 seconds total |
| Download | 30 seconds without progress; 30 minutes total |
| Redirects | 5 |
| Retained candidates | 1 |

Only HTTPS is allowed. Production feed origins are the two compiled constants
above; selected asset URLs must be version-specific GitHub Release URLs for
`martinezelx/gitodile-feedback`, with the exact validated `vV` path. Standard
GitHub HTTPS redirects may be followed within the cap. The app sends no project
data, cookies, authentication token, persistent installation identifier, or
renderer-supplied headers. The normal HTTP stack may expose IP address, user
agent, and ordinary transport metadata to GitHub and intermediaries.

The plugin is the only component that reads the manifest response. After its
JSON decode, GitOdile rejects a canonical serialization over 256 KiB, any
unknown or missing top-level/platform field, more than eight platforms, any
disabled/unknown target, mismatched parsed field, empty/oversized signature, or
invalid/oversized package length. Artifact Content-Length remains advisory:
download callbacks enforce the same payload cap and final observed-length
agreement. A finished transfer enters `verifying`, not `ready`. Signature
failure or any truncation releases the bytes. Raising either cap requires new
recorded measurements and review.

The 2026-09-10 Windows release-profile measurement used the locally generated
unsigned NSIS payload plus a gzip-compressed copy of the installed Git for
Windows tree as a conservative future bundled-Git proxy. This was a local
resource measurement only, not signature, publication, or installation proof:

| Input / observation | Bytes |
| --- | ---: |
| Current unsigned NSIS installer | 2,660,544 |
| Installed Git for Windows tree before compression | 423,147,090 |
| Representative compressed Git payload | 134,164,849 |
| Combined bytes retained by the measurement buffer | 136,825,393 |
| `Vec` capacity | 268,435,456 |
| Observed process peak working set | 273,412,096 |

The result leaves about 125 MiB of payload headroom under the lowered 256 MiB
limit while bounding the plugin's one-buffer design. The repeatable harness is
`src-tauri/examples/measure_update_buffer.rs`; the representative archive was
deleted after measurement and is not a release artifact.

## Signing, publishing, and ownership readiness

Updater signing and operating-system trust are separate. The updater signature
must cover the final OS-signed/notarized update bytes. Tauri requires a pinned
updater public key; Windows distribution needs a code-signing identity to avoid
untrusted publisher warnings, while direct macOS distribution requires a
Developer ID Application identity, hardened runtime, secure timestamp, and
notarization. See Tauri's [Windows signing](https://v2.tauri.app/distribute/sign/windows/)
and [macOS signing](https://v2.tauri.app/distribute/sign/macos/) guides and
Apple's [notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

| Resource | Owner / required scope | Observed availability on 2026-09-09 |
| --- | --- | --- |
| Public feeds and versioned release assets | `martinezelx/gitodile-feedback`; repository owner `martinezelx` | Repository available; feeds 404; no releases |
| Production updater private key/password | Release maintainer; protected release environment only | Not created/configured; no Actions secret or offline-backup evidence |
| Production updater public key and key ID | Source config, reviewed and shipped with the app | Not created/configured |
| Offline updater-key backup | Release maintainer plus a separately stored recovery copy | Not evidenced |
| Cross-repository publisher credential | Prefer GitHub App installation token, Contents write only on `gitodile-feedback`; fine-grained expiring PAT is temporary fallback | Not configured; source `GITHUB_TOKEN` is repository-scoped and insufficient |
| Windows Authenticode identity | Release maintainer; trusted Windows signing job only | Certificate/service identity and access not evidenced |
| Apple Developer ID Application and notarization access | Future task 065-10; protected macOS environment only | Deliberately not configured for this phase; macOS is planned and disabled |
| Linux packaging baseline | Release maintainer; protected Linux build job | Compile-only CI exists; oldest supported glibc/distro and real AppImage QA not evidenced |
| Working-name clearance | Product owner | Still an external release gate; not evidenced as granted |

Secret values, certificate material, and protected build evidence never enter this table,
fixtures, logs, manifests, renderer state, or public artifacts. Key rotation
needs an old-key-signed bridge build. Loss before a bridge requires manual
reinstallation; verification is never disabled.

The release workflow boundary is deny-by-default and independent of source
visibility. A broad `v*` event only
starts a non-secret validation job; the exact release grammar, source SHA,
`main` ancestry and metadata agreement must pass before compilation. The build
matrix exports packages and hashes only. A later `workflow_run`, loaded from
protected `main`, repeats object-level validation and complete-matrix checks
before environment-protected jobs receive narrowly scoped OS/updater signing
credentials. Those jobs do not check out candidate source. The final evidence
records updater, OS-trust and notarization results separately and always sets
`publicPromotionAllowed` to false. Operational setup, backups, rotation and
loss response are owned by the [runbook](../release/signed-builds.md).

## Two-build qualification plan

The controlled forward pair is:

```text
A = 0.2.0-preview.4 / v0.2.0-preview.4
B = 0.2.0-preview.5 / v0.2.0-preview.5
```

Build A is the current unpublished candidate and build B is its planned
successor. They use a separate validation key and feed and must not advance
`preview.json` or `stable.json`. For each enabled target:

1. prepare each exact version on a short-lived version branch, merge it into
   `main`, tag that exact checked merge commit, and prove npm/Cargo/lock/Tauri,
   tag, manifest, target, and GitHub prerelease agreement;
2. build final packages in the intended trusted platform job, apply OS signing
   and notarization where applicable, then updater-sign the final bytes;
3. install A through its normal first-install artifact in the normal location,
   including one path with spaces/non-ASCII characters;
4. create settings/session/draft evidence and dirty tracked and untracked files,
   start the supported busy/locked/low-space cases, then check, download,
   verify, consent, and install B through the app-owned lifecycle;
5. relaunch or observe the Windows installer restart and independently confirm
   the running version is B and the exact user/repository evidence survived;
6. repeat cancellation, offline, timeout/HTTP, malformed/missing feed, missing
   target, equal/older candidate, corruption/signature rejection, read-only and
   interrupted handoff cases; verify manual reinstall guidance without
   downgrade or success loops;
7. retain package hashes, updater/OS signature verification, notary result,
   source SHA/tag, CI run, installation mode/path class, OS/architecture, and
   observed result in task 065-9-7.

A release-enabled target remains unadvertised and `qualification_required`
until all of its real package evidence is complete. The schema-version-3
registry additionally binds
both signed matrix identities, platform trust, preservation, failure cases and
the installed transition to the exact target. See
[`docs/release/updater-qualification.md`](../release/updater-qualification.md).
The contract fixtures validate selection and metadata now; they are not
substitutes for the two installations. Darwin remains `planned_disabled` with
empty evidence and follow-up owner 065-10.
