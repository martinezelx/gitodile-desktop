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

- npm, Cargo, Cargo's root lock entry, and Tauri all contain the current
  preview version; the release pipeline refuses any disagreement between them;
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
- the public `martinezelx/gitodile` repository exists, is public, uses
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
entry for the running target, cross-checks every selected value against what
the plugin parsed, and then retains the official `Update` for Tauri's
download, Minisign verification, and platform installation. This avoids a
second HTTP authority and a feed/cache race while preserving structured plugin
transport and schema errors.

Since task 065-9-11 (2026-09-15) the manifest validation is forward-compatible:
only the running target's entry is validated strictly; other `platforms` keys
(including `darwin-*` rows once task 065-10 publishes them) and unknown
top-level or per-entry fields are opaque within the byte and entry limits.
Forward compatibility of the feed is enforced at publication, where the
publisher still refuses every Darwin row while macOS is disabled, rather than
by making every installed client fail closed on a feed it cannot fully parse.
A missing entry for the running target is still `target_unavailable`, and a
malformed or oversized own entry is still rejected.

The same task made the compile-time target gate visible at check time. A
build compiled without the gate for its target (neither
`GITODILE_QUALIFIED_UPDATE_TARGETS` nor, on preview, the preview-test pair
names it) reports a newer version as `blocked(automatic_update_not_enabled)`
from the check itself, downloads nothing and offers the manual download.
`unsupported_installation` is reserved for installations the updater may never
replace (managed packages, stores, mounted images).

The production feeds are fixed constants. The public key and key ID are build-
time values (`GITODILE_UPDATER_PUBLIC_KEY` and
`GITODILE_UPDATER_PUBLIC_KEY_ID`); when absent, checking is truthfully
unavailable rather than accepting a placeholder. Automatic installation is a
second compile-time deny-by-default gate,
`GITODILE_QUALIFIED_UPDATE_TARGETS`. It must remain empty in ordinary builds
until task 065-9-7 qualifies an exact target/mode with real signed packages.
Public preview-testing builds use the separate compile-time
`GITODILE_PREVIEW_TEST_UPDATE_TARGETS` gate for the canonical Windows/Linux
pair. That gate is accepted only on the preview channel and enables real
preview-feed A-to-B testing without changing or claiming qualification; stable
builds never consult it. There is no other build profile: every build embeds
the one reviewed public key and can only be routed to the two public feeds.

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
| `stable` | `https://raw.githubusercontent.com/martinezelx/gitodile/main/updates/stable.json` |
| `preview` | `https://raw.githubusercontent.com/martinezelx/gitodile/main/updates/preview.json` |

`BuildUpdateIdentity` is generated and validated while building:

```rust
struct BuildUpdateIdentity {
    version: ReleaseVersion,
    channel: ReleaseChannel,
    feed: KnownFeed,
    public_key_id: UpdaterPublicKeyId,
}
```

`ReleaseChannel` and `KnownFeed` are closed enums. Every value comes from
the validated version and the reviewed public key compiled into the build. The
renderer can request a check; it cannot provide a channel, URL, public key,
installer path, target, or arbitrary request headers.

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
On Windows the NSIS mode is read from the installer's own record: Tauri's
installer writes `Software\Microsoft\Windows\CurrentVersion\Uninstall\GitOdile`
with `InstallLocation` under `HKEY_CURRENT_USER` for a per-user installation
and under `HKEY_LOCAL_MACHINE` for a machine-wide one, whichever directory the
person chose, so a per-user installation in a custom directory is still
`windows_nsis_per_user`. An NSIS build running from a directory neither hive
registered (a copied folder) is `unsupported`. The install directory's
write probe still runs before installation. These modes are never
automatically replaced:

| Detected installation | Outcome |
| --- | --- |
| Linux `.deb` / `.rpm`, AUR, Snap, Flatpak, or another managed package | `blocked(unsupported_installation)` with package-manager guidance |
| Windows MSI, machine-wide install, Microsoft Store, or an unknown installer family | Manual signed installer/store guidance; no NSIS handoff |
| A replaceable installation whose build was compiled without the gate for its target | `blocked(automatic_update_not_enabled)` at check time, before any download; manual download guidance |
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
    | "target_unavailable" | "unsupported_installation" | "automatic_update_not_enabled"
    | "read_only_installation"
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

`http_status` is reachable only from a download. With the pinned
`tauri-plugin-updater 2.11.0`, `check()` logs and discards a non-2xx feed
response and ends in `ReleaseNotFound`, which GitOdile reports as
`feed_unavailable` (retryable); the status code never reaches the app. The UI
must not promise a status code for a failed check. The contract check and
`scripts/check-app-update-contracts.mjs` keep the Rust enum, this list and the
renderer's `domain.ts` identical.

Remote notes keep their block structure: the publisher joins hard-wrapped
lines of one paragraph or list item, keeps one newline between list items and
a blank line between paragraphs, and the app preserves `\n` while stripping
markup, so the update dialog renders paragraphs and bullets rather than one
run-on line. `pub_date` is the instant GitHub published the release
(`published_at`), not a build or commit time.

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
`martinezelx/gitodile`, with the exact validated `vV` path. Standard
GitHub HTTPS redirects may be followed within the cap. The app sends no project
data, cookies, authentication token, persistent installation identifier, or
renderer-supplied headers. The normal HTTP stack may expose IP address, user
agent, and ordinary transport metadata to GitHub and intermediaries.

The plugin is the only component that reads the manifest response. After its
JSON decode, GitOdile rejects a canonical serialization over 256 KiB, a
`version`, `notes` or `pub_date` that differs from what the plugin parsed,
more than eight platforms, a missing entry for the running target, and, in
that entry, a URL outside the versioned release path, a URL or signature that
differs from the plugin's selection, an empty/oversized signature, or an
invalid/oversized package length. Other platform keys and unknown fields are
tolerated so a feed can grow without stranding installed clients. Artifact
Content-Length remains advisory:
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
| Public feeds and versioned release assets | `martinezelx/gitodile`; repository owner `martinezelx` | Repository available; feeds 404; no releases |
| Production updater private key/password | Release maintainer; protected release environment only | Not created/configured; no Actions secret or offline-backup evidence |
| Production updater public key and key ID | Source config, reviewed and shipped with the app | Not created/configured |
| Offline updater-key backup | Release maintainer plus a separately stored recovery copy | Not evidenced |
| Cross-repository publisher credential | Prefer GitHub App installation token, Contents write only on `gitodile`; fine-grained expiring PAT is temporary fallback | Not configured; source `GITHUB_TOKEN` is repository-scoped and insufficient |
| Windows Authenticode identity | Release maintainer; trusted Windows signing job only | Certificate/service identity and access not evidenced |
| Apple Developer ID Application and notarization access | Future task 065-10; protected macOS environment only | Deliberately not configured for this phase; macOS is planned and disabled |
| Linux packaging baseline | Release maintainer; protected Linux build job | Compile-only CI exists; oldest supported glibc/distro and real AppImage QA not evidenced |
| Working-name clearance | Product owner | Still an external release gate; not evidenced as granted |

Secret values, certificate material, and protected build evidence never enter this table,
fixtures, logs, manifests, renderer state, or public artifacts. Key rotation
needs an old-key-signed bridge build. Loss before a bridge requires manual
reinstallation; verification is never disabled.

The release workflow boundary is deny-by-default and independent of source
visibility. Only a merged same-repository `release/<version>` pull request can
authorize the default-branch coordinator. It requires the exact merge SHA at
the current `main` tip, the complete named check set, a release-only diff and
matching metadata before an environment-protected deploy key creates the exact
lightweight tag and dispatches the non-secret build. Manual tags, direct pushes
and fork pull requests cannot authorize it. Within that one pipeline run the
build matrix exports packages and hashes only; later jobs repeat object-level
validation and complete-matrix checks before the environment-protected
updater-signing job receives its narrowly scoped credentials. Those jobs do
not check out candidate source. The final evidence
records updater, OS-trust and notarization results separately and always sets
`publicPromotionAllowed` to false. Operational setup, backups, rotation and
loss response are owned by the [runbook](../release/signed-builds.md).

## Two-build qualification plan

Qualification proves one forward transition between two real, consecutive
public preview releases (A then B) built, signed and published by the normal
release pipeline with the production key and the public `preview.json` feed.
The versions are recorded in the evidence, not fixed in code. For each enabled
target:

1. prepare each exact version with `pnpm run release:prepare <version>` on
   the required `release/<version>` branch, merge its reviewed pull request into
   `main`, let the protected coordinator tag that exact checked merge commit,
   and prove npm/Cargo/lock/Tauri,
   tag, manifest, target, and GitHub prerelease agreement;
2. let the pipeline build final packages, record the OS-trust boundary,
   updater-sign the final bytes and publish the prerelease with its advanced
   `preview.json`;
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
   source SHA/tag, pipeline run, public release and feed identities,
   installation mode/path class, OS/architecture, and observed result in
   tasks 065-9-7/065-9-8.

A release-enabled target remains unadvertised and `qualification_required`
until all of its real package evidence is complete. The schema-version-4
registry additionally binds both public release identities, the feed that
served B, platform trust, preservation, failure cases and the installed
transition to the exact target. See
[`docs/release/updater-qualification.md`](../release/updater-qualification.md).
The contract fixtures validate selection and metadata now; they are not
substitutes for the two installations. Darwin remains `planned_disabled` with
empty evidence and follow-up owner 065-10.
