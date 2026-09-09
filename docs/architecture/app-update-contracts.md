# Application update contracts

This document is the implementation boundary established by task 065-9-1.
[ADR 0010](../adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the durable decision; this document fixes the values and bounded types that
tasks 065-9-2 through 065-9-7 must implement and qualify. The executable cases
live in [`065-9-1-app-update-contract.json`](065-9-1-app-update-contract.json).

Nothing in this document claims that the updater is currently installed or that
any platform is qualified. As of 2026-09-09, every automatic target remains
`qualification_required`.

Task 065-9-2's implemented process-wide gate, complete current operation/draft
inventory, and mandatory extension rules live in
[`install-admission-and-drafts.md`](install-admission-and-drafts.md). Later
updater work must consume that boundary rather than introducing a second busy
flag or screen-local draft check.

## Observed baseline

The repository was inspected rather than treating the planning documents as
runtime evidence:

- npm, Cargo, Cargo's root lock entry, and Tauri all contain
  `0.2.0-preview.1`; the build is an unpublished preview candidate;
- the Tauri identity is `app.gitodile.desktop`, bundling is active, and
  `bundle.targets` is `all`; that last value requests each host's normal bundle
  set but does not select an updater installer family or prove a package works;
- resolved Tauri runtime / CLI versions are `2.11.5` / `2.11.4`;
- neither the Rust nor JavaScript updater plugin is installed, updater artifacts
  are disabled, no public key or endpoint is embedded, and the WebView has no
  updater or process capability;
- current CI runs tests on Windows, macOS, and Linux and release-compiles an
  executable on macOS/Linux with `--no-bundle`. It does not package, sign,
  notarize, install, or update an application;
- the public `martinezelx/gitodile-feedback` repository exists, is public, uses
  `main`, and had no releases on 2026-09-09. Both planned feed URLs returned
  HTTP 404;
- the private source repository exposed no Actions secret names, variables, or
  environments to the authenticated maintainer query on 2026-09-09.

The native implementation will pin `tauri-plugin-updater` exactly at `2.11.0`
and use only its Rust API. No `@tauri-apps/plugin-updater` or process guest
binding belongs in the renderer. The pin is intentional because the plugin's
official source warns that its HTTP dependency may change in minor releases
when configuring the client. Task 065-9-3 must re-review that exact source and
upgrade deliberately if a newer version is needed before implementation.

Evidence: the current [Tauri updater guide](https://v2.tauri.app/plugin/updater/),
the official [`updater-v2.11.0` source](https://github.com/tauri-apps/plugins-workspace/blob/updater-v2.11.0/plugins/updater/src/updater.rs),
and the repository lockfiles.

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
| private source tag | `vV`, at the exact checked merge commit in `main` history |
| public release tag | `vV`, on an intentionally public feedback-repository commit |
| archived and channel manifests | top-level `version = V` |
| GitHub prerelease flag | `true` only for `preview`; `false` for `stable` |

The source and public tags share a name, not a commit identity. Private build
evidence binds the source tag/SHA to the public release; a public tag must never
point at a private source commit. The release workflow receives the tag only,
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
    feed: KnownFeed,
    public_key_id: UpdaterPublicKeyId,
}
```

`ReleaseChannel` and `KnownFeed` are closed enums. Production values come from
the validated version and checked release configuration. A separately branded
validation build may use a compile-time validation feed and validation public
key, but it cannot promote either production feed. The renderer can request a
check; it cannot provide a channel, URL, public key, installer path, target, or
arbitrary request headers.

## Target and installation matrix

Tauri static manifests use the documented `OS-ARCH` keys. The first candidate
matrix is deliberately narrow:

| Manifest target | Build target and first install | Automatic contract | Current evidence / gate | Manual fallback |
| --- | --- | --- | --- | --- |
| `windows-x86_64` | `x86_64-pc-windows-msvc`; per-user NSIS `-setup.exe` | Reuse the final NSIS executable, `passive` mode; installer handoff exits the old process | Candidate only. Needs Authenticode, updater signature, installed A→B and locked/low-space/path QA | Download the same signed NSIS installer |
| `darwin-aarch64` | `aarch64-apple-darwin`; signed/notarized DMG containing the app | Signed `.app.tar.gz` replaces a writable installed app bundle; relaunch and confirm version | Candidate only. No Apple identity/notarization evidence or real host QA. The open official [replacement-safety report](https://github.com/tauri-apps/plugins-workspace/issues/3505) must be resolved or independently mitigated and tested | Download the signed/notarized DMG and replace through Finder |
| `darwin-x86_64` | `x86_64-apple-darwin`; signed/notarized DMG containing the app | Same as Apple Silicon, with an architecture-specific artifact | Candidate only; same gates, plus real Intel hardware/VM evidence | Download the matching signed/notarized DMG |
| `linux-x86_64` | `x86_64-unknown-linux-gnu`; AppImage | Replace only the exact running AppImage when its backing file is regular and writable; relaunch and confirm version | Candidate only. Needs oldest-supported-glibc decision and installed A→B across the advertised distro baseline | Download the signed AppImage, mark executable, and replace it manually |

The updater feed contains one Windows installer family: NSIS. A current MSI or
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
| Complete manifest response | 256 KiB |
| Remote notes within that response | 16 KiB UTF-8 |
| Platform entries | 8 |
| Signature text | 4 KiB |
| Artifact, known or streamed length | 512 MiB |
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

Content-Length is advisory: reject a known oversize response before buffering,
enforce the same limit while streaming when length is absent or false, and
require the final observed length to agree when the server supplied one. A
finished transfer enters `verifying`, not `ready`. Signature failure or any
truncation releases the bytes. Task 065-9-3 must measure actual artifact size
and peak memory—including a representative future bundled Git—and lower the cap
or change the transport if 512 MiB is not safe. Raising it requires recorded
measurements and review.

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
| Apple Developer ID Application and notarization access | Apple team Account Holder/release maintainer; trusted macOS job only | Membership, certificate, team ID, and notary credentials not evidenced |
| Linux packaging baseline | Release maintainer; private Linux build job | Compile-only CI exists; oldest supported glibc/distro and real AppImage QA not evidenced |
| Working-name clearance | Product owner | Still an external release gate; not evidenced as granted |

Secret values, certificate material, and private source never enter this table,
fixtures, logs, manifests, renderer state, or public artifacts. Key rotation
needs an old-key-signed bridge build. Loss before a bridge requires manual
reinstallation; verification is never disabled.

## Two-build qualification plan

The controlled forward pair is:

```text
A = 0.2.0-preview.2 / v0.2.0-preview.2
B = 0.2.0-preview.3 / v0.2.0-preview.3
```

Both are future relative to the current `0.2.0-preview.1` candidate. They use a
separate validation key and feed and must not advance `preview.json` or
`stable.json`. For each target proposed above:

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

A target remains unadvertised and `qualification_required` until all of its real
package evidence is complete. The contract fixtures validate selection and
metadata now; they are not substitutes for the two installations.
