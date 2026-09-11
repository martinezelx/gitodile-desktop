import { QUALIFICATION_PAIR, REQUIRED_TARGETS, TARGET_CONTRACTS, ReleaseValidationError } from "./release-candidate.mjs";

export const QUALIFICATION_SCHEMA_VERSION = 2;

export const REQUIRED_PRESERVATION_CHECKS = Object.freeze([
  "settings",
  "sessions",
  "volatileDrafts",
  "dirtyTrackedFiles",
  "dirtyUntrackedFiles",
  "otherProjects",
  "activeOperations",
  "helpers",
  "gitHistory",
]);

export const REQUIRED_FAILURE_CASES = Object.freeze([
  "offline",
  "feed_unavailable",
  "target_unavailable",
  "corrupt_or_truncated_download",
  "signature_invalid",
  "cancellation",
  "insufficient_space",
  "locked_installation",
  "read_only_installation",
  "interrupted_handoff",
  "reinstall",
  "managed_package_fallback",
]);

const SHA256 = /^[0-9a-f]{64}$/;
const SOURCE_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const RUN_URL = /^https:\/\/github\.com\/martinezelx\/project-gitodile\/actions\/runs\/[1-9][0-9]*(?:\/attempts\/[1-9][0-9]*)?$/;
const HTTPS_URL = /^https:\/\//;

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().replace(".000Z", "Z") === value;
}

function requirePassed(value, label) {
  if (value?.result !== "passed") fail("qualification_invalid", `${label} is not passed`);
}

function validateArtifact(artifact, label) {
  if (
    typeof artifact?.fileName !== "string" || artifact.fileName.length === 0 ||
    artifact.fileName !== artifact.fileName.split(/[\\/]/).at(-1) ||
    !SHA256.test(artifact?.sha256 ?? "") || !Number.isSafeInteger(artifact?.size) || artifact.size <= 0
  ) fail("qualification_invalid", `${label} artifact identity is invalid`);
}

function validateBuild(build, expectedVersion, target, label) {
  if (
    build?.version !== expectedVersion || build?.tag !== `v${expectedVersion}` ||
    !SOURCE_SHA.test(build?.sourceSha ?? "") || !SHA256.test(build?.signedMatrixSha256 ?? "") ||
    !RUN_URL.test(build?.buildRunUrl ?? "") || !RUN_URL.test(build?.signingRunUrl ?? "")
  ) fail("qualification_invalid", `${label} build provenance is invalid`);
  validateArtifact(build.installerArtifact, `${label} installer`);
  validateArtifact(build.updaterArtifact, `${label} updater`);
  requirePassed(build.updaterSignature, `${label} updater signature`);
  if (typeof build.updaterSignature?.publicKeyId !== "string" || build.updaterSignature.publicKeyId.length === 0) {
    fail("qualification_invalid", `${label} updater key identity is missing`);
  }
  const mac = target.startsWith("darwin-");
  const linux = target === "linux-x86_64";
  if (linux) {
    if (build.operatingSystemTrust?.result !== "not_applicable") fail("qualification_invalid", `${label} Linux OS trust must be not_applicable`);
  } else {
    requirePassed(build.operatingSystemTrust, `${label} operating-system trust`);
    if (typeof build.operatingSystemTrust?.publicIdentity !== "string" || build.operatingSystemTrust.publicIdentity.length === 0) {
      fail("qualification_invalid", `${label} operating-system trust identity is missing`);
    }
  }
  if (mac) requirePassed(build.notarization, `${label} notarization`);
  else if (build.notarization?.result !== "not_applicable") fail("qualification_invalid", `${label} notarization must be not_applicable`);
}

function expectedEnvironment(target) {
  if (target === "windows-x86_64") return { os: "windows", architecture: "x86_64" };
  if (target === "linux-x86_64") return { os: "linux", architecture: "x86_64" };
  return { os: "macos", architecture: target.endsWith("aarch64") ? "aarch64" : "x86_64" };
}

function validateTargetEvidence(entry, target) {
  if (entry.status !== "qualified" || !Array.isArray(entry.evidence) || entry.evidence.length !== 1) return false;
  const proof = entry.evidence[0];
  try {
    const expected = expectedEnvironment(target);
    if (
      proof?.schemaVersion !== 1 || proof?.target !== target || proof?.result !== "passed" ||
      !isCanonicalTimestamp(proof?.observedAt) || !RUN_URL.test(proof?.qualificationRunUrl ?? "") ||
      !SHA256.test(proof?.reportSha256 ?? "") || proof?.environment?.os !== expected.os ||
      proof?.environment?.architecture !== expected.architecture ||
      typeof proof?.environment?.osVersion !== "string" || proof.environment.osVersion.length === 0 ||
      proof?.environment?.installationMode !== TARGET_CONTRACTS[target].installation
    ) fail("qualification_invalid", `${target} environment or report provenance is invalid`);

    const [fromVersion, toVersion] = QUALIFICATION_PAIR;
    if (
      proof?.transition?.fromVersion !== fromVersion || proof?.transition?.toVersion !== toVersion ||
      proof?.transition?.runningVersionBefore !== fromVersion || proof?.transition?.runningVersionAfter !== toVersion ||
      proof?.transition?.result !== "passed" || proof?.transition?.falseSuccessObserved !== false ||
      proof?.transition?.forcedDowngradeObserved !== false
    ) fail("qualification_invalid", `${target} does not prove the fixed A-to-B transition`);
    validateBuild(proof.builds?.from, fromVersion, target, `${target} build A`);
    validateBuild(proof.builds?.to, toVersion, target, `${target} build B`);

    for (const check of REQUIRED_PRESERVATION_CHECKS) {
      const required = check === "gitHistory" ? "unchanged" : "passed";
      if (proof?.preservation?.[check] !== required) fail("qualification_invalid", `${target} preservation check ${check} is incomplete`);
    }

    if (!Array.isArray(proof.failureCases) || proof.failureCases.length !== REQUIRED_FAILURE_CASES.length) {
      fail("qualification_invalid", `${target} failure matrix is incomplete`);
    }
    const cases = new Map(proof.failureCases.map((item) => [item.name, item]));
    if (cases.size !== proof.failureCases.length) fail("qualification_invalid", `${target} failure matrix contains duplicates`);
    for (const name of REQUIRED_FAILURE_CASES) {
      const item = cases.get(name);
      if (item?.result !== "passed" || item?.falseSuccessObserved !== false || item?.forcedDowngradeObserved !== false) {
        fail("qualification_invalid", `${target} failure case ${name} is incomplete`);
      }
    }

    if (target.startsWith("darwin-")) {
      if (
        proof?.replacementSafety?.result !== "passed" || !HTTPS_URL.test(proof?.replacementSafety?.independentReviewUrl ?? "") ||
        !SHA256.test(proof?.replacementSafety?.testReportSha256 ?? "")
      ) fail("qualification_invalid", `${target} replacement-safety mitigation lacks independent evidence`);
    } else if (proof?.replacementSafety?.result !== "not_applicable") {
      fail("qualification_invalid", `${target} replacement safety must be not_applicable`);
    }
    return true;
  } catch (error) {
    if (error instanceof ReleaseValidationError) return false;
    throw error;
  }
}

function validateProductionApproval(approval) {
  if (
    approval?.enabled !== true || approval?.workingNameClearance !== "evidenced" ||
    !isCanonicalTimestamp(approval?.approvedAt) || approval?.evidence?.schemaVersion !== 1
  ) fail("production_not_approved", "production promotion and working-name clearance are not evidenced");
  const clearance = approval.evidence.workingNameClearance;
  if (clearance?.result !== "passed" || !isCanonicalTimestamp(clearance?.reviewedAt) || !HTTPS_URL.test(clearance?.referenceUrl ?? "")) {
    fail("production_not_approved", "working-name clearance evidence is incomplete");
  }
  const publisher = approval.evidence.publisher;
  if (publisher?.result !== "passed" || !RUN_URL.test(publisher?.qualificationRunUrl ?? "") || !SHA256.test(publisher?.reportSha256 ?? "")) {
    fail("production_not_approved", "publisher qualification provenance is incomplete");
  }
  for (const check of ["fullMatrixFailure", "retry", "immutableAssets", "previewPromotion", "stablePromotion", "anonymousAccess"]) {
    if (publisher?.[check] !== "passed") fail("production_not_approved", `publisher check ${check} is incomplete`);
  }
}

export function validateQualificationRegistry(qualification, candidate, mode) {
  if (qualification?.schemaVersion !== QUALIFICATION_SCHEMA_VERSION || !Array.isArray(qualification.targets)) {
    fail("qualification_invalid", "qualification registry is malformed");
  }
  const byTarget = new Map(qualification.targets.map((item) => [item.key, item]));
  if (byTarget.size !== qualification.targets.length || qualification.targets.length !== REQUIRED_TARGETS.length) {
    fail("qualification_invalid", "qualification registry contains duplicate or unexpected targets");
  }
  for (const target of REQUIRED_TARGETS) {
    if (!byTarget.has(target)) fail("qualification_invalid", `qualification registry omits ${target}`);
  }
  if (mode === "validation-draft") {
    if (candidate.release.signingProfile !== "validation" || candidate.release.purpose !== "qualification") {
      fail("profile_mismatch", "validation drafts require the fixed validation signing profile");
    }
    return { productionAllowed: false, qualifiedTargets: [] };
  }
  if (mode !== "production") fail("invalid_mode", "mode must be validation-draft or production");
  if (candidate.release.signingProfile !== "production" || candidate.release.purpose !== "release_candidate") {
    fail("profile_mismatch", "production promotion requires a production-signed release candidate");
  }
  validateProductionApproval(qualification.productionPromotion);
  const qualifiedTargets = candidate.matrix.requiredTargets.filter((target) => validateTargetEvidence(byTarget.get(target), target));
  if (qualifiedTargets.length !== candidate.matrix.requiredTargets.length) {
    const missing = candidate.matrix.requiredTargets.filter((target) => !qualifiedTargets.includes(target));
    fail("qualification_required", `targets still require real A-to-B evidence: ${missing.join(", ")}`);
  }
  return { productionAllowed: true, qualifiedTargets };
}
