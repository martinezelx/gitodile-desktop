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
  QUALIFICATION_PAIR,
  REQUIRED_TARGETS,
  TARGET_CONTRACTS,
  ReleaseValidationError,
  parseReleaseVersion,
} from "./release-candidate.mjs";
import { REQUIRED_FAILURE_CASES, REQUIRED_PRESERVATION_CHECKS } from "./qualification-evidence.mjs";
import { compareReleaseVersions, feedsForPromotion, preparePublication, updateFeedbackReadme } from "./public-release.mjs";
import { anonymousHash, atomicPublicCommit, reconcileAssets, validateSourceRun } from "./github-publication.mjs";
import { prepareQualificationBundle } from "./qualification-bundle.mjs";

function expectCode(code, callback) {
  assert.throws(callback, (error) => error instanceof ReleaseValidationError && error.code === code);
}

function candidate(version) {
  const release = parseReleaseVersion(version);
  const validation = QUALIFICATION_PAIR.includes(version);
  return {
    schemaVersion: 1,
    source: { tag: `v${version}`, sha: "a".repeat(40), approvedMainRef: "refs/remotes/origin/main" },
    release: { ...release, purpose: validation ? "qualification" : "release_candidate", signingProfile: validation ? "validation" : "production", publicPromotionAllowed: false },
    matrix: { requiredTargets: [...REQUIRED_TARGETS], targets: REQUIRED_TARGETS.map((key) => ({ key, rustTarget: TARGET_CONTRACTS[key].rustTarget })) },
  };
}

function qualification(enabled = false) {
  const hash = (index, length) => ((index % 15) + 1).toString(16).repeat(length);
  const buildProof = (key, version, index) => ({
    version,
    tag: `v${version}`,
    sourceSha: hash(index, 40),
    signedMatrixSha256: hash(index + 2, 64),
    buildRunUrl: `https://github.com/martinezelx/project-gitodile/actions/runs/${index + 10}`,
    signingRunUrl: `https://github.com/martinezelx/project-gitodile/actions/runs/${index + 20}`,
    installerArtifact: { fileName: `GitOdile-${key}-${version}-installer`, size: 1024, sha256: hash(index + 4, 64) },
    updaterArtifact: { fileName: `GitOdile-${key}-${version}-updater`, size: 2048, sha256: hash(index + 6, 64) },
    updaterSignature: { result: "passed", publicKeyId: "validation-key-1" },
    operatingSystemTrust: key === "linux-x86_64" ? { result: "not_applicable" } : { result: "passed", publicIdentity: "test-os-identity" },
    notarization: key.startsWith("darwin-") ? { result: "passed" } : { result: "not_applicable" },
  });
  return {
    schemaVersion: 3,
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
    validationQualification: enabled ? {
      status: "qualified",
      signingProfile: "validation",
      fromVersion: "0.2.0-preview.4",
      toVersion: "0.2.0-preview.5",
      evidence: {
        schemaVersion: 1,
        controlledBundleRunUrl: "https://github.com/martinezelx/project-gitodile/actions/runs/98",
        bundleReportSha256: "8".repeat(64),
        updaterPublicKeyId: "validation-key-1",
      },
    } : {
      status: "pending",
      signingProfile: "validation",
      fromVersion: "0.2.0-preview.4",
      toVersion: "0.2.0-preview.5",
      evidence: null,
    },
    publicPreviewQualification: {
      status: "pending",
      signingProfile: "production",
      fromVersion: "0.2.0-preview.6",
      toVersion: "0.2.0-preview.7",
      productionUpdaterPublicKeyId: null,
      releases: [],
      feed: null,
      targets: [],
    },
    productionPromotion: enabled ? {
      enabled: true,
      workingNameClearance: "evidenced",
      approvedAt: "2026-09-11T12:00:00Z",
      evidence: {
        schemaVersion: 1,
        workingNameClearance: { result: "passed", reviewedAt: "2026-09-11T11:00:00Z", referenceUrl: "https://example.com/clearance/065-9-7" },
        publisher: {
          result: "passed",
          qualificationRunUrl: "https://github.com/martinezelx/project-gitodile/actions/runs/99",
          reportSha256: "9".repeat(64),
          validationDraft: "passed",
          fullMatrixFailure: "passed",
          retry: "passed",
          immutableAssets: "passed",
          feedUnchanged: "passed",
        },
      },
    } : { enabled: false, workingNameClearance: "not_evidenced", approvedAt: null, evidence: null },
    targets: ALL_TARGETS.map((key, targetIndex) => ({
      key,
      status: REQUIRED_TARGETS.includes(key)
        ? (enabled ? "qualified" : "qualification_required")
        : "planned_disabled",
      evidence: enabled && REQUIRED_TARGETS.includes(key) ? [{
        schemaVersion: 1,
        target: key,
        result: "passed",
        observedAt: `2026-09-${String(targetIndex + 11).padStart(2, "0")}T12:00:00Z`,
        qualificationRunUrl: `https://github.com/martinezelx/project-gitodile/actions/runs/${targetIndex + 100}`,
        reportSha256: String(targetIndex + 1).repeat(64),
        environment: {
          os: key === "windows-x86_64" ? "windows" : key === "linux-x86_64" ? "linux" : "macos",
          osVersion: "test-os-version",
          architecture: key.endsWith("aarch64") ? "aarch64" : "x86_64",
          installationMode: TARGET_CONTRACTS[key].installation,
        },
        transition: {
          fromVersion: "0.2.0-preview.4",
          toVersion: "0.2.0-preview.5",
          runningVersionBefore: "0.2.0-preview.4",
          runningVersionAfter: "0.2.0-preview.5",
          result: "passed",
          falseSuccessObserved: false,
          forcedDowngradeObserved: false,
        },
        builds: {
          from: buildProof(key, "0.2.0-preview.4", targetIndex * 2),
          to: buildProof(key, "0.2.0-preview.5", targetIndex * 2 + 1),
        },
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
    const validationWindows = identity.release.signingProfile === "validation" && target === "windows-x86_64";
    const evidence = createEvidence({ candidate: identity, target, phase: "signed", artifacts, trust: {
      updater: { result: "passed", publicIdentity: "test-key" },
      operatingSystem: target === "linux-x86_64"
        ? { result: "not_applicable" }
        : validationWindows
          ? { result: "not_checked", reason: "authenticode_deferred", publicIdentity: null }
          : { result: "passed", publicIdentity: "test-os" },
      notarization: { result: target.startsWith("darwin-") ? "passed" : "not_applicable" },
    } });
    fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(root, "matrix.json"), `${JSON.stringify({ schemaVersion: 1, source: identity.source, release: identity.release, targets: identity.matrix.requiredTargets, result: "passed", publicPromotionAllowed: false }, null, 2)}\n`);
  return root;
}

test("a validation-signed qualification pair can only prepare a non-promoting draft", () => {
  const root = signedMatrix("0.2.0-preview.4");
  const plan = preparePublication({ signedDirectory: root, notesMarkdown: "# Controlled validation", qualification: qualification(false), mode: "validation-draft" });
  assert.equal(plan.qualification.productionAllowed, false);
  assert.equal(plan.manifest.pub_date, null);
  expectCode("profile_mismatch", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("production is denied while every enabled target remains qualification_required", () => {
  const root = signedMatrix("0.2.0-preview.6");
  expectCode("qualification_required", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(false), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
  const partial = qualification(true);
  const linuxIndex = partial.targets.findIndex(({ key }) => key === "linux-x86_64");
  partial.targets[linuxIndex] = { key: "linux-x86_64", status: "qualification_required", evidence: [] };
  expectCode("qualification_required", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: partial, mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("the controlled qualification bundle binds real A/B matrices without production promotion", () => {
  const from = signedMatrix("0.2.0-preview.4");
  const to = signedMatrix("0.2.0-preview.5");
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gitodile-qualification-")), "bundle");
  const report = prepareQualificationBundle({
    fromDirectory: from,
    toDirectory: to,
    validationFeed: "https://validation.example/gitodile-validation/065-9-7/updates/preview.json",
    output,
  });
  assert.equal(report.publicPromotionAllowed, false);
  assert.equal(report.pair.from.version, "0.2.0-preview.4");
  assert.equal(report.pair.to.version, "0.2.0-preview.5");
  const manifest = JSON.parse(fs.readFileSync(path.join(output, "updates", "preview.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.platforms), REQUIRED_TARGETS);
  assert.ok(Object.values(manifest.platforms).every(({ url }) => url.startsWith("https://validation.example/gitodile-validation/065-9-7/releases/v0.2.0-preview.5/")));
  assert.equal(fs.existsSync(path.join(output, "packages", "v0.2.0-preview.4")), true);
  assert.equal(fs.existsSync(path.join(output, "packages", "v0.2.0-preview.5")), true);

  const inconsistent = signedMatrix("0.2.0-preview.5");
  const linuxEvidencePath = path.join(inconsistent, "linux-x86_64", "evidence.json");
  const linuxEvidence = JSON.parse(fs.readFileSync(linuxEvidencePath, "utf8"));
  linuxEvidence.trust.updater.publicIdentity = "different-validation-key";
  fs.writeFileSync(linuxEvidencePath, `${JSON.stringify(linuxEvidence, null, 2)}\n`);
  expectCode("provenance_mismatch", () => prepareQualificationBundle({
    fromDirectory: from,
    toDirectory: inconsistent,
    validationFeed: "https://validation.example/gitodile-validation/065-9-7/updates/preview.json",
    output: `${output}-mixed-key`,
  }));

  expectCode("validation_feed_invalid", () => prepareQualificationBundle({
    fromDirectory: from,
    toDirectory: to,
    validationFeed: "https://validation.example/other/feed.json?token=secret",
    output: `${output}-invalid`,
  }));
});

test("production rejects shallow, cross-target and incomplete qualification claims", () => {
  const root = signedMatrix("0.2.0-preview.6");
  const shallow = qualification(true);
  shallow.targets[0].evidence = [{
    version: "0.2.0-preview.2",
    installedVersion: "0.2.0-preview.2",
    result: "passed",
    observedAt: "2026-09-11T12:00:00Z",
    installationMode: "windows_nsis_per_user",
    signedMatrixSha256: "1".repeat(64),
    runUrl: "https://github.com/martinezelx/project-gitodile/actions/runs/1",
  }];
  expectCode("qualification_required", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: shallow, mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));

  const crossTarget = qualification(true);
  const linuxIndex = crossTarget.targets.findIndex(({ key }) => key === "linux-x86_64");
  crossTarget.targets[linuxIndex].evidence[0].target = "windows-x86_64";
  expectCode("qualification_required", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: crossTarget, mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));

  const wrongValidationKey = qualification(true);
  wrongValidationKey.targets[0].evidence[0].builds.to.updaterSignature.publicKeyId = "unexpected-key";
  expectCode("qualification_required", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: wrongValidationKey, mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));

  const incompleteFailureMatrix = qualification(true);
  incompleteFailureMatrix.targets[linuxIndex].evidence[0].failureCases.pop();
  expectCode("qualification_required", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: incompleteFailureMatrix, mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));

  const advertisedMac = qualification(true);
  const macIndex = advertisedMac.targets.findIndex(({ key }) => key === "darwin-aarch64");
  advertisedMac.targets[macIndex] = { key: "darwin-aarch64", status: "qualified", evidence: [{}] };
  expectCode("qualification_invalid", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: advertisedMac, mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("a complete qualified Windows and Linux matrix creates version-specific manifest entries", () => {
  const root = signedMatrix("0.2.0-preview.6");
  const plan = preparePublication({ signedDirectory: root, notesMarkdown: "# Safer updates\n\nAll enabled targets.", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" });
  assert.equal(plan.release.githubPrerelease, true);
  assert.deepEqual(Object.keys(plan.manifest.platforms), REQUIRED_TARGETS);
  assert.ok(Object.values(plan.manifest.platforms).every((entry) => entry.url.includes("/v0.2.0-preview.6/")));
  assert.equal(plan.manifest.notes, "Safer updates All enabled targets.");
});

test("mixed provenance, incomplete matrices and tampered bytes fail closed", () => {
  const root = signedMatrix("0.2.0-preview.6");
  const evidencePath = path.join(root, "windows-x86_64", "evidence.json");
  const evidence = JSON.parse(fs.readFileSync(evidencePath));
  evidence.source.sha = "b".repeat(40);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  expectCode("provenance_mismatch", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));

  const incomplete = signedMatrix("0.2.0-preview.6");
  fs.rmSync(path.join(incomplete, "linux-x86_64"), { recursive: true });
  expectCode("matrix_incomplete", () => preparePublication({ signedDirectory: incomplete, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));

  const tampered = signedMatrix("0.2.0-preview.6");
  fs.appendFileSync(path.join(tampered, "windows-x86_64", "GitOdile_0.2.0-preview.6_setup.exe"), "tampered");
  expectCode("hash_mismatch", () => preparePublication({ signedDirectory: tampered, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("feed promotion follows preview/stable ordering without regression or relabeling", () => {
  const previewRoot = signedMatrix("0.2.0-preview.6");
  const preview = preparePublication({ signedDirectory: previewRoot, notesMarkdown: "Preview", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" });
  assert.deepEqual(Object.keys(feedsForPromotion(preview, {})), ["preview"]);
  expectCode("feed_regression", () => feedsForPromotion(preview, { preview: { version: "0.2.0-preview.7" } }));

  const stableRoot = signedMatrix("0.2.0");
  const stable = preparePublication({ signedDirectory: stableRoot, notesMarkdown: "Stable", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T13:00:00Z" });
  const updates = feedsForPromotion(stable, { preview: preview.manifest });
  assert.equal(typeof updates.stable, "string");
  assert.equal(typeof updates.preview, "string");
  assert.equal(compareReleaseVersions("0.2.0", "0.2.0-preview.6"), 1);
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
  const run = {
    id: 42,
    name: "Private candidate signing",
    event: "workflow_run",
    conclusion: "success",
    path: ".github/workflows/private-candidate-signing.yml",
    head_branch: "main",
    repository: { full_name: "martinezelx/project-gitodile" },
  };
  assert.equal(validateSourceRun(run, "martinezelx/project-gitodile"), true);
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, conclusion: "failure" }, "martinezelx/project-gitodile"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, path: ".github/workflows/ci.yml" }, "martinezelx/project-gitodile"));
  const first = updateFeedbackReadme("# GitOdile — feedback\n\nThere is no source code here, and there are no pull requests to send. Issues,\n\nEl código de la aplicación es privado. Este repositorio no contiene código de\nla aplicación ni descargas.\n");
  assert.match(first, /Signed Windows x86-64/);
  assert.match(first, /macOS is not yet qualified/);
  assert.equal(updateFeedbackReadme(first), first);
});

test("the publication workflow is manual, serialized, pinned and keeps destination credentials out of staging", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const source = fs.readFileSync(path.join(root, ".github", "workflows", "public-release-publishing.yml"), "utf8");
  const workflow = yaml.load(source, { schema: yaml.JSON_SCHEMA });
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.concurrency.group, "gitodile-feedback-publication");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.doesNotMatch(JSON.stringify(workflow.jobs["authorize-and-stage"]), /GITODILE_PUBLIC_RELEASE_TOKEN|contents.:.write/);
  assert.equal(workflow.jobs.publish.steps.some((step) => step.uses?.startsWith("actions/checkout@")), false);
  assert.match(JSON.stringify(workflow.jobs.publish), /GITODILE_PUBLIC_RELEASE_TOKEN/);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.publish), /GITHUB_TOKEN|github\.token|source-run-id/);
  assert.match(source, /validated-source-run\.json/);
  assert.match(source, /qualification-evidence\.mjs/);
  for (const match of source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) assert.match(match[1], /@[0-9a-f]{40}$/);
});
