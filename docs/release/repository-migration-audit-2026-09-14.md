# Release repository migration audit — 2026-09-14

This non-secret record supports task 065-9-10. It records repository identity
and release-control state without copying credentials, signing material or
authenticated responses.

## Before state

The audit was run from clean `main` at
`c38d2d38b907190d9305051d63dcd1cdf39e8db3`, equal to `origin/main`. That commit
is one documented planning commit after the task baseline
`a13cbc43b3d9848880a3f9d7b07034418fef884b`.

| Responsibility | Repository | Repository ID | State |
| --- | --- | ---: | --- |
| Source, builds and automation | `martinezelx/project-gitodile` | `1309817886` | public, active, default branch `main`, no releases |
| Issues and future public releases | `martinezelx/gitodile-feedback` | `1355852393` | public, active, default branch `main`, issues enabled, no releases |
| Controlled qualification evidence | `martinezelx/gitodile-validation` | `1367250349` | public Pages host; immutable `.2`/`.3` and `.4`/`.5` evidence retained |

The canonical destination names `martinezelx/gitodile-desktop` and
`martinezelx/gitodile` were unallocated before migration. The authenticated
maintainer session had repository administration access; no token value was
read or recorded.

The source repository had active rulesets `22979730` (`Protect main`) and
`22979731` (`Protect release tags`). `main` required a pull request, one review,
last-push approval, resolved review threads, strict success for eight named
checks, and blocked deletion/non-fast-forward updates. The release-tag ruleset
blocked creation, update and deletion of `v*`, with only the repository-admin
role as a bypass actor. The repository default workflow token was read-only and
Actions allowed only reviewed, SHA-pinned providers.

Five protected environments existed and required the maintainer reviewer from
protected branches: `production-updater-signing`,
`production-windows-signing`, `validation-updater-signing`,
`public-release-validation-draft` and `public-release-production`. Only the two
updater-signing environments exposed secret *names*, both
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Repository
variables contained the distinct validation/production updater public
identities and the controlled validation feed. No repository secret and no
`GITODILE_PUBLIC_RELEASE_TOKEN` environment secret existed.

The public product repository contained the bilingual issue forms, labels,
private vulnerability reporting and its support README. It had no workflow,
environment, variable, secret, release, tag, Pages site or build/signing
authority.

The controlled `gitodile-validation` repository was inspected only. Its Pages
configuration, commits and hosted evidence were not modified, moved or
overwritten by this migration.

## Migration results

GitHub retained repository IDs while renaming the public product repository
first and the source repository second:

| Responsibility | Canonical repository | Repository ID | Verified state |
| --- | --- | ---: | --- |
| Source, builds and automation | `martinezelx/gitodile-desktop` | `1309817886` | public, active, `main`; source history, tags, Actions artifacts, rulesets, environments and variables retained |
| Issues, releases, downloads and feeds | `martinezelx/gitodile` | `1355852393` | public, active, `main`; issues, labels, bilingual forms and private vulnerability reporting retained |
| Controlled qualification evidence | `martinezelx/gitodile-validation` | `1367250349` | unchanged at `07ca923e7b942e72efefe72be81f7c6d9f2f1b34`; Pages remains built from `main` `/`; no commit, Pages setting or hosted byte was modified |

The local `origin` now uses
`https://github.com/martinezelx/gitodile-desktop.git`; an exact anonymous
`ls-remote` resolved its `main` to the expected pre-migration SHA. Product,
support, feed and download contracts use the canonical names directly rather
than depending on GitHub redirects.

Anonymous endpoint checks returned HTTP 200 for both canonical repository APIs
and for the empty public Releases collection. The public repository still has
zero workflows, tags and releases. Both canonical feed paths returned 404, the
expected fail-closed state while target qualification and production promotion
remain disabled.

The product-hub README was replaced at public commit
`35788572b95194990eafe0daf12c373ae21ce569` and now identifies the repository
as the issue/release/download/feed destination, links the canonical source
repository, states that it has no build or signing authority, and discloses the
current qualification and platform limits. Commits
`cd372a69cfb3f7997c0cff8c6a9d06b7de8f492a` through
`f231076b65484c21307a7ab770ebd02b249bfe61` migrated the private-security links
in `SECURITY.md`, issue configuration and all four bilingual forms. The final
tree contains no old repository URL.

The `v*` creation/update/deletion rules remain active. GitHub would not admit
its implicit Actions integration as a repository ruleset bypass actor, so the
control was not removed or weakened. A dedicated write-enabled deploy key
(`163232356`) was added only as a bypass actor for ruleset `22979731`; its
private half exists only as the `GITODILE_RELEASE_TAG_DEPLOY_KEY` secret in the
new `release-tagging` environment. That environment admits protected branches
only. Temporary local key material was removed after upload. The default
workflow token remains read-only and the deploy key is not available to builds,
signing or publication.

## Open gates retained

- `GITODILE_PUBLIC_RELEASE_TOKEN` is not configured. GitHub offers no API to
  mint a fine-grained personal token, and the maintainer's broad local OAuth
  credential was not copied into Actions. Production publication therefore
  remains fail-closed until a GitHub App installation token or fine-grained PAT
  with Contents write limited to `martinezelx/gitodile` is provisioned in the
  protected publication environment.
- `GITODILE_QUALIFIED_UPDATE_TARGETS` remains unset. The outstanding real Linux
  AppImage transition and Windows failure-matrix evidence keep both enabled
  targets at `qualification_required`; no production feed may move.
- The sole repository collaborator is the maintainer. A self-authored release
  PR cannot receive the configured independent approval, although the existing
  administrator bypass can merge it after the required checks. This migration
  did not weaken the one-review rule or fabricate an approval.
- Windows remains `authenticode_deferred`; `production-windows-signing` is
  retained as a post-1.0 reserved environment but is not part of the pre-1.0
  pipeline. Both macOS targets remain disabled and absent from release assets
  and feeds.
