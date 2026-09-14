---
id: 065-9-10
title: Prepare releases automatically after approved version-branch merges
status: active
priority: high
type: feature
areas:
  - release
  - automation
  - security
  - documentation
created: 2026-09-13
completed:
parent: "065-9"
queue: "05"
---

# Goal

Consolidate GitOdile into one source repository and one public product
repository, then start the appropriate release preparation automatically when
an explicitly named version branch is merged into protected `main`, without
making an unreviewed merge equivalent to production publication.

# Context

The controlled `.2` to `.3` qualification deliberately keeps tagging and
publication explicit so the first real pipeline can be observed gate by gate.
After that path is proven, the maintainer wants merges from recognized preview
or release branches to initiate the same hardened candidate workflow.

On 2026-09-14 the maintainer selected the durable repository names:

- `martinezelx/gitodile-desktop` owns application source, tests, documentation,
  candidate builds and release automation.
- `martinezelx/gitodile` is the public product home and owns downloads, GitHub
  Releases, updater feeds and issues.

`project-gitodile` and `gitodile-feedback` are temporary names. GitHub's rename
redirects are a migration aid, not a permanent runtime dependency. The
controlled `gitodile-validation` host receives no new versions; its immutable
`.2`/`.3` and `.4`/`.5` qualification evidence must be retained until 065-9-8
is closed and only then archived or removed through a separately reviewed
evidence-retention step.

## Version-branch contract

The only release-triggering source branch form is `release/<version>`, where
`<version>` is the exact canonical SemVer stored in every version-bearing file:

- preview example: `release/0.2.0-preview.10`;
- stable example: `release/1.0.0`.

Forms such as `0.2.0preview.10`, `release/v0.2.0-preview.10`, arbitrary feature
branches and direct pushes to `main` do not trigger a release. The `v` prefix
belongs only to the generated tag, for example `v0.2.0-preview.10`.

The version branch may change only reviewed release preparation: synchronized
version metadata, curated notes and deliberate release configuration. It enters
`main` through a pull request with required checks. The automation consumes the
closed-and-merged event from the same repository, verifies the exact protected-
`main` merge SHA and successful required checks, and creates the tag only when
branch, metadata, notes and derived channel agree.

# Scope

- Rename `project-gitodile` to `gitodile-desktop` and `gitodile-feedback` to
  `gitodile`; update local remotes, repository rules, environments, GitHub App
  or token scope, Actions variables, badges, source/support/download links,
  feed endpoints, updater capabilities, tests and runbooks to their canonical
  destinations.
- Make the public `gitodile` README clearly identify it as the product download,
  releases and issue hub and link to `gitodile-desktop` as the source repository.
- Define and enforce the `release/<canonical-semver>` branch contract for both
  preview and stable candidates.
- On a closed, merged pull request, bind the merge commit, source branch,
  same-repository identity, version metadata, curated notes, required-check
  result and expected channel before creating any tag.
- Run the tag-creation logic only from workflow code already present on the
  protected default branch. Never check out or execute pull-request-head code
  with a token that can create tags or write another repository.
- Reuse the protected candidate, signing and publication gates; do not copy or
  bypass their authorization logic.
- Make retries idempotent and reject an existing tag that identifies different
  bytes.
- Let a valid generated tag start Windows and Linux candidate builds
  automatically. Keep cross-repository publication as a later promotion that
  consumes only verified build/signing evidence.
- Keep production publication behind its protected environment approval and
  destination-scoped credential.
- Preserve macOS as disabled through `1.0.0` and until its post-1.0 independent
  qualification is complete.
- Preserve the honest `authenticode_deferred` state for pre-1.0 and initial
  1.0 Windows releases; automation must not imply OS-level publisher trust.

# Acceptance criteria

- [ ] The canonical repositories are exactly `martinezelx/gitodile-desktop`
      and `martinezelx/gitodile`; every runtime URL, workflow assertion,
      credential scope and user-facing link uses the new names without relying
      on GitHub redirects.
- [ ] The public product repository contains issues, immutable GitHub Release
      assets and `preview.json`/`stable.json`, but no application build job or
      application signing authority. The source repository cannot publish with
      its ordinary `GITHUB_TOKEN`.
- [ ] Existing source history, rulesets, required checks, environments, release
      evidence and issue content survive the rename and are independently
      checked before old URLs are treated as obsolete.
- [ ] A merged recognized preview branch starts one candidate preparation for
      the exact protected-main merge commit and matching prerelease version.
- [ ] A merged recognized release branch starts the intended release
      preparation only when stable metadata and policy permit it.
- [ ] Closed-but-unmerged pull requests, forks, renamed branches, version
      mismatches, missing notes, failed required checks, direct pushes and
      unrecognized branches fail closed without creating tags or releases.
- [ ] Privileged tag creation does not execute code from the version branch or
      use pull-request-controlled commands, paths, environment names, artifact
      names or destination repository values.
- [ ] Re-delivery and retries are idempotent; an existing mismatched tag or
      asset is never overwritten.
- [ ] Signing and publication still require their existing protected
      environments, matrix checks and exact provenance.
- [ ] Executable tests cover preview, release and every rejected event shape,
      and `pnpm run check` plus `pnpm run check:publication` pass.

# Dependencies

- [065-9-8](065-9-8-public-windows-linux-qualification.md) and the publication
  contracts needed for unsigned-but-Tauri-authenticated Windows/Linux releases.

Implementation and simulated end-to-end tests may proceed before the remaining
Linux VM qualification. Real production feed promotion and closure of this task
still require every enabled target to satisfy the qualification registry.

Task 065-9-9 is deliberately post-1.0 and does not block this automation.

# Current implementation baseline

- Starting commit: `a13cbc43b3d9848880a3f9d7b07034418fef884b` on `main`, equal
  to `origin/main` when this execution specification was finalized.
- Current application version: `0.2.0-preview.5`.
- Existing workflows are manual/tag-oriented and named
  `private-candidate-build.yml`, `private-candidate-signing.yml`,
  `qualification-validation-bundle.yml` and
  `public-release-publishing.yml`.
- Existing release logic lives under `scripts/release/`; extend its pure,
  executable validators rather than embedding policy in workflow YAML.
- The production updater key exists, but Windows Authenticode is deliberately
  deferred through `1.0.0`. The remaining real Linux qualification is not
  evidence this task may fabricate.
- The repository renames have not yet been performed. Treat both rename
  operations and every dependent URL/permission migration as part of this task.

# Implementation sequence

1. Inventory both live repositories, rulesets, environments, variables,
   secrets by name, issue settings, Pages/releases, current remotes and all old
   repository-name references. Save a non-secret before-state report.
2. Add pure parsers and tests for canonical `release/<version>` branches,
   preview/stable channel derivation, same-repository merged-PR events, exact
   merge SHA binding and idempotent tag decisions.
3. Add `pnpm run release:prepare -- <version>`. It must start from a clean,
   current `main`, create `release/<version>`, update every authoritative
   version file through one implementation, create a curated-notes template,
   and finish by running consistency checks. It must never push or publish.
4. Add the least-privileged merged-PR coordinator. It reads only workflow code
   from protected `main`, rejects untrusted event data before granting write
   authority, creates `v<version>` at the exact merge SHA and treats a matching
   existing tag as a successful retry while rejecting any mismatch.
5. Chain the generated tag into the existing candidate build, Tauri signing,
   evidence and publication workflows. Build once per platform; pass immutable
   artifacts and verified metadata forward rather than rebuilding later.
6. Rename the public product repository to `gitodile`, then the source
   repository to `gitodile-desktop`. Immediately update the local remote and
   all canonical URLs, rules, environments, application capabilities, tests and
   cross-repository credential scopes. Verify both repositories anonymously
   and through the GitHub API after each rename.
7. Provide a non-promoting end-to-end dry run and negative-event fixtures.
   Preserve protected approval for preview publication initially and always for
   stable publication. Do not enable stable or macOS publication in this task.
8. Run `pnpm run check` and `pnpm run check:publication`, inspect every Actions
   run caused by the migration, and correct failures without weakening gates.
   Record exact commits, runs, repository settings and remaining Linux blocker.

# Developer release experience

After this task, the maintainer's normal preview operation is:

```powershell
git switch main
git pull --ff-only
pnpm run release:prepare -- 0.2.0-preview.10
@'
# GitOdile 0.2.0-preview.10

Describe the reviewed user-visible changes here.
'@ | Set-Content docs/release/notes/v0.2.0-preview.10.md
git add README.md package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json docs/release/notes/v0.2.0-preview.10.md
git commit -m "chore(release): prepare 0.2.0-preview.10"
git push -u origin release/0.2.0-preview.10
```

The maintainer replaces and reviews the generated notes before committing,
opens the pull request, waits for
required checks, merges it and approves the protected publication prompt. Tag
creation, Windows/Linux candidate builds, Tauri signing, evidence assembly,
publication to `martinezelx/gitodile`, feed promotion and anonymous
post-publication verification then run automatically. Preview approval may be
removed only after several successful observed releases and a separate policy
change; stable approval remains mandatory.

# Explicit safety invariants

- A branch name, commit message, PR title or version file alone grants no
  release authority.
- Direct pushes and manually created tags do not enter the merge-driven path.
- Privileged jobs never execute pull-request-head scripts or interpolate
  untrusted event strings into a shell command.
- The ordinary source-repository token cannot write `martinezelx/gitodile`.
- Build jobs cannot access the destination publisher credential; publisher jobs
  cannot rebuild or alter packages.
- Tags, finalized release assets and versioned feed inputs are append-only.
- Preview cannot update stable; stable cannot relabel or overwrite a preview.
- Windows remains `authenticode_deferred`, Linux retains its real qualification
  gate, and both macOS targets remain rejected.
- No secret value is printed, copied into an artifact or requested from the
  maintainer in chat.

# Validation

Retain the merged pull-request event, exact merge SHA, generated tag identity,
candidate/signing run links, repository rename audit, canonical endpoint checks
and rejection-test output. Exercise a preview through a non-promoting or
reviewer-approved dry run before enabling normal publication. Do not use this
task to publish a stable release or any macOS artifact.

# Fresh-session execution prompt

```text
Continúa GitOdile implementando íntegramente la tarea 065-9-10:

C:\workspace\project-gitodile\work\active\app-updates\065-9-10-merge-driven-release-preparation.md

Trabaja directamente en C:\workspace\project-gitodile, rama main. Sigue
AGENTS.md y lee completos README.md, DESIGN.md, docs/PRODUCT_STRATEGY.md, los
ADR 0010 y 0011, y los runbooks de release referenciados por la tarea antes de
modificar nada. El baseline al preparar este prompt era el commit
a13cbc43b3d9848880a3f9d7b07034418fef884b, coincidente con origin/main; empieza
comprobando git status, HEAD/origin/main y cambios posteriores, y conserva
cualquier cambio legítimo que encuentres.

La decisión cerrada es mantener exactamente dos repositorios operativos:
martinezelx/gitodile-desktop para código/builds/automatización y
martinezelx/gitodile para issues, releases, descargas y feeds. Los nombres
project-gitodile y gitodile-feedback deben migrarse dentro de esta tarea. El
host gitodile-validation no recibirá versiones nuevas; no modifiques, muevas ni
sobrescribas su evidencia inmutable .2/.3 y .4/.5.

Implementa el comando `pnpm run release:prepare -- <semver>` y el flujo seguro
descrito en la tarea. La única rama válida es `release/<semver>`; por ejemplo,
`release/0.2.0-preview.10`. Tras una PR del mismo repositorio, checks verdes y
merge en main, crea idempotentemente `v<semver>` en el merge SHA exacto y
encadena automáticamente build Windows/Linux, firma Tauri, evidencia,
promoción protegida, publicación en martinezelx/gitodile, actualización del
feed correcto y verificación anónima. El código privilegiado debe proceder de
main y nunca ejecutar código de la rama con permisos de escritura.

Windows continúa sin Authenticode y debe registrar
`authenticode_deferred`; macOS sigue deshabilitado hasta post-1.0. La prueba
real Linux pendiente no impide implementar y validar la automatización, pero sí
impide declarar su cualificación o cerrar criterios que dependan de ella. No
publiques stable ni artefactos macOS. Mantén aprobación protegida para publicar
previews inicialmente y siempre para stable.

Haz todas las operaciones posibles, incluidas las migraciones GitHub y la
actualización del remoto local, sin pedir secretos ni mostrarlos. Pide
intervención solo para una aprobación protegida o interacción realmente
imprescindible. Verifica cada cambio con tests ejecutables, `pnpm run check` y
`pnpm run check:publication`; revisa todas las ejecuciones de Actions causadas
por el cambio y corrige sus fallos sin debilitar controles. Actualiza la tarea
con commits, runs y evidencia real, y pushea los cambios necesarios a main.
```
