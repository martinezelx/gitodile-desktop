import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs", "architecture", "065-9-1-app-update-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

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
assert.equal(contract.targets.every((target) => target.automaticEligibility === "qualification_required"), true);
assert.equal(new Set(contract.targets.map((target) => target.key)).size, contract.targets.length);
assert.deepEqual(contract.validationBuilds, ["0.2.0-preview.2", "0.2.0-preview.3"]);
assert.equal(compareVersions(parseVersion(contract.validationBuilds[0]), parseVersion(contract.validationBuilds[1])), -1);

for (const testCase of contract.versionCases) {
  assert.equal(evaluateVersionCase(testCase), testCase.expected, testCase.name);
}
for (const testCase of contract.metadataCases) {
  assert.equal(evaluateMetadataCase(testCase), testCase.expected, testCase.name);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const cargoToml = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoLock = fs.readFileSync(path.join(root, "src-tauri", "Cargo.lock"), "utf8");
const cargoVersion = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
const lockVersion = cargoLock.match(/^name = "gitodile"\r?\nversion = "([^"]+)"/m)?.[1];
const currentVersions = [packageJson.version, cargoVersion, lockVersion, tauriConfig.version];

assert.ok(parseVersion(packageJson.version), `unsupported current version ${packageJson.version}`);
assert.equal(currentVersions.every((version) => version === packageJson.version), true, "current metadata differs");
assert.equal(tauriConfig.identifier, "app.gitodile.desktop");
assert.equal(tauriConfig.bundle?.active, true);

process.stdout.write(
  `App-update contract check passed (${contract.versionCases.length} version cases, ` +
    `${contract.metadataCases.length} metadata cases, ${contract.targets.length} candidate targets).\n`,
);
