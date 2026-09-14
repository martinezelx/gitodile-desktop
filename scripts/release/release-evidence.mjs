import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_TARGETS, TARGET_CONTRACTS, ReleaseValidationError } from "./release-candidate.mjs";

function sha256(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

export function describeArtifact(file, role) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new ReleaseValidationError("invalid_artifact", `${file} is not a regular file`);
  return { role, fileName: path.basename(file), size: stat.size, sha256: sha256(file) };
}

export function createEvidence({ candidate, target, phase, artifacts, trust }) {
  if (!REQUIRED_TARGETS.includes(target)) {
    throw new ReleaseValidationError("unexpected_target", `unsupported target: ${target}`);
  }
  return {
    schemaVersion: 1,
    phase,
    source: candidate.source,
    release: candidate.release,
    target,
    rustTarget: TARGET_CONTRACTS[target].rustTarget,
    artifacts: artifacts.map(({ file, role }) => describeArtifact(file, role)),
    trust,
  };
}

export function unsignedTrust(target) {
  return {
    updater: { result: "not_checked", publicIdentity: null },
    operatingSystem: { result: target === "linux-x86_64" ? "not_applicable" : "not_checked", publicIdentity: null },
    notarization: { result: target.startsWith("darwin-") ? "not_checked" : "not_applicable" },
  };
}

export function verifyEvidenceArtifacts(evidence, directory) {
  if (!Array.isArray(evidence.artifacts) || evidence.artifacts.length === 0) {
    throw new ReleaseValidationError("artifact_missing", `${evidence.target} has no artifacts`);
  }
  for (const artifact of evidence.artifacts) {
    if (path.basename(artifact.fileName) !== artifact.fileName) {
      throw new ReleaseValidationError("invalid_artifact", "artifact evidence may not escape its directory");
    }
    const actual = describeArtifact(path.join(directory, artifact.fileName), artifact.role);
    if (actual.size !== artifact.size || actual.sha256 !== artifact.sha256) {
      throw new ReleaseValidationError("hash_mismatch", `${evidence.target}/${artifact.fileName} hash differs`);
    }
  }
  return true;
}

export function verifyArtifactShape(evidence) {
  const roles = evidence.artifacts.map((artifact) => artifact.role).sort();
  let expected;
  if (evidence.phase === "unsigned") {
    expected = evidence.target.startsWith("darwin-") ? ["staged-app"] : ["first-install-and-updater"];
  } else if (evidence.phase === "os-signed") {
    expected = evidence.target.startsWith("darwin-") ? ["first-install", "updater"] : ["first-install-and-updater"];
  } else if (evidence.phase === "signed") {
    expected = evidence.target.startsWith("darwin-")
      ? ["first-install", "updater", "updater-signature"]
      : ["first-install-and-updater", "updater-signature"];
  } else {
    throw new ReleaseValidationError("verification_incomplete", `${evidence.target} has unknown evidence phase`);
  }
  if (JSON.stringify(roles) !== JSON.stringify([...expected].sort())) {
    throw new ReleaseValidationError("invalid_artifact", `${evidence.target} artifact roles differ from its contract`);
  }
  const names = evidence.artifacts.map((artifact) => artifact.fileName);
  const extensionsValid = evidence.target === "windows-x86_64"
    ? names.every((name) => name.endsWith(".exe") || name.endsWith(".exe.sig"))
    : evidence.target.startsWith("darwin-")
      ? names.every((name) => name.endsWith(".zip") || name.endsWith(".dmg") || name.endsWith(".app.tar.gz") || name.endsWith(".app.tar.gz.sig"))
      : names.every((name) => name.endsWith(".AppImage") || name.endsWith(".AppImage.sig"));
  if (!extensionsValid) {
    throw new ReleaseValidationError("invalid_artifact", `${evidence.target} contains a non-package artifact`);
  }
}

export function verifyCompleteMatrix(evidenceItems, candidate, { requiredPhase = null } = {}) {
  const byTarget = new Map();
  for (const evidence of evidenceItems) {
    if (byTarget.has(evidence.target)) {
      throw new ReleaseValidationError("duplicate_target", `duplicate evidence for ${evidence.target}`);
    }
    if (
      evidence.source.tag !== candidate.source.tag ||
      evidence.source.sha !== candidate.source.sha ||
      evidence.release.version !== candidate.release.version ||
      evidence.release.channel !== candidate.release.channel ||
      evidence.release.publicPromotionAllowed !== false
    ) {
      throw new ReleaseValidationError("provenance_mismatch", `${evidence.target} provenance differs`);
    }
    if (evidence.rustTarget !== TARGET_CONTRACTS[evidence.target]?.rustTarget) {
      throw new ReleaseValidationError("provenance_mismatch", `${evidence.target} Rust target differs`);
    }
    verifyArtifactShape(evidence);
    if (requiredPhase !== null && evidence.phase !== requiredPhase) {
      throw new ReleaseValidationError("verification_incomplete", `${evidence.target} is not ${requiredPhase}`);
    }
    if (requiredPhase === "signed") {
      if (evidence.trust?.updater?.result !== "passed" || !evidence.trust.updater.publicIdentity) {
        throw new ReleaseValidationError("verification_incomplete", `${evidence.target} lacks updater verification`);
      }
      const deferredWindows = evidence.target === "windows-x86_64";
      const expectedOsResult = evidence.target === "linux-x86_64"
        ? "not_applicable"
        : deferredWindows
          ? "not_checked"
          : "passed";
      if (evidence.trust?.operatingSystem?.result !== expectedOsResult) {
        throw new ReleaseValidationError("verification_incomplete", `${evidence.target} lacks OS trust verification`);
      }
      if (deferredWindows && (
        evidence.trust.operatingSystem.reason !== "authenticode_deferred" ||
        evidence.trust.operatingSystem.publicIdentity !== null
      )) {
        throw new ReleaseValidationError(
          "verification_incomplete",
          "Windows without Authenticode must remain explicitly marked authenticode_deferred",
        );
      }
      const expectedNotary = evidence.target.startsWith("darwin-") ? "passed" : "not_applicable";
      if (evidence.trust?.notarization?.result !== expectedNotary) {
        throw new ReleaseValidationError("verification_incomplete", `${evidence.target} lacks notarization verification`);
      }
    }
    byTarget.set(evidence.target, evidence);
  }
  const missing = REQUIRED_TARGETS.filter((target) => !byTarget.has(target));
  if (missing.length > 0) {
    throw new ReleaseValidationError("matrix_incomplete", `missing required targets: ${missing.join(", ")}`);
  }
  if (requiredPhase === "signed") {
    const updaterIdentities = new Set(
      REQUIRED_TARGETS.map((target) => byTarget.get(target).trust.updater.publicIdentity),
    );
    if (updaterIdentities.size !== 1) {
      throw new ReleaseValidationError("provenance_mismatch", "signed targets use different updater identities");
    }
  }
  return REQUIRED_TARGETS.map((target) => byTarget.get(target));
}

export function requireCredentials(environment, names) {
  const missing = names.filter((name) => typeof environment[name] !== "string" || environment[name].length === 0);
  if (missing.length > 0) {
    throw new ReleaseValidationError("credentials_unavailable", `missing required credential names: ${missing.join(", ")}`);
  }
  return names.map((name) => ({ name, available: true }));
}

function parseArgs(argv) {
  const result = { artifacts: [], credentials: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`invalid argument: ${argv[index] ?? "<missing>"}`);
    if (key === "artifact") result.artifacts.push(value);
    else if (key === "credential") result.credentials.push(value);
    else result[key] = value;
  }
  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function collectEvidenceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectEvidenceFiles(absolute));
    else if (entry.isFile() && entry.name === "evidence.json") files.push(absolute);
  }
  return files;
}

export function runEvidenceCli(argv, environment = process.env) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  if (command === "check-credentials") {
    return requireCredentials(environment, args.credentials);
  }
  if (command === "create") {
    const candidate = readJson(args.candidate);
    const evidence = createEvidence({
      candidate,
      target: args.target,
      phase: args.phase,
      artifacts: args.artifacts.map((value) => {
        const separator = value.indexOf("=");
        if (separator < 1) throw new Error("artifact must use role=path");
        return { role: value.slice(0, separator), file: value.slice(separator + 1) };
      }),
      trust: args["trust-state"] === "unsigned" ? unsignedTrust(args.target) : readJson(args.trust),
    });
    fs.writeFileSync(args.output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
    return evidence;
  }
  if (command === "verify-matrix") {
    const candidate = readJson(args.candidate);
    const files = args.directory ? collectEvidenceFiles(path.resolve(args.directory)) : args.artifacts;
    const items = files.map((file) => {
      const evidence = readJson(file);
      verifyEvidenceArtifacts(evidence, path.dirname(file));
      return evidence;
    });
    return verifyCompleteMatrix(items, candidate, { requiredPhase: args.phase ?? null });
  }
  if (command === "verify-artifacts") {
    return verifyEvidenceArtifacts(readJson(args.evidence), path.resolve(args.directory));
  }
  throw new Error(`unknown evidence command: ${command}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runEvidenceCli(process.argv.slice(2));
    process.stdout.write("Release evidence verification passed.\n");
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Release evidence verification failed [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
