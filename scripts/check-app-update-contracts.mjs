import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePublicPreviewQualification } from "./release/qualification-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs", "architecture", "065-9-1-app-update-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const qualificationPath = path.join(root, "docs", "release", "update-target-qualifications.json");
const qualification = JSON.parse(fs.readFileSync(qualificationPath, "utf8"));

const stablePattern = new RegExp(contract.version.stablePattern);
const previewPattern = new RegExp(contract.version.previewPattern);

function parseVersion(value) {
  const stable = value.match(stablePattern);
  if (stable) {
    return {
      channel: "stable",
      core: stable.slice(1, 4).map(BigInt),
      preview: null,
    };
  }
  const preview = value.match(previewPattern);
  if (preview) {
    return {
      channel: "preview",
      core: preview.slice(1, 4).map(BigInt),
      preview: BigInt(preview[4]),
    };
  }
  return null;
}

function compareVersions(left, right) {
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] < right.core[index]) return -1;
    if (left.core[index] > right.core[index]) return 1;
  }
  if (left.preview === null && right.preview !== null) return 1;
  if (left.preview !== null && right.preview === null) return -1;
  if (left.preview === null) return 0;
  return left.preview < right.preview ? -1 : left.preview > right.preview ? 1 : 0;
}

function evaluateVersionCase(testCase) {
  const installed = parseVersion(testCase.installedVersion);
  const candidate = parseVersion(testCase.candidateVersion);
  if (!installed || !candidate) return "invalid_version";
  if (installed.channel !== testCase.installedChannel) return "channel_mismatch";
  if (testCase.feedChannel === "stable" && candidate.channel !== "stable") {
    return "channel_mismatch";
  }
  if (!testCase.targetPresent) return "target_unavailable";
  return compareVersions(candidate, installed) > 0 ? "available" : "current";
}

function evaluateMetadataCase(testCase) {
  const version = testCase.versions[0];
  const parsed = parseVersion(version);
  if (!parsed) return "invalid_version";
  const agrees =
    testCase.versions.length === contract.version.metadataFiles.length &&
    testCase.versions.every((candidate) => candidate === version) &&
    testCase.tag === `${contract.version.tagPrefix}${version}` &&
    testCase.feedVersion === version &&
    testCase.githubPrerelease === (parsed.channel === "preview");
  return agrees ? "valid" : "metadata_mismatch";
}

assert.deepEqual(contract.channels, ["stable", "preview"]);
assert.equal(new Set(contract.channels).size, 2);
assert.equal(contract.bounds.retainedCandidates, 1);
assert.equal(contract.bounds.artifactBytes, 256 * 1024 * 1024);
assert.deepEqual(
  contract.targets.filter((target) => target.releaseEnabled).map((target) => target.key),
  ["windows-x86_64", "linux-x86_64"],
);
assert.deepEqual(
  contract.targets.filter((target) => !target.releaseEnabled).map((target) => target.key),
  ["darwin-aarch64", "darwin-x86_64"],
);
assert.equal(
  contract.targets.every((target) =>
    target.automaticEligibility === (target.releaseEnabled ? "qualification_required" : "planned_disabled")
  ),
  true,
);
assert.equal(new Set(contract.targets.map((target) => target.key)).size, contract.targets.length);
assert.deepEqual(contract.validationBuilds, ["0.2.0-preview.2", "0.2.0-preview.3"]);
assert.equal(compareVersions(parseVersion(contract.validationBuilds[0]), parseVersion(contract.validationBuilds[1])), -1);
assert.equal(qualification.schemaVersion, 3);
const enabledTargets = contract.targets.filter((target) => target.releaseEnabled).map((target) => target.key);
const disabledTargets = contract.targets.filter((target) => !target.releaseEnabled).map((target) => target.key);
assert.deepEqual(qualification.releaseMatrix.enabledTargets, enabledTargets);
assert.deepEqual(qualification.releaseMatrix.disabledTargets.map((target) => target.key), disabledTargets);
assert.equal(qualification.releaseMatrix.disabledTargets.every((target) =>
  target.status === "planned_disabled" &&
  target.reason === "real_platform_qualification_required" &&
  target.followUpTask === "065-10" &&
  Array.isArray(target.evidence) && target.evidence.length === 0
), true, "disabled release targets need an explicit reason and follow-up owner");
assert.equal(qualification.validationQualification.signingProfile, "validation");
assert.equal(qualification.validationQualification.fromVersion, "0.2.0-preview.2");
assert.equal(qualification.validationQualification.toVersion, "0.2.0-preview.3");
assert.ok(["pending", "qualified"].includes(qualification.validationQualification.status));
if (qualification.validationQualification.status === "pending") {
  assert.equal(qualification.validationQualification.evidence, null,
    "pending validation qualification cannot contain inferred evidence");
} else {
  assert.equal(qualification.validationQualification.evidence?.schemaVersion, 1);
  assert.equal(typeof qualification.validationQualification.evidence?.updaterPublicKeyId, "string");
}
assert.equal(qualification.publicPreviewQualification.signingProfile, "production");
assert.equal(qualification.publicPreviewQualification.fromVersion, "0.2.0-preview.4");
assert.equal(qualification.publicPreviewQualification.toVersion, "0.2.0-preview.5");
assert.ok(["pending", "qualified"].includes(qualification.publicPreviewQualification.status));
assert.equal(validatePublicPreviewQualification(qualification.publicPreviewQualification), true);
if (qualification.publicPreviewQualification.status === "pending") {
  assert.deepEqual(qualification.publicPreviewQualification, {
    status: "pending",
    signingProfile: "production",
    fromVersion: "0.2.0-preview.4",
    toVersion: "0.2.0-preview.5",
    productionUpdaterPublicKeyId: null,
    releases: [],
    feed: null,
    targets: [],
  }, "pending public preview qualification cannot contain inferred evidence");
} else {
  assert.equal(typeof qualification.publicPreviewQualification.productionUpdaterPublicKeyId, "string");
  assert.equal(qualification.publicPreviewQualification.releases.length, 2);
  assert.deepEqual(qualification.publicPreviewQualification.targets.map((target) => target.key), enabledTargets);
  assert.equal(qualification.publicPreviewQualification.feed.version, "0.2.0-preview.5");
}
assert.deepEqual(qualification.targets.map((target) => target.key), contract.targets.map((target) => target.key));
assert.equal(new Set(qualification.targets.map((target) => target.key)).size, contract.targets.length);
assert.equal(qualification.targets.every((target) => {
  const contractTarget = contract.targets.find((candidate) => candidate.key === target.key);
  if (!contractTarget.releaseEnabled) return target.status === "planned_disabled" && target.evidence.length === 0;
  return (target.status === "qualification_required" && target.evidence.length === 0) ||
    (target.status === "qualified" && target.evidence.length === 1);
}), true, "enabled targets require one real evidence record; disabled targets must remain explicitly empty");
if (qualification.productionPromotion.enabled) {
  assert.equal(qualification.productionPromotion.workingNameClearance, "evidenced");
  assert.equal(qualification.productionPromotion.evidence?.schemaVersion, 1);
} else {
  assert.deepEqual(qualification.productionPromotion, {
    enabled: false,
    workingNameClearance: "not_evidenced",
    approvedAt: null,
    evidence: null,
  }, "disabled production promotion cannot contain inferred evidence");
}

for (const testCase of contract.versionCases) {
  assert.equal(evaluateVersionCase(testCase), testCase.expected, testCase.name);
}
for (const testCase of contract.metadataCases) {
  assert.equal(evaluateMetadataCase(testCase), testCase.expected, testCase.name);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const tauriWindowsConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.windows.conf.json"), "utf8"));
const tauriLinuxConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.linux.conf.json"), "utf8"));
const tauriMacosConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.macos.conf.json"), "utf8"));
const cargoToml = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoLock = fs.readFileSync(path.join(root, "src-tauri", "Cargo.lock"), "utf8");
const cargoVersion = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
const lockVersion = cargoLock.match(/^name = "gitodile"\r?\nversion = "([^"]+)"/m)?.[1];
const currentVersions = [packageJson.version, cargoVersion, lockVersion, tauriConfig.version];

assert.ok(parseVersion(packageJson.version), `unsupported current version ${packageJson.version}`);
assert.equal(currentVersions.every((version) => version === packageJson.version), true, "current metadata differs");
assert.equal(tauriConfig.identifier, "app.gitodile.desktop");
assert.equal(tauriConfig.bundle?.active, true);
assert.equal(tauriWindowsConfig.bundle?.targets, "nsis", "Windows must not implicitly build the unsupported MSI target");
assert.equal(tauriLinuxConfig.bundle?.targets, "appimage", "Linux qualification only supports AppImage");
assert.equal(tauriMacosConfig.bundle?.active, false, "macOS packaging remains explicitly disabled");
assert.deepEqual(
  tauriConfig.plugins?.updater,
  { endpoints: [], pubkey: "" },
  "the registered updater plugin needs a non-null config while release identity stays Rust-owned",
);

process.stdout.write(
  `App-update contract check passed (${contract.versionCases.length} version cases, ` +
    `${contract.metadataCases.length} metadata cases, ` +
    `${contract.targets.filter((target) => target.releaseEnabled).length} enabled release targets).\n`,
);
