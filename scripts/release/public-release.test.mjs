import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { createEvidence } from "./release-evidence.mjs";
import { REQUIRED_TARGETS, TARGET_CONTRACTS, ReleaseValidationError, parseReleaseVersion } from "./release-candidate.mjs";
import { compareReleaseVersions, feedsForPromotion, preparePublication, updateFeedbackReadme } from "./public-release.mjs";
import { anonymousHash, atomicPublicCommit, reconcileAssets, validateSourceRun } from "./github-publication.mjs";

function expectCode(code, callback) {
  assert.throws(callback, (error) => error instanceof ReleaseValidationError && error.code === code);
}

function candidate(version) {
  const release = parseReleaseVersion(version);
  const validation = ["0.2.0-preview.2", "0.2.0-preview.3"].includes(version);
  return {
    schemaVersion: 1,
    source: { tag: `v${version}`, sha: "a".repeat(40), approvedMainRef: "refs/remotes/origin/main" },
    release: { ...release, purpose: validation ? "qualification" : "release_candidate", signingProfile: validation ? "validation" : "production", publicPromotionAllowed: false },
    matrix: { requiredTargets: [...REQUIRED_TARGETS], targets: REQUIRED_TARGETS.map((key) => ({ key, rustTarget: TARGET_CONTRACTS[key].rustTarget })) },
  };
}

function qualification(enabled = false) {
  return {
    schemaVersion: 1,
    productionPromotion: { enabled, workingNameClearance: enabled ? "evidenced" : "not_evidenced", approvedAt: enabled ? "2026-09-11T12:00:00Z" : null, evidence: enabled ? "approval/065-9-7" : null },
    targets: REQUIRED_TARGETS.map((key) => ({ key, status: enabled ? "qualified" : "qualification_required", evidence: enabled ? ["0.2.0-preview.2", "0.2.0-preview.3"].map((version, index) => ({
      version, installedVersion: version, result: "passed", observedAt: `2026-09-1${index}T12:00:00Z`, installationMode: TARGET_CONTRACTS[key].installation,
      signedMatrixSha256: String(index + 1).repeat(64), runUrl: `https://github.com/martinezelx/project-gitodile/actions/runs/${index + 1}`,
    })) : [] })),
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
    const evidence = createEvidence({ candidate: identity, target, phase: "signed", artifacts, trust: {
      updater: { result: "passed", publicIdentity: "test-key" },
      operatingSystem: { result: target === "linux-x86_64" ? "not_applicable" : "passed", publicIdentity: target === "linux-x86_64" ? undefined : "test-os" },
      notarization: { result: target.startsWith("darwin-") ? "passed" : "not_applicable" },
    } });
    fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(root, "matrix.json"), `${JSON.stringify({ schemaVersion: 1, source: identity.source, release: identity.release, targets: identity.matrix.requiredTargets, result: "passed", publicPromotionAllowed: false }, null, 2)}\n`);
  return root;
}

test("a validation-signed qualification pair can only prepare a non-promoting draft", () => {
  const root = signedMatrix("0.2.0-preview.2");
  const plan = preparePublication({ signedDirectory: root, notesMarkdown: "# Controlled validation", qualification: qualification(false), mode: "validation-draft" });
  assert.equal(plan.qualification.productionAllowed, false);
  assert.equal(plan.manifest.pub_date, null);
  expectCode("profile_mismatch", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("production is denied while every target remains qualification_required", () => {
  const root = signedMatrix("0.2.0-preview.4");
  expectCode("production_not_approved", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(false), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
  const partial = qualification(true);
  partial.targets[2] = { key: partial.targets[2].key, status: "qualification_required", evidence: [] };
  expectCode("qualification_required", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: partial, mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("a complete qualified production matrix creates version-specific manifest entries", () => {
  const root = signedMatrix("0.2.0-preview.4");
  const plan = preparePublication({ signedDirectory: root, notesMarkdown: "# Safer updates\n\nAll targets.", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" });
  assert.equal(plan.release.githubPrerelease, true);
  assert.deepEqual(Object.keys(plan.manifest.platforms), REQUIRED_TARGETS);
  assert.ok(Object.values(plan.manifest.platforms).every((entry) => entry.url.includes("/v0.2.0-preview.4/")));
  assert.equal(plan.manifest.notes, "Safer updates All targets.");
});

test("mixed provenance, incomplete matrices and tampered bytes fail closed", () => {
  const root = signedMatrix("0.2.0-preview.4");
  const evidencePath = path.join(root, "darwin-aarch64", "evidence.json");
  const evidence = JSON.parse(fs.readFileSync(evidencePath));
  evidence.source.sha = "b".repeat(40);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  expectCode("provenance_mismatch", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));

  const incomplete = signedMatrix("0.2.0-preview.4");
  fs.rmSync(path.join(incomplete, "linux-x86_64"), { recursive: true });
  expectCode("matrix_incomplete", () => preparePublication({ signedDirectory: incomplete, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));

  const tampered = signedMatrix("0.2.0-preview.4");
  fs.appendFileSync(path.join(tampered, "windows-x86_64", "GitOdile_0.2.0-preview.4_setup.exe"), "tampered");
  expectCode("hash_mismatch", () => preparePublication({ signedDirectory: tampered, notesMarkdown: "Notes", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" }));
});

test("feed promotion follows preview/stable ordering without regression or relabeling", () => {
  const previewRoot = signedMatrix("0.2.0-preview.4");
  const preview = preparePublication({ signedDirectory: previewRoot, notesMarkdown: "Preview", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T12:00:00Z" });
  assert.deepEqual(Object.keys(feedsForPromotion(preview, {})), ["preview"]);
  expectCode("feed_regression", () => feedsForPromotion(preview, { preview: { version: "0.2.0-preview.5" } }));

  const stableRoot = signedMatrix("0.2.0");
  const stable = preparePublication({ signedDirectory: stableRoot, notesMarkdown: "Stable", qualification: qualification(true), mode: "production", publishedAt: "2026-09-11T13:00:00Z" });
  const updates = feedsForPromotion(stable, { preview: preview.manifest });
  assert.equal(typeof updates.stable, "string");
  assert.equal(typeof updates.preview, "string");
  assert.equal(compareReleaseVersions("0.2.0", "0.2.0-preview.4"), 1);
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
  const run = { name: "Private candidate signing", event: "workflow_run", conclusion: "success", repository: { full_name: "martinezelx/project-gitodile" } };
  assert.equal(validateSourceRun(run, "martinezelx/project-gitodile"), true);
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, conclusion: "failure" }, "martinezelx/project-gitodile"));
  const first = updateFeedbackReadme("# GitOdile — feedback\n\nThere is no source code here, and there are no pull requests to send. Issues,\n\nEl código de la aplicación es privado. Este repositorio no contiene código de\nla aplicación ni descargas.\n");
  assert.match(first, /Signed installers/);
  assert.equal(updateFeedbackReadme(first), first);
  assert.doesNotMatch(first, /project-gitodile/);
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
  for (const match of source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) assert.match(match[1], /@[0-9a-f]{40}$/);
});
