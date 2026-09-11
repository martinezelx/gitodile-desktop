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
    "darwin-aarch64",
    "darwin-x86_64",
    "linux-x86_64",
  ]);
  assert.deepEqual(candidate.matrix.targets[0], {
    key: "windows-x86_64",
    rustTarget: "x86_64-pc-windows-msvc",
  });
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

test("workflows expose no branch publication path and pin external actions", () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const readWorkflow = (name) => {
    const source = fs.readFileSync(path.join(repositoryRoot, ".github", "workflows", name), "utf8");
    return { source, parsed: yaml.load(source, { schema: yaml.JSON_SCHEMA }) };
  };
  const candidate = readWorkflow("private-candidate-build.yml");
  assert.deepEqual(Object.keys(candidate.parsed.on), ["push"]);
  assert.deepEqual(candidate.parsed.on.push, { tags: ["v*"] });
  assert.deepEqual(candidate.parsed.permissions, { contents: "read" });
  assert.doesNotMatch(candidate.source, /secrets\./);

  const signing = readWorkflow("private-candidate-signing.yml");
  assert.deepEqual(Object.keys(signing.parsed.on), ["workflow_run"]);
  assert.deepEqual(signing.parsed.permissions, { actions: "read", contents: "read" });
  for (const source of [candidate.source, signing.source]) {
    assert.doesNotMatch(source, /gitodile-feedback|contents:\s*write|create-release|upload-release-asset/i);
    for (const match of source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) {
      assert.match(match[1], /@[0-9a-f]{40}$/);
    }
  }
  for (const job of Object.values(signing.parsed.jobs)) {
    for (const step of job.steps ?? []) {
      if (step.uses?.startsWith("actions/checkout@")) assert.equal(step.with?.ref, "main");
    }
  }

  const qualification = readWorkflow("qualification-validation-bundle.yml");
  assert.deepEqual(Object.keys(qualification.parsed.on), ["workflow_dispatch"]);
  assert.deepEqual(qualification.parsed.permissions, { actions: "read", contents: "read" });
  assert.doesNotMatch(qualification.source, /secrets\.|contents:\s*write|gitodile-feedback/i);
  assert.match(qualification.source, /GITODILE_VALIDATION_UPDATE_FEED/);
  for (const match of qualification.source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) {
    assert.match(match[1], /@[0-9a-f]{40}$/);
  }
});
