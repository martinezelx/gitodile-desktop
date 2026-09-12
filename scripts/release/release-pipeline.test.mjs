import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  ReleaseValidationError,
  parseReleaseTag,
  runCandidateCli,
  validateReleaseCandidate,
} from "./release-candidate.mjs";
import {
  createEvidence,
  requireCredentials,
  verifyCompleteMatrix,
  verifyArtifactShape,
  verifyEvidenceArtifacts,
} from "./release-evidence.mjs";

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function writeMetadata(root, version, overrides = {}) {
  const versions = {
    package: version,
    cargo: version,
    lock: version,
    tauri: version,
    ...overrides,
  };
  fs.mkdirSync(path.join(root, "src-tauri"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: versions.package }));
  fs.writeFileSync(path.join(root, "src-tauri", "Cargo.toml"), `[package]\nname = "gitodile"\nversion = "${versions.cargo}"\n`);
  fs.writeFileSync(path.join(root, "src-tauri", "Cargo.lock"), `name = "gitodile"\nversion = "${versions.lock}"\n`);
  fs.writeFileSync(path.join(root, "src-tauri", "tauri.conf.json"), JSON.stringify({ version: versions.tauri }));
}

function repository(version = "0.2.0-preview.2", overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitodile-release-test-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "release-test@example.invalid");
  git(root, "config", "user.name", "Release Test");
  writeMetadata(root, version, overrides);
  git(root, "add", ".");
  git(root, "commit", "-m", "candidate");
  const sha = git(root, "rev-parse", "HEAD");
  git(root, "tag", `v${version}`);
  return { root, sha, tag: `v${version}` };
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => error instanceof ReleaseValidationError && error.code === code);
}

test("rejects malformed tags and unsupported prerelease suffixes", () => {
  for (const tag of ["0.2.0", "v01.2.0", "v0.2.0-preview.0", "v0.2.0-beta.1", "v0.2.0-preview.01"]) {
    expectCode("invalid_tag", () => parseReleaseTag(tag));
  }
});

test("rejects a tagged commit outside approved main ancestry", () => {
  const repo = repository();
  git(repo.root, "branch", "approved-main", repo.sha);
  git(repo.root, "checkout", "--orphan", "untrusted");
  git(repo.root, "rm", "-r", "--cached", ".");
  writeMetadata(repo.root, "0.2.0-preview.3");
  git(repo.root, "add", ".");
  git(repo.root, "commit", "-m", "untrusted candidate");
  const sha = git(repo.root, "rev-parse", "HEAD");
  git(repo.root, "tag", "v0.2.0-preview.3");
  expectCode("wrong_ancestry", () =>
    validateReleaseCandidate({ root: repo.root, tag: "v0.2.0-preview.3", sha, mainRef: "approved-main" }),
  );
});

test("rejects every version metadata mismatch", () => {
  const repo = repository("0.2.0-preview.2", { cargo: "0.2.0-preview.3" });
  expectCode("metadata_mismatch", () =>
    validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: repo.sha, mainRef: "main" }),
  );
});

test("rejects a requested revision that is not the exact tag commit", () => {
  const repo = repository();
  fs.writeFileSync(path.join(repo.root, "after-tag.txt"), "later");
  git(repo.root, "add", ".");
  git(repo.root, "commit", "-m", "after tag");
  const later = git(repo.root, "rev-parse", "HEAD");
  expectCode("revision_mismatch", () =>
    validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: later, mainRef: "main" }),
  );
});

test("derives channel from version and rejects disagreement", () => {
  const repo = repository();
  expectCode("channel_mismatch", () =>
    validateReleaseCandidate({
      root: repo.root,
      tag: repo.tag,
      sha: repo.sha,
      mainRef: "main",
      claimedChannel: "stable",
    }),
  );
});

test("binds tag, exact revision, metadata, channel and matrix", () => {
  const repo = repository();
  const candidate = validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: repo.sha, mainRef: "main" });
  assert.equal(candidate.source.sha, repo.sha);
  assert.equal(candidate.release.channel, "preview");
  assert.equal(candidate.release.githubPrerelease, true);
  assert.equal(candidate.release.purpose, "qualification");
  assert.equal(candidate.release.signingProfile, "validation");
  assert.equal(candidate.release.publicPromotionAllowed, false);
  assert.deepEqual(candidate.matrix.requiredTargets, [
    "windows-x86_64",
    "linux-x86_64",
  ]);
  assert.deepEqual(candidate.matrix.targets[0], {
    key: "windows-x86_64",
    rustTarget: "x86_64-pc-windows-msvc",
  });
});

test("explicit trusted ref type supports workflow-run tag revalidation", () => {
  const repo = repository();
  const args = [
    "--root",
    repo.root,
    "--event",
    "push",
    "--ref-type",
    "tag",
    "--tag",
    repo.tag,
    "--sha",
    repo.sha,
    "--main-ref",
    "main",
  ];
  const candidate = runCandidateCli(args, { GITHUB_REF_TYPE: "branch" });
  assert.equal(candidate.source.sha, repo.sha);
  expectCode("invalid_event", () => runCandidateCli(args.with(5, "branch"), { GITHUB_REF_TYPE: "tag" }));
});

test("fails safely when credential names are absent without reading values", () => {
  expectCode("credentials_unavailable", () => requireCredentials({}, ["UPDATER_KEY", "UPDATER_PASSWORD"]));
  assert.deepEqual(requireCredentials({ UPDATER_KEY: "present" }, ["UPDATER_KEY"]), [
    { name: "UPDATER_KEY", available: true },
  ]);
});

test("generates and verifies artifact hashes and provenance", () => {
  const repo = repository();
  const candidate = validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: repo.sha, mainRef: "main" });
  const artifact = path.join(repo.root, "GitOdile.AppImage");
  fs.writeFileSync(artifact, "signed bytes");
  const evidence = createEvidence({
    candidate,
    target: "linux-x86_64",
    phase: "signed",
    artifacts: [{ file: artifact, role: "updater" }],
    trust: {
      updater: { result: "passed", publicIdentity: "validation-key-sha256:abc" },
      operatingSystem: { result: "not_applicable" },
      notarization: { result: "not_applicable" },
    },
  });
  assert.equal(evidence.source.sha, repo.sha);
  assert.equal(verifyEvidenceArtifacts(evidence, repo.root), true);
  fs.appendFileSync(artifact, "tampered");
  expectCode("hash_mismatch", () => verifyEvidenceArtifacts(evidence, repo.root));
});

test("an incomplete or mixed-provenance matrix cannot pass", () => {
  const repo = repository();
  const candidate = validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: repo.sha, mainRef: "main" });
  const evidence = ["windows-x86_64", "darwin-aarch64", "darwin-x86_64"].map((target) => ({
    schemaVersion: 1,
    phase: "os-signed",
    source: candidate.source,
    release: candidate.release,
    target,
    rustTarget:
      target === "windows-x86_64"
        ? "x86_64-pc-windows-msvc"
        : target === "darwin-aarch64"
          ? "aarch64-apple-darwin"
          : "x86_64-apple-darwin",
    artifacts: [
      {
        role: target.startsWith("darwin-") ? "first-install" : "first-install-and-updater",
        fileName: target === "windows-x86_64" ? `${target}.exe` : `${target}.dmg`,
        size: 1,
        sha256: "0".repeat(64),
      },
      ...(target.startsWith("darwin-")
        ? [{ role: "updater", fileName: `${target}.app.tar.gz`, size: 1, sha256: "1".repeat(64) }]
        : []),
    ],
    trust: {},
  }));
  expectCode("matrix_incomplete", () => verifyCompleteMatrix(evidence, candidate, { requiredPhase: "os-signed" }));
  evidence.push({ ...evidence[0], target: "linux-x86_64", source: { ...candidate.source, sha: "f".repeat(40) } });
  expectCode("provenance_mismatch", () => verifyCompleteMatrix(evidence, candidate, { requiredPhase: "os-signed" }));
});

test("evidence rejects source archives and non-package output", () => {
  expectCode("invalid_artifact", () =>
    verifyArtifactShape({
      target: "windows-x86_64",
      phase: "unsigned",
      artifacts: [{ role: "first-install-and-updater", fileName: "private-source.zip" }],
    }),
  );
});

test("Windows trust evidence rejects self-signed or unpinned Authenticode identities", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitodile-windows-trust-"));
  const identity = path.join(root, "identity.json");
  const output = path.join(root, "trust.json");
  const validationOutput = path.join(root, "validation-trust.json");
  const validationRun = spawnSync(process.execPath, [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "make-os-trust.mjs"),
    "windows-x86_64",
    "validation-unsigned",
    validationOutput,
  ], { encoding: "utf8", windowsHide: true });
  assert.equal(validationRun.status, 0, validationRun.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(validationOutput, "utf8")).operatingSystem, {
    result: "not_checked",
    reason: "authenticode_deferred",
    publicIdentity: null,
  });
  const run = () => spawnSync(process.execPath, [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "make-os-trust.mjs"),
    "windows-x86_64",
    identity,
    output,
  ], { encoding: "utf8", windowsHide: true });
  fs.writeFileSync(identity, JSON.stringify({
    result: "passed",
    subject: "CN=Example",
    issuer: "CN=Example",
    selfSigned: true,
    codeSigningEku: "passed",
    certificateChain: "passed",
  }));
  assert.notEqual(run().status, 0);
  fs.writeFileSync(identity, JSON.stringify({
    result: "passed",
    subject: "CN=Example Publisher",
    issuer: "CN=Public CA",
    sha256Thumbprint: "a".repeat(64),
    selfSigned: false,
    codeSigningEku: "passed",
    certificateChain: "passed",
    timestampSubject: "CN=Timestamp CA",
  }));
  assert.equal(run().status, 0);
  const signingScript = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "sign-windows.ps1"), "utf8");
  assert.match(signingScript, /GITODILE_WINDOWS_CERTIFICATE_SHA256/);
  assert.match(signingScript, /TimeStamperCertificate/);
  assert.match(signingScript, /X509RevocationMode/);
  assert.match(signingScript, /self-signed certificate is not accepted/);
});

test("only validation matrices may carry explicitly deferred Windows Authenticode", () => {
  const makeEvidence = (candidate, target, operatingSystem) => ({
    schemaVersion: 1,
    phase: "signed",
    source: candidate.source,
    release: candidate.release,
    target,
    rustTarget: target === "windows-x86_64" ? "x86_64-pc-windows-msvc" : "x86_64-unknown-linux-gnu",
    artifacts: [
      {
        role: "first-install-and-updater",
        fileName: target === "windows-x86_64" ? "GitOdile_setup.exe" : "GitOdile.AppImage",
        size: 1,
        sha256: "a".repeat(64),
      },
      {
        role: "updater-signature",
        fileName: target === "windows-x86_64" ? "GitOdile_setup.exe.sig" : "GitOdile.AppImage.sig",
        size: 1,
        sha256: "b".repeat(64),
      },
    ],
    trust: {
      updater: { result: "passed", publicIdentity: "validation-key" },
      operatingSystem,
      notarization: { result: "not_applicable" },
    },
  });
  const validationRepo = repository("0.2.0-preview.2");
  const validation = validateReleaseCandidate({
    root: validationRepo.root,
    tag: validationRepo.tag,
    sha: validationRepo.sha,
    mainRef: "main",
  });
  const deferred = { result: "not_checked", reason: "authenticode_deferred", publicIdentity: null };
  assert.equal(verifyCompleteMatrix([
    makeEvidence(validation, "windows-x86_64", deferred),
    makeEvidence(validation, "linux-x86_64", { result: "not_applicable" }),
  ], validation, { requiredPhase: "signed" }).length, 2);

  const productionRepo = repository("0.2.0-preview.4");
  const production = validateReleaseCandidate({
    root: productionRepo.root,
    tag: productionRepo.tag,
    sha: productionRepo.sha,
    mainRef: "main",
  });
  expectCode("verification_incomplete", () => verifyCompleteMatrix([
    makeEvidence(production, "windows-x86_64", deferred),
    makeEvidence(production, "linux-x86_64", { result: "not_applicable" }),
  ], production, { requiredPhase: "signed" }));
});

test("workflows expose no branch publication path and pin external actions", () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const workflowDirectory = path.join(repositoryRoot, ".github", "workflows");
  const readWorkflow = (name) => {
    const source = fs.readFileSync(path.join(workflowDirectory, name), "utf8");
    return { source, parsed: yaml.load(source, { schema: yaml.JSON_SCHEMA }) };
  };
  for (const name of fs.readdirSync(workflowDirectory).filter((item) => /\.ya?ml$/.test(item))) {
    const workflow = readWorkflow(name);
    for (const match of workflow.source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) {
      if (!match[1].startsWith("./")) assert.match(match[1], /@[0-9a-f]{40}$/, `${name} uses a mutable Action ref`);
    }
    for (const job of Object.values(workflow.parsed.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith("actions/checkout@")) {
          assert.equal(step.with?.["persist-credentials"], false, `${name} persists checkout credentials`);
        }
        if (step.run) {
          assert.doesNotMatch(step.run, /\$\{\{\s*(?:inputs|github\.event\.inputs)\./, `${name} interpolates a dispatch input into a shell`);
        }
      }
    }
  }
  const candidate = readWorkflow("private-candidate-build.yml");
  assert.deepEqual(Object.keys(candidate.parsed.on), ["push"]);
  assert.deepEqual(candidate.parsed.on.push, { tags: ["v*"] });
  assert.deepEqual(candidate.parsed.permissions, { contents: "read" });
  assert.doesNotMatch(candidate.source, /secrets\./);
  assert.deepEqual(candidate.parsed.jobs.build.strategy.matrix.include.map((item) => item.target), [
    "windows-x86_64",
    "linux-x86_64",
  ]);
  assert.equal(
    candidate.parsed.jobs.build.env.GITODILE_QUALIFIED_UPDATE_TARGETS,
    "${{ needs.validate.outputs.profile == 'validation' && matrix.target || vars.GITODILE_QUALIFIED_UPDATE_TARGETS }}",
  );
  const identityGuard = candidate.parsed.jobs.build.steps.find((step) => step.name === "Require reviewed public updater identity");
  assert.match(identityGuard.run, /Validation and production updater identities must both exist and be distinct/);
  assert.match(identityGuard.run, /qualifiedTargets !== validationTarget/);
  assert.match(identityGuard.run, /qualifiedTargets !== "windows-x86_64,linux-x86_64"/);
  const unsignedBuild = candidate.parsed.jobs.build.steps.find((step) => step.name === "Build without signing credentials");
  assert.match(unsignedBuild.run, /--config src-tauri\/tauri\.unsigned\.conf\.json/);
  assert.doesNotMatch(unsignedBuild.run, /--config\s+['"]?\{/,
    "inline JSON config is not shell-portable across the Windows and Linux matrix");

  const signing = readWorkflow("private-candidate-signing.yml");
  assert.deepEqual(Object.keys(signing.parsed.on), ["workflow_run"]);
  assert.deepEqual(signing.parsed.permissions, { actions: "read", contents: "read" });
  assert.equal(signing.parsed.jobs["macos-os-sign"], undefined);
  assert.deepEqual(signing.parsed.jobs["updater-sign-and-gate"].needs, [
    "authorize",
    "windows-validation-boundary",
    "windows-os-sign",
    "linux-os-boundary",
  ]);
  assert.equal(signing.parsed.jobs["windows-validation-boundary"].if, "needs.authorize.outputs.profile == 'validation'");
  assert.equal(signing.parsed.jobs["windows-os-sign"].if, "needs.authorize.outputs.profile == 'production'");
  assert.match(signing.parsed.jobs["updater-sign-and-gate"].if, /windows-validation-boundary\.result == 'success'/);
  const signingRevalidation = signing.parsed.jobs.authorize.steps.find(
    (step) => step.name === "Revalidate metadata directly from the tagged object",
  );
  assert.match(signingRevalidation.run, /--ref-type tag/);
  assert.match(signingRevalidation.run, /--tag "\$RELEASE_TAG"/);
  assert.match(signingRevalidation.run, /--sha "\$SOURCE_SHA"/);
  const candidateValidation = candidate.parsed.jobs.validate.steps.find(
    (step) => step.name === "Validate tag, ancestry, revision, versions and channel",
  );
  assert.match(candidateValidation.run, /--ref-type "\$GITHUB_REF_TYPE"/);
  for (const source of [candidate.source, signing.source]) {
    assert.doesNotMatch(source, /gitodile-feedback|contents:\s*write|create-release|upload-release-asset/i);
  }
  for (const job of Object.values(signing.parsed.jobs)) {
    for (const step of job.steps ?? []) {
      if (step.uses?.startsWith("actions/checkout@")) assert.equal(step.with?.ref, "${{ github.workflow_sha }}");
    }
  }

  const qualification = readWorkflow("qualification-validation-bundle.yml");
  assert.deepEqual(Object.keys(qualification.parsed.on), ["workflow_dispatch"]);
  assert.deepEqual(qualification.parsed.permissions, { actions: "read", contents: "read" });
  assert.equal(qualification.parsed.jobs.prepare.if, "github.ref == 'refs/heads/main' && github.sha == github.workflow_sha");
  assert.doesNotMatch(qualification.source, /secrets\.|contents:\s*write|gitodile-feedback/i);
  assert.match(qualification.source, /GITODILE_VALIDATION_UPDATE_FEED/);

  const publication = readWorkflow("public-release-publishing.yml");
  assert.equal(publication.parsed.jobs["authorize-and-stage"].if, "github.ref == 'refs/heads/main' && github.sha == github.workflow_sha");
});
