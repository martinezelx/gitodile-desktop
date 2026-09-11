import {
  ALL_TARGETS,
  QUALIFICATION_PAIR,
  REQUIRED_TARGETS,
  TARGET_CONTRACTS,
  ReleaseValidationError,
} from "./release-candidate.mjs";

export const QUALIFICATION_SCHEMA_VERSION = 3;

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
const PUBLIC_RELEASE_URL = /^https:\/\/github\.com\/martinezelx\/gitodile-feedback\/releases\/tag\/v0\.2\.0-preview\.[45]$/;
const PUBLIC_ASSET_URL = /^https:\/\/github\.com\/martinezelx\/gitodile-feedback\/releases\/download\/v0\.2\.0-preview\.[45]\/[A-Za-z0-9._-]+$/;

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

function validateTargetEvidence(entry, target, expectedUpdaterPublicKeyId) {
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
    if (
      proof.builds.from.updaterSignature.publicKeyId !== expectedUpdaterPublicKeyId ||
      proof.builds.to.updaterSignature.publicKeyId !== expectedUpdaterPublicKeyId
    ) fail("qualification_invalid", `${target} validation builds use an unexpected updater identity`);

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
  for (const check of ["validationDraft", "fullMatrixFailure", "retry", "immutableAssets", "feedUnchanged"]) {
    if (publisher?.[check] !== "passed") fail("production_not_approved", `publisher check ${check} is incomplete`);
  }
}

function validateReleaseMatrix(qualification) {
  if (
    JSON.stringify(qualification?.releaseMatrix?.enabledTargets) !== JSON.stringify(REQUIRED_TARGETS) ||
    !Array.isArray(qualification?.releaseMatrix?.disabledTargets)
  ) fail("qualification_invalid", "reviewed release matrix is missing or differs from the enabled target set");
  const disabled = qualification.releaseMatrix.disabledTargets;
  const expectedDisabled = ALL_TARGETS.filter((target) => !REQUIRED_TARGETS.includes(target));
  if (JSON.stringify(disabled.map((entry) => entry.key)) !== JSON.stringify(expectedDisabled)) {
    fail("qualification_invalid", "disabled target set differs from the reviewed contract");
  }
  for (const entry of disabled) {
    if (
      entry.status !== "planned_disabled" || entry.reason !== "real_platform_qualification_required" ||
      entry.followUpTask !== "065-10" || !Array.isArray(entry.evidence) || entry.evidence.length !== 0
    ) fail("qualification_invalid", `${entry.key} lacks an explicit empty planned-disabled record`);
  }
}

function validateValidationQualification(record, required) {
  const [fromVersion, toVersion] = QUALIFICATION_PAIR;
  if (
    record?.signingProfile !== "validation" || record?.fromVersion !== fromVersion ||
    record?.toVersion !== toVersion
  ) fail("qualification_invalid", "validation qualification pair or signing profile is invalid");
  if (record.status === "pending") {
    if (record.evidence !== null) fail("qualification_invalid", "pending validation qualification cannot contain evidence");
    if (required) fail("qualification_required", "the controlled validation qualification is still pending");
    return;
  }
  if (
    record.status !== "qualified" || record.evidence?.schemaVersion !== 1 ||
    !RUN_URL.test(record.evidence?.controlledBundleRunUrl ?? "") ||
    !SHA256.test(record.evidence?.bundleReportSha256 ?? "") ||
    typeof record.evidence?.updaterPublicKeyId !== "string" ||
    record.evidence.updaterPublicKeyId.length === 0
  ) fail("qualification_required", "the controlled validation qualification is not evidenced");
}

export function validatePublicPreviewQualification(record) {
  if (
    record?.signingProfile !== "production" || record?.fromVersion !== "0.2.0-preview.4" ||
    record?.toVersion !== "0.2.0-preview.5" || !["pending", "qualified"].includes(record?.status)
  ) fail("qualification_invalid", "public preview qualification record is malformed");
  if (record.status === "pending" && (
    record.productionUpdaterPublicKeyId !== null || record.feed !== null ||
    !Array.isArray(record.releases) || record.releases.length !== 0 ||
    !Array.isArray(record.targets) || record.targets.length !== 0
  )) fail("qualification_invalid", "pending public preview qualification must not contain inferred evidence");
  if (record.status === "pending") return true;
  if (typeof record.productionUpdaterPublicKeyId !== "string" || record.productionUpdaterPublicKeyId.length === 0) {
    fail("qualification_invalid", "qualified public previews need the production updater key identity");
  }
  if (!Array.isArray(record.releases) || record.releases.length !== 2) {
    fail("qualification_invalid", "public preview qualification needs exactly two release records");
  }
  const expectedVersions = [record.fromVersion, record.toVersion];
  for (let index = 0; index < expectedVersions.length; index += 1) {
    const release = record.releases[index];
    const version = expectedVersions[index];
    if (
      release?.version !== version || release?.tag !== `v${version}` || !SOURCE_SHA.test(release?.sourceSha ?? "") ||
      !RUN_URL.test(release?.signingRunUrl ?? "") || !RUN_URL.test(release?.publishingRunUrl ?? "") ||
      !PUBLIC_RELEASE_URL.test(release?.publicReleaseUrl ?? "") || !SOURCE_SHA.test(release?.publicTagCommit ?? "") ||
      release?.updaterPublicKeyId !== record.productionUpdaterPublicKeyId ||
      !SHA256.test(release?.manifestSha256 ?? "") || !Array.isArray(release?.assets) ||
      release.assets.length !== REQUIRED_TARGETS.length
    ) fail("qualification_invalid", `public release evidence for ${version} is incomplete`);
    const assets = new Map(release.assets.map((asset) => [asset.target, asset]));
    if (assets.size !== release.assets.length) fail("qualification_invalid", `${version} public assets contain duplicate targets`);
    for (const target of REQUIRED_TARGETS) {
      const asset = assets.get(target);
      for (const [kind, value] of [["package", asset?.package], ["signature", asset?.signature]]) {
        if (
          typeof value?.fileName !== "string" || value.fileName !== value.fileName.split(/[\\/]/).at(-1) ||
          !Number.isSafeInteger(value?.size) || value.size <= 0 || !SHA256.test(value?.sha256 ?? "") ||
          !PUBLIC_ASSET_URL.test(value?.anonymousUrl ?? "")
        ) fail("qualification_invalid", `${version} ${target} ${kind} anonymous asset evidence is invalid`);
      }
    }
  }
  if (
    record.feed?.url !== "https://raw.githubusercontent.com/martinezelx/gitodile-feedback/main/updates/preview.json" ||
    record.feed?.version !== record.toVersion || !SHA256.test(record.feed?.sha256 ?? "") ||
    !SOURCE_SHA.test(record.feed?.commitSha ?? "") || !isCanonicalTimestamp(record.feed?.observedAt)
  ) fail("qualification_invalid", "public preview feed evidence is incomplete");
  if (!Array.isArray(record.targets) || record.targets.length !== REQUIRED_TARGETS.length) {
    fail("qualification_invalid", "public preview installed evidence is incomplete");
  }
  const targetReports = new Map(record.targets.map((target) => [target.key, target]));
  if (targetReports.size !== record.targets.length) fail("qualification_invalid", "public preview target evidence contains duplicates");
  for (const target of REQUIRED_TARGETS) {
    const report = targetReports.get(target);
    const expected = expectedEnvironment(target);
    if (
      report?.environment?.os !== expected.os || report?.environment?.architecture !== expected.architecture ||
      report?.environment?.installationMode !== TARGET_CONTRACTS[target].installation ||
      typeof report?.environment?.osVersion !== "string" || report.environment.osVersion.length === 0 ||
      report?.transition?.runningVersionBefore !== record.fromVersion ||
      report?.transition?.runningVersionAfter !== record.toVersion || report?.transition?.result !== "passed" ||
      report?.transition?.falseSuccessObserved !== false || report?.transition?.forcedDowngradeObserved !== false ||
      !HTTPS_URL.test(report?.report?.url ?? "") || !SHA256.test(report?.report?.sha256 ?? "")
    ) fail("qualification_invalid", `${target} public installed transition evidence is incomplete`);
  }
  return true;
}

export function validateQualificationRegistry(qualification, candidate, mode) {
  if (qualification?.schemaVersion !== QUALIFICATION_SCHEMA_VERSION || !Array.isArray(qualification.targets)) {
    fail("qualification_invalid", "qualification registry is malformed");
  }
  const byTarget = new Map(qualification.targets.map((item) => [item.key, item]));
  validateReleaseMatrix(qualification);
  validatePublicPreviewQualification(qualification.publicPreviewQualification);
  if (
    qualification.validationQualification?.status === "qualified" &&
    qualification.publicPreviewQualification?.status === "qualified" &&
    qualification.validationQualification.evidence?.updaterPublicKeyId ===
      qualification.publicPreviewQualification.productionUpdaterPublicKeyId
  ) fail("qualification_invalid", "validation and production updater identities must be distinct");
  if (byTarget.size !== qualification.targets.length || qualification.targets.length !== ALL_TARGETS.length) {
    fail("qualification_invalid", "qualification registry contains duplicate or unexpected targets");
  }
  for (const target of ALL_TARGETS) {
    if (!byTarget.has(target)) fail("qualification_invalid", `qualification registry omits ${target}`);
  }
  if (
    JSON.stringify(candidate.matrix.requiredTargets) !== JSON.stringify(REQUIRED_TARGETS) ||
    JSON.stringify(candidate.matrix.targets.map((target) => target.key)) !== JSON.stringify(REQUIRED_TARGETS)
  ) {
    fail("qualification_invalid", "signed matrix differs from the reviewed enabled target set");
  }
  for (const target of ALL_TARGETS.filter((key) => !REQUIRED_TARGETS.includes(key))) {
    const entry = byTarget.get(target);
    if (entry?.status !== "planned_disabled" || !Array.isArray(entry.evidence) || entry.evidence.length !== 0) {
      fail("qualification_invalid", `${target} must remain planned_disabled without evidence or publication`);
    }
  }
  if (mode === "validation-draft") {
    if (candidate.release.signingProfile !== "validation" || candidate.release.purpose !== "qualification") {
      fail("profile_mismatch", "validation drafts require the fixed validation signing profile");
    }
    validateValidationQualification(qualification.validationQualification, false);
    return { productionAllowed: false, qualifiedTargets: [] };
  }
  if (mode !== "production") fail("invalid_mode", "mode must be validation-draft or production");
  if (candidate.release.signingProfile !== "production" || candidate.release.purpose !== "release_candidate") {
    fail("profile_mismatch", "production promotion requires a production-signed release candidate");
  }
  validateValidationQualification(qualification.validationQualification, true);
  validateProductionApproval(qualification.productionPromotion);
  const validationUpdaterPublicKeyId = qualification.validationQualification.evidence.updaterPublicKeyId;
  const qualifiedTargets = candidate.matrix.requiredTargets.filter((target) =>
    validateTargetEvidence(byTarget.get(target), target, validationUpdaterPublicKeyId));
  if (qualifiedTargets.length !== candidate.matrix.requiredTargets.length) {
    const missing = candidate.matrix.requiredTargets.filter((target) => !qualifiedTargets.includes(target));
    fail("qualification_required", `targets still require real A-to-B evidence: ${missing.join(", ")}`);
  }
  return { productionAllowed: true, qualifiedTargets };
}
