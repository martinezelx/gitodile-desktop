import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUALIFICATION_SCHEMA_VERSION } from "./release/qualification-evidence.mjs";

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
assert.equal(Object.hasOwn(contract, "validationBuilds"), false, "the contract carries no fixed test-build versions");
assert.equal(qualification.schemaVersion, QUALIFICATION_SCHEMA_VERSION);
for (const retired of ["validationQualification", "publicPreviewQualification"]) {
  assert.equal(Object.hasOwn(qualification, retired), false, `the registry no longer carries ${retired}`);
}
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
  assert.equal(qualification.productionPromotion.evidence?.schemaVersion, 2);
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
const tauriUnsignedConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.unsigned.conf.json"), "utf8"));
const cargoToml = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoLock = fs.readFileSync(path.join(root, "src-tauri", "Cargo.lock"), "utf8");
const nativeUpdater = fs.readFileSync(path.join(root, "src-tauri", "src", "app_updates.rs"), "utf8");
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
  tauriUnsignedConfig.bundle,
  { createUpdaterArtifacts: false },
  "the secretless build must not ask Tauri to create updater signatures",
);
assert.deepEqual(
  tauriConfig.plugins?.updater,
  { endpoints: [], pubkey: "" },
  "the registered updater plugin needs a non-null config while release identity stays Rust-owned",
);
assert.match(cargoToml, /tauri-plugin-updater\s*=\s*"=2\.11\.0"/,
  "the configured updater client API requires the exact reviewed plugin version");
assert.match(cargoToml, /reqwest\s*=\s*\{[^\n]*default-features\s*=\s*false[^\n]*\}/,
  "GitOdile may name the plugin client's Reqwest types without enabling another default client");
assert.doesNotMatch(cargoToml, /reqwest\s*=\s*\{[^\n]*,\s*features\s*=/,
  "GitOdile must not select a direct Reqwest TLS provider");
assert.doesNotMatch(cargoLock, /^name = "aws-lc-(?:rs|sys)"$/m,
  "the removed standalone manifest client must not retain AWS-LC dependencies");
const nativeUpdaterProduction = nativeUpdater.split("\n#[cfg(test)]\nmod tests")[0];
// One closed error vocabulary: the contract, the Rust enum and the renderer's
// type must list the same codes in the same order, so a code added to one
// side cannot reach the UI without a message or the fixture.
const rustErrorCodes = nativeUpdaterProduction
  .match(/enum UpdateErrorCode \{([^}]*)\}/)[1]
  .split(",")
  .map((variant) => variant.trim())
  .filter(Boolean)
  .map((variant) => variant.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase());
assert.deepEqual(rustErrorCodes, contract.errors, "UpdateErrorCode variants differ from the contract's error list");
const domain = fs.readFileSync(path.join(root, "src", "features", "app-updates", "domain.ts"), "utf8");
const rendererErrorCodes = [...domain.match(/code:\n([\s\S]*?);\n\s*stage:/)[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
assert.deepEqual(rendererErrorCodes, contract.errors, "domain.ts error codes differ from the contract's error list");
assert.match(nativeUpdaterProduction, /fn check_time_block\(/,
  "a build that cannot install a candidate must say so at check time, before any download");
assert.match(nativeUpdaterProduction, /registered_windows_install_locations\(/,
  "the Windows install mode is read from the NSIS uninstall registry hive, not inferred from a directory");
assert.equal((nativeUpdaterProduction.match(/updater\.check\(\)\.await/g) ?? []).length, 1,
  "tauri-plugin-updater.check() must be the only feed request authority");
assert.doesNotMatch(nativeUpdaterProduction, /fetch_bounded_manifest|bytes_stream\(/,
  "GitOdile must not restore a separate manifest fetch");
assert.match(nativeUpdaterProduction, /validate_raw_manifest\(/,
  "the plugin's authoritative raw_json must still pass GitOdile's strict validation");

process.stdout.write(
  `App-update contract check passed (${contract.versionCases.length} version cases, ` +
    `${contract.metadataCases.length} metadata cases, ` +
    `${contract.targets.filter((target) => target.releaseEnabled).length} enabled release targets).\n`,
);
