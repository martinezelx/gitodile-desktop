import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { createEvidence } from "./release-evidence.mjs";
import {
  ALL_TARGETS,
  REQUIRED_TARGETS,
  TARGET_CONTRACTS,
  ReleaseValidationError,
  parseReleaseVersion,
} from "./release-candidate.mjs";
import {
  PREVIEW_FEED_URL,
  REQUIRED_FAILURE_CASES,
  REQUIRED_PRESERVATION_CHECKS,
  REQUIRED_PUBLISHER_CHECKS,
  validateTargetEvidence,
} from "./qualification-evidence.mjs";
import { compareReleaseVersions, feedsForPromotion, preparePublication, updateFeedbackReadme } from "./public-release.mjs";
import { anonymousHash, atomicPublicCommit, reconcileAssets, validateSourceRun } from "./github-publication.mjs";

function expectCode(code, callback) {
  assert.throws(callback, (error) => error instanceof ReleaseValidationError && error.code === code);
}

function candidate(version) {
  const release = parseReleaseVersion(version);
  return {
    schemaVersion: 1,
    source: { tag: `v${version}`, sha: "a".repeat(40), approvedMainRef: "refs/remotes/origin/main" },
    release: { ...release, publicPromotionAllowed: false },
    matrix: { requiredTargets: [...REQUIRED_TARGETS], targets: REQUIRED_TARGETS.map((key) => ({ key, rustTarget: TARGET_CONTRACTS[key].rustTarget })) },
  };
}

// The qualified pair is data: any two consecutive real public previews.
const PAIR = Object.freeze({ from: "0.2.0-preview.9", to: "0.2.0-preview.10" });
const KEY_ID = "production-key-1";

function qualification(enabled = false, pair = PAIR) {
  const hash = (index, length) => ((index % 15) + 1).toString(16).repeat(length);
  const asset = (key, version, kind, index) => {
    const fileName = `GitOdile-${key}-${version}-${kind}`;
    return { fileName, size: 1024 + index, sha256: hash(index, 64), anonymousUrl: `https://github.com/martinezelx/gitodile/releases/download/v${version}/${fileName}` };
  };
  const buildProof = (key, version, index) => ({
    version,
    tag: `v${version}`,
    sourceSha: hash(index, 40),
    signedMatrixSha256: hash(index + 2, 64),
    manifestSha256: hash(index + 3, 64),
    pipelineRunUrl: `https://github.com/martinezelx/gitodile-desktop/actions/runs/${index + 10}`,
    publicReleaseUrl: `https://github.com/martinezelx/gitodile/releases/tag/v${version}`,
    publicTagCommit: hash(index + 1, 40),
    installerArtifact: asset(key, version, "installer", index + 4),
    updaterArtifact: asset(key, version, "updater", index + 6),
    updaterSignature: { result: "passed", publicKeyId: KEY_ID },
    operatingSystemTrust: key === "linux-x86_64"
      ? { result: "not_applicable" }
      : { result: "not_checked", reason: "authenticode_deferred", publicIdentity: null },
    notarization: key.startsWith("darwin-") ? { result: "passed" } : { result: "not_applicable" },
  });
  return {
    schemaVersion: 4,
    releaseMatrix: {
      enabledTargets: [...REQUIRED_TARGETS],
      disabledTargets: ALL_TARGETS.filter((key) => !REQUIRED_TARGETS.includes(key)).map((key) => ({
        key,
        status: "planned_disabled",
        reason: "real_platform_qualification_required",
        followUpTask: "065-10",
        evidence: [],
      })),
    },
    productionPromotion: enabled ? {
      enabled: true,
      workingNameClearance: "evidenced",
      approvedAt: "2026-09-11T12:00:00Z",
      evidence: {
        schemaVersion: 2,
        updaterPublicKeyId: KEY_ID,
        workingNameClearance: { result: "passed", reviewedAt: "2026-09-11T11:00:00Z", referenceUrl: "https://example.com/clearance/065-9-7" },
        publisher: {
          result: "passed",
          pipelineRunUrl: "https://github.com/martinezelx/gitodile-desktop/actions/runs/99",
          reportSha256: "9".repeat(64),
          ...Object.fromEntries(REQUIRED_PUBLISHER_CHECKS.map((name) => [name, "passed"])),
        },
      },
    } : { enabled: false, workingNameClearance: "not_evidenced", approvedAt: null, evidence: null },
    targets: ALL_TARGETS.map((key, targetIndex) => ({
      key,
      status: REQUIRED_TARGETS.includes(key)
        ? (enabled ? "qualified" : "qualification_required")
        : "planned_disabled",
      evidence: enabled && REQUIRED_TARGETS.includes(key) ? [{
        schemaVersion: 2,
        target: key,
        result: "passed",
        observedAt: `2026-09-${String(targetIndex + 11).padStart(2, "0")}T12:00:00Z`,
        report: { url: `https://example.com/reports/${key}`, sha256: String(targetIndex + 1).repeat(64) },
        environment: {
          os: key === "windows-x86_64" ? "windows" : key === "linux-x86_64" ? "linux" : "macos",
          osVersion: "test-os-version",
          architecture: key.endsWith("aarch64") ? "aarch64" : "x86_64",
          installationMode: TARGET_CONTRACTS[key].installation,
        },
        transition: {
          fromVersion: pair.from,
          toVersion: pair.to,
          runningVersionBefore: pair.from,
          runningVersionAfter: pair.to,
          result: "passed",
          falseSuccessObserved: false,
          forcedDowngradeObserved: false,
        },
        builds: {
          from: buildProof(key, pair.from, targetIndex * 2),
          to: buildProof(key, pair.to, targetIndex * 2 + 1),
        },
        feed: { url: PREVIEW_FEED_URL, version: pair.to, sha256: "7".repeat(64), commitSha: "c".repeat(40), observedAt: "2026-09-12T12:00:00Z" },
        preservation: Object.fromEntries(REQUIRED_PRESERVATION_CHECKS.map((name) => [name, name === "gitHistory" ? "unchanged" : "passed"])),
        failureCases: REQUIRED_FAILURE_CASES.map((name) => ({ name, result: "passed", falseSuccessObserved: false, forcedDowngradeObserved: false })),
        replacementSafety: key.startsWith("darwin-")
          ? { result: "passed", independentReviewUrl: "https://example.com/reviews/macos-replacement", testReportSha256: "8".repeat(64) }
          : { result: "not_applicable" },
      }] : [],
    })),
  };
}

function signedMatrix(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitodile-publication-"));
  const identity = candidate(version);
  for (const target of REQUIRED_TARGETS) {
    const directory = path.join(root, target);
    fs.mkdirSync(directory, { recursive: true });
    const artifacts = [];
    const updaterName = target === "windows-x86_64" ? `GitOdile_${version}_setup.exe` : target.startsWith("darwin-") ? `GitOdile_${version}_${target}.app.tar.gz` : `GitOdile_${version}.AppImage`;
    if (target.startsWith("darwin-")) {
      const installer = path.join(directory, `GitOdile_${version}_${target}.dmg`);
      fs.writeFileSync(installer, `installer-${target}`);
      artifacts.push({ role: "first-install", file: installer });
    }
    const updater = path.join(directory, updaterName);
    const signature = `${updater}.sig`;
    fs.writeFileSync(updater, `signed-${target}-${version}`);
    fs.writeFileSync(signature, `signature-${target}`);
    artifacts.push({ role: target.startsWith("darwin-") ? "updater" : "first-install-and-updater", file: updater }, { role: "updater-signature", file: signature });
    const deferredWindows = target === "windows-x86_64";
    const evidence = createEvidence({ candidate: identity, target, phase: "signed", artifacts, trust: {
      updater: { result: "passed", publicIdentity: "test-key" },
      operatingSystem: target === "linux-x86_64"
        ? { result: "not_applicable" }
        : deferredWindows
          ? { result: "not_checked", reason: "authenticode_deferred", publicIdentity: null }
          : { result: "passed", publicIdentity: "test-os" },
      notarization: { result: target.startsWith("darwin-") ? "passed" : "not_applicable" },
    } });
    fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(root, "matrix.json"), `${JSON.stringify({ schemaVersion: 1, source: identity.source, release: identity.release, targets: identity.matrix.requiredTargets, result: "passed", publicPromotionAllowed: false }, null, 2)}\n`);
  return root;
}

test("every publication carries a fixed publication date and no draft-only mode exists", () => {
  const root = signedMatrix("0.2.0-preview.9");
  expectCode("publication_date_invalid", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(false), mode: "preview-testing" }));
  expectCode("invalid_mode", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(false), mode: "validation-draft", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("production is denied while every enabled target remains qualification_required", () => {
  const root = signedMatrix("0.2.0");
  expectCode("production_not_approved", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(false), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
  const partial = qualification(true);
  const linuxIndex = partial.targets.findIndex(({ key }) => key === "linux-x86_64");
  partial.targets[linuxIndex] = { key: "linux-x86_64", status: "qualification_required", evidence: [] };
  expectCode("qualification_required", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: partial, mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("preview-testing publishes only a Tauri-signed prerelease without claiming qualification", () => {
  const root = signedMatrix("0.2.0-preview.9");
  const plan = preparePublication({
    signedDirectory: root,
    notesMarkdown: "# Public preview test\n\nWindows and Linux remain unqualified testing downloads.",
    qualification: qualification(false),
    mode: "preview-testing",
    publishedAt: "2026-09-11T12:00:00Z",
  });
  assert.equal(plan.release.channel, "preview");
  assert.equal(plan.release.githubPrerelease, true);
  assert.equal(plan.qualification.productionAllowed, false);
  assert.equal(plan.qualification.previewTestingAllowed, true);
  assert.deepEqual(plan.qualification.qualifiedTargets, []);
  assert.deepEqual(Object.keys(plan.manifest.platforms), ["windows-x86_64", "linux-x86_64"]);
  assert.equal(plan.manifest.pub_date, "2026-09-11T12:00:00Z");
  assert.match(plan.notesMarkdown, /does not claim platform qualification/);
  assert.match(plan.manifest.notes, /does not claim platform qualification/);
  const feeds = feedsForPromotion(plan, { stable: { version: "0.1.0" } });
  assert.deepEqual(Object.keys(feeds), ["preview"]);
  assert.equal(typeof feeds.preview, "string");
  expectCode("feed_regression", () => feedsForPromotion(plan, { preview: { version: "0.2.0-preview.10" } }));
});

test("preview-testing rejects stable and macOS candidates", () => {
  const options = { notesMarkdown: "Testing", qualification: qualification(false), mode: "preview-testing", publishedAt: "2026-09-11T12:00:00Z" };
  expectCode("profile_mismatch", () => preparePublication({ signedDirectory: signedMatrix("0.2.0"), ...options }));
  const advertisedMac = qualification(false);
  const macIndex = advertisedMac.releaseMatrix.disabledTargets.findIndex(({ key }) => key === "darwin-aarch64");
  advertisedMac.releaseMatrix.disabledTargets[macIndex] = { key: "darwin-aarch64", status: "qualified", evidence: [{}] };
  expectCode("qualification_invalid", () => preparePublication({ signedDirectory: signedMatrix("0.2.0-preview.9"), ...options, qualification: advertisedMac }));
});

test("qualification evidence is bound to real consecutive public previews, not to versions in code", () => {
  for (const pair of [PAIR, { from: "0.3.0-preview.1", to: "0.3.0-preview.2" }, { from: "0.2.0-preview.9", to: "0.2.0-preview.12" }]) {
    const registry = qualification(true, pair);
    for (const target of REQUIRED_TARGETS) {
      assert.equal(validateTargetEvidence(registry.targets.find(({ key }) => key === target), target), KEY_ID, `${pair.from} -> ${pair.to} ${target}`);
    }
  }
  for (const pair of [
    { from: "0.2.0-preview.10", to: "0.2.0-preview.9" },
    { from: "0.2.0-preview.9", to: "0.2.0-preview.9" },
    { from: "0.2.0-preview.9", to: "0.2.0" },
    { from: "0.2.0", to: "0.2.1" },
    { from: "0.2.0-alpha.1", to: "0.2.0-preview.2" },
  ]) {
    const registry = qualification(true, pair);
    assert.equal(validateTargetEvidence(registry.targets[0], "windows-x86_64"), null, `${pair.from} -> ${pair.to}`);
  }
  const retired = qualification(true);
  retired.validationQualification = { status: "pending" };
  expectCode("qualification_invalid", () => preparePublication({ signedDirectory: signedMatrix("0.2.0"), notesMarkdown: "Notes", qualification: retired, mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
  const oldSchema = qualification(true);
  oldSchema.schemaVersion = 3;
  expectCode("qualification_invalid", () => preparePublication({ signedDirectory: signedMatrix("0.2.0"), notesMarkdown: "Notes", qualification: oldSchema, mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("production rejects shallow, cross-target, wrong-key, off-repository and incomplete qualification claims", () => {
  const root = signedMatrix("0.2.0");
  const production = (registry) => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: registry, mode: "production", publishedAt: "2026-09-11T12:00:00Z" });
  const shallow = qualification(true);
  shallow.targets[0].evidence = [{
    version: "0.2.0-preview.9",
    installedVersion: "0.2.0-preview.10",
    result: "passed",
    observedAt: "2026-09-11T12:00:00Z",
    installationMode: "windows_nsis_per_user",
    signedMatrixSha256: "1".repeat(64),
    runUrl: "https://github.com/martinezelx/gitodile-desktop/actions/runs/1",
  }];
  expectCode("qualification_required", () => production(shallow));

  const crossTarget = qualification(true);
  const linuxIndex = crossTarget.targets.findIndex(({ key }) => key === "linux-x86_64");
  crossTarget.targets[linuxIndex].evidence[0].target = "windows-x86_64";
  expectCode("qualification_required", () => production(crossTarget));

  const mixedKey = qualification(true);
  mixedKey.targets[0].evidence[0].builds.to.updaterSignature.publicKeyId = "unexpected-key";
  expectCode("qualification_required", () => production(mixedKey));

  const unapprovedKey = qualification(true);
  unapprovedKey.productionPromotion.evidence.updaterPublicKeyId = "another-key";
  expectCode("qualification_invalid", () => production(unapprovedKey));

  const foreignAsset = qualification(true);
  foreignAsset.targets[0].evidence[0].builds.to.updaterArtifact.anonymousUrl = "https://evil.invalid/GitOdile.exe";
  expectCode("qualification_required", () => production(foreignAsset));

  const foreignRelease = qualification(true);
  foreignRelease.targets[0].evidence[0].builds.from.publicReleaseUrl = "https://github.com/martinezelx/gitodile-desktop/releases/tag/v0.2.0-preview.9";
  expectCode("qualification_required", () => production(foreignRelease));

  const wrongFeed = qualification(true);
  wrongFeed.targets[linuxIndex].evidence[0].feed.url = "https://raw.githubusercontent.com/martinezelx/gitodile/main/updates/stable.json";
  expectCode("qualification_required", () => production(wrongFeed));

  const incompleteFailureMatrix = qualification(true);
  incompleteFailureMatrix.targets[linuxIndex].evidence[0].failureCases.pop();
  expectCode("qualification_required", () => production(incompleteFailureMatrix));

  const incompletePublisher = qualification(true);
  delete incompletePublisher.productionPromotion.evidence.publisher.anonymousDownloads;
  expectCode("production_not_approved", () => production(incompletePublisher));

  const advertisedMac = qualification(true);
  const macIndex = advertisedMac.targets.findIndex(({ key }) => key === "darwin-aarch64");
  advertisedMac.targets[macIndex] = { key: "darwin-aarch64", status: "qualified", evidence: [{}] };
  expectCode("qualification_invalid", () => production(advertisedMac));
});

test("a complete qualified Windows and Linux matrix creates version-specific manifest entries", () => {
  const root = signedMatrix("0.2.0");
  const plan = preparePublication({ signedDirectory: root, notesMarkdown: "# Safer updates\n\nAll enabled targets.", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" });
  assert.equal(plan.release.githubPrerelease, false);
  assert.deepEqual(plan.qualification.qualifiedTargets, [...REQUIRED_TARGETS]);
  assert.deepEqual(Object.keys(plan.manifest.platforms), REQUIRED_TARGETS);
  assert.ok(Object.values(plan.manifest.platforms).every((entry) => entry.url.includes("/v0.2.0/")));
  assert.equal(plan.manifest.notes, "Safer updates All enabled targets.");
});

test("mixed provenance, incomplete matrices and tampered bytes fail closed", () => {
  const root = signedMatrix("0.2.0");
  const evidencePath = path.join(root, "windows-x86_64", "evidence.json");
  const evidence = JSON.parse(fs.readFileSync(evidencePath));
  evidence.source.sha = "b".repeat(40);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  expectCode("provenance_mismatch", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));

  const incomplete = signedMatrix("0.2.0");
  fs.rmSync(path.join(incomplete, "linux-x86_64"), { recursive: true });
  expectCode("matrix_incomplete", () => preparePublication({ signedDirectory: incomplete, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));

  const tampered = signedMatrix("0.2.0");
  fs.appendFileSync(path.join(tampered, "windows-x86_64", "GitOdile_0.2.0_setup.exe"), "tampered");
  expectCode("hash_mismatch", () => preparePublication({ signedDirectory: tampered, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("feed promotion follows preview/stable ordering without regression or relabeling", () => {
  const previewRoot = signedMatrix("0.2.0-preview.9");
  const preview = preparePublication({ signedDirectory: previewRoot, notesMarkdown: "Preview", qualification: qualification(false), mode: "preview-testing", publishedAt: "2026-09-11T12:00:00Z" });
  assert.deepEqual(Object.keys(feedsForPromotion(preview, {})), ["preview"]);
  expectCode("feed_regression", () => feedsForPromotion(preview, { preview: { version: "0.2.0-preview.10" } }));

  const stableRoot = signedMatrix("0.2.0");
  const stable = preparePublication({ signedDirectory: stableRoot, notesMarkdown: "Stable", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T13:00:00Z" });
  const updates = feedsForPromotion(stable, { preview: preview.manifest });
  assert.equal(typeof updates.stable, "string");
  assert.equal(typeof updates.preview, "string");
  assert.equal(compareReleaseVersions("0.2.0", "0.2.0-preview.9"), 1);
});

test("immutable assets reconcile missing draft files but never overwrite or repair finalized releases", () => {
  const expected = [{ fileName: "GitOdile.exe", size: 4, sha256: "a".repeat(64) }];
  assert.deepEqual(reconcileAssets(expected, [], new Map(), false), expected);
  expectCode("finalized_asset_missing", () => reconcileAssets(expected, [], new Map(), true));
  expectCode("immutable_asset_conflict", () => reconcileAssets(expected, [{ name: "GitOdile.exe", size: 4 }], new Map([["GitOdile.exe", "b".repeat(64)]]), false));
  expectCode("asset_conflict", () => reconcileAssets(expected, [{ name: "private-source.zip", size: 1 }], new Map(), false));
});

test("anonymous verification accepts exact bytes and rejects unavailable or changed downloads", async () => {
  const bytes = Buffer.from("verified release bytes");
  const hash = await anonymousHash("https://example.invalid/asset", async () => new Response(bytes, { status: 200 }));
  assert.equal(hash, (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex"));
  await assert.rejects(
    anonymousHash("https://example.invalid/asset", async () => new Response("no", { status: 503 })),
    (error) => error instanceof ReleaseValidationError && error.code === "anonymous_download_failed",
  );
  expectCode("immutable_asset_conflict", () => reconcileAssets(
    [{ fileName: "asset", size: bytes.length, sha256: "a".repeat(64) }],
    [{ name: "asset", size: bytes.length }], new Map([["asset", hash]]), true,
  ));
});

test("feed publication uses one non-forced compare-and-swap ref update", async () => {
  const calls = [];
  const client = { api: async (endpoint, options = {}) => {
    calls.push({ endpoint, options });
    if (endpoint.startsWith("/git/commits/") && options.method === undefined) return { tree: { sha: "base-tree" } };
    if (endpoint === "/git/blobs") return { sha: `blob-${calls.length}` };
    if (endpoint === "/git/trees") return { sha: "next-tree" };
    if (endpoint === "/git/commits") return { sha: "next-commit" };
    if (endpoint === "/git/refs/heads/main") throw new ReleaseValidationError("github_api", "HTTP 422 non-fast-forward");
    throw new Error(`unexpected endpoint ${endpoint}`);
  } };
  await assert.rejects(
    atomicPublicCommit(client, "base-commit", { "updates/preview.json": "{}\n", "README.md": "# Feedback\n" }, "release"),
    (error) => error instanceof ReleaseValidationError && error.code === "github_api",
  );
  const update = calls.at(-1);
  assert.equal(update.endpoint, "/git/refs/heads/main");
  assert.deepEqual(JSON.parse(update.options.body), { sha: "next-commit", force: false });
  assert.equal(calls.filter((call) => call.endpoint === "/git/commits").length, 1);
});

test("source workflow and public README contracts reject unsafe provenance and update guidance idempotently", () => {
  // Shape observed from GET /actions/runs/34905088346: with `run-name` set,
  // the API reports the per-run title in `name`, not the workflow name.
  const run = {
    id: 34905088346,
    name: "Release v0.2.0-preview.10 at 977aa58bd3fac28cfcdfa3826ad7074188f9cac5",
    event: "workflow_dispatch",
    status: "in_progress",
    conclusion: null,
    path: ".github/workflows/release-pipeline.yml",
    head_branch: "main",
    repository: { full_name: "martinezelx/gitodile-desktop" },
  };
  assert.equal(validateSourceRun(run, "martinezelx/gitodile-desktop"), true);
  assert.equal(validateSourceRun({ ...run, name: "Release v0.2.0 at 977aa58bd3fac28cfcdfa3826ad7074188f9cac5" }, "martinezelx/gitodile-desktop"), true);
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, name: "Release pipeline" }, "martinezelx/gitodile-desktop"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, name: "Release v0.2.0-alpha.1 at 977aa58bd3fac28cfcdfa3826ad7074188f9cac5" }, "martinezelx/gitodile-desktop"));
  assert.equal(validateSourceRun({ ...run, status: "completed", conclusion: "success" }, "martinezelx/gitodile-desktop"), true);
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, status: "completed", conclusion: "failure" }, "martinezelx/gitodile-desktop"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, status: "completed", conclusion: null }, "martinezelx/gitodile-desktop"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, event: "workflow_run" }, "martinezelx/gitodile-desktop"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, head_branch: "release/0.2.0-preview.9" }, "martinezelx/gitodile-desktop"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, path: ".github/workflows/ci.yml" }, "martinezelx/gitodile-desktop"));
  const first = updateFeedbackReadme("# GitOdile — feedback\n\nThere is no source code here, and there are no pull requests to send. Issues,\n\nEl código de la aplicación es privado. Este repositorio no contiene código de\nla aplicación ni descargas.\n");
  assert.match(first, /Tauri updater-signed Windows x86-64/);
  assert.match(first, /intentionally lack Authenticode/);
  assert.match(first, /prerelease label is not a qualification claim/);
  assert.match(first, /macOS is not yet qualified/);
  assert.equal(updateFeedbackReadme(first), first);
});

test("publication is the final job of the single release pipeline, derives its mode, and keeps destination credentials out of staging", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const source = fs.readFileSync(path.join(root, ".github", "workflows", "release-pipeline.yml"), "utf8");
  const workflow = yaml.load(source, { schema: yaml.JSON_SCHEMA });
  // No separate publication trigger exists: the mode is derived from the
  // signed matrix, never chosen through a dispatch input.
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ["authorization_run_id", "tag", "sha"]);
  assert.equal(workflow.jobs.publish.concurrency.group, "gitodile-publication");
  assert.equal(workflow.jobs.publish.concurrency["cancel-in-progress"], false);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.stage), /GITODILE_PUBLIC_RELEASE_TOKEN|contents.:.write/);
  assert.equal(workflow.jobs.publish.steps.some((step) => step.uses?.startsWith("actions/checkout@")), false);
  assert.match(JSON.stringify(workflow.jobs.publish), /GITODILE_PUBLIC_RELEASE_TOKEN/);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.publish), /GITHUB_TOKEN|github\.token|source-run-id/);
  assert.match(source, /validated-source-run\.json/);
  assert.match(source, /qualification-evidence\.mjs/);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.stage), /check:publication|libwebkit2gtk/,
    "staging checks the live destination contract only; the repository gate ran on the merge SHA");
  assert.match(JSON.stringify(workflow.jobs.stage), /check-public-feedback\.mjs --publication-plan/);
  assert.match(source, /"preview-testing" : "production"/);
  assert.doesNotMatch(source, /validation-draft|validation-updater-signing|VALIDATION/,
    "no test-only publication mode, signing environment or feed routing may remain");
  assert.equal(workflow.jobs.publish.environment,
    "${{ needs.stage.outputs.mode == 'preview-testing' && 'public-release-preview' || 'public-release-stable' }}");
  for (const match of source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) assert.match(match[1], /@[0-9a-f]{40}$/);
});
