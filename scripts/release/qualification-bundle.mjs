import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUALIFICATION_PAIR, REQUIRED_TARGETS, ReleaseValidationError } from "./release-candidate.mjs";
import { verifyCompleteMatrix, verifyEvidenceArtifacts } from "./release-evidence.mjs";

const BUNDLE_PREFIX = "/gitodile-validation/065-9-7/";

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function evidenceFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...evidenceFiles(item));
    else if (entry.isFile() && entry.name === "evidence.json") result.push(item);
  }
  return result;
}

function loadSignedMatrix(directory, expectedVersion) {
  const matrixPath = path.join(directory, "matrix.json");
  if (!fs.existsSync(matrixPath)) fail("matrix_record_missing", `${expectedVersion} matrix.json is missing`);
  const matrixBytes = fs.readFileSync(matrixPath);
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  if (
    matrix?.schemaVersion !== 1 || matrix?.source?.tag !== `v${expectedVersion}` ||
    matrix?.release?.version !== expectedVersion || matrix?.release?.channel !== "preview" ||
    matrix?.release?.purpose !== "qualification" || matrix?.release?.signingProfile !== "validation" ||
    matrix?.release?.publicPromotionAllowed !== false || matrix?.result !== "passed" ||
    matrix?.publicPromotionAllowed !== false || JSON.stringify(matrix?.targets) !== JSON.stringify(REQUIRED_TARGETS)
  ) fail("matrix_record_invalid", `${expectedVersion} is not a complete validation-signed matrix`);
  const candidate = {
    schemaVersion: 1,
    source: matrix.source,
    release: matrix.release,
    matrix: { requiredTargets: matrix.targets, targets: matrix.targets.map((key) => ({ key })) },
  };
  const files = evidenceFiles(directory);
  const evidence = files.map((file) => {
    const record = readJson(file);
    verifyEvidenceArtifacts(record, path.dirname(file));
    return record;
  });
  const ordered = verifyCompleteMatrix(evidence, candidate, { requiredPhase: "signed" });
  return { matrix, matrixSha256: sha256(matrixBytes), ordered, files };
}

function parseControlledFeed(value) {
  let feed;
  try {
    feed = new URL(value);
  } catch {
    fail("validation_feed_invalid", "controlled validation feed must be an absolute HTTPS URL");
  }
  if (
    feed.protocol !== "https:" || feed.port || feed.username || feed.password || feed.search || feed.hash ||
    feed.pathname !== `${BUNDLE_PREFIX}updates/preview.json`
  ) fail("validation_feed_invalid", `controlled feed path must be ${BUNDLE_PREFIX}updates/preview.json`);
  return feed;
}

function sourceForRecord(directory, files, target, fileName) {
  const evidence = files.find((file) => readJson(file).target === target);
  if (!evidence) fail("matrix_incomplete", `missing evidence path for ${target}`);
  return path.join(path.dirname(evidence), fileName);
}

export function prepareQualificationBundle({ fromDirectory, toDirectory, validationFeed, output }) {
  const feed = parseControlledFeed(validationFeed);
  const [fromVersion, toVersion] = QUALIFICATION_PAIR;
  const from = loadSignedMatrix(fromDirectory, fromVersion);
  const to = loadSignedMatrix(toDirectory, toVersion);
  const names = new Set();
  const platforms = {};
  const copied = [];

  for (const [version, directory, signed] of [[fromVersion, fromDirectory, from], [toVersion, toDirectory, to]]) {
    for (const record of signed.ordered) {
      for (const artifact of record.artifacts) {
        const relative = path.posix.join("packages", `v${version}`, artifact.fileName);
        const key = `${version}/${artifact.fileName}`;
        if (names.has(key)) fail("unsafe_asset", `duplicate validation artifact: ${key}`);
        names.add(key);
        copied.push({
          version,
          target: record.target,
          role: artifact.role,
          fileName: artifact.fileName,
          relative,
          size: artifact.size,
          sha256: artifact.sha256,
          source: sourceForRecord(directory, signed.files, record.target, artifact.fileName),
        });
      }
      if (version === toVersion) {
        const updater = record.artifacts.find((artifact) => artifact.role === "updater" || artifact.role === "first-install-and-updater");
        const signature = record.artifacts.find((artifact) => artifact.role === "updater-signature");
        if (!updater || !signature) fail("artifact_missing", `${record.target} lacks updater bytes or signature`);
        const signatureText = fs.readFileSync(sourceForRecord(directory, signed.files, record.target, signature.fileName), "utf8").trim();
        if (!signatureText || Buffer.byteLength(signatureText) > 4096) fail("signature_invalid", `${record.target} signature is empty or oversized`);
        platforms[record.target] = {
          signature: signatureText,
          url: `${feed.origin}${BUNDLE_PREFIX}releases/v${toVersion}/${encodeURIComponent(updater.fileName)}`,
          size: updater.size,
        };
      }
    }
  }

  fs.mkdirSync(output, { recursive: true });
  for (const artifact of copied) {
    const destination = path.join(output, artifact.relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(artifact.source, destination, fs.constants.COPYFILE_EXCL);
    const bytes = fs.readFileSync(destination);
    if (bytes.length !== artifact.size || sha256(bytes) !== artifact.sha256) fail("hash_mismatch", `copied bytes differ: ${artifact.fileName}`);
    if (artifact.version === toVersion) {
      const releaseDestination = path.join(output, "releases", `v${toVersion}`, artifact.fileName);
      fs.mkdirSync(path.dirname(releaseDestination), { recursive: true });
      fs.copyFileSync(destination, releaseDestination, fs.constants.COPYFILE_EXCL);
    }
  }
  const manifest = { version: toVersion, notes: "Controlled GitOdile updater qualification build.", pub_date: null, platforms };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const feedPath = path.join(output, "updates", "preview.json");
  fs.mkdirSync(path.dirname(feedPath), { recursive: true });
  fs.writeFileSync(feedPath, manifestBytes, { flag: "wx" });
  const report = {
    schemaVersion: 1,
    purpose: "065-9-7-controlled-qualification",
    publicPromotionAllowed: false,
    validationFeed: feed.href,
    pair: {
      from: { version: fromVersion, tag: from.matrix.source.tag, sourceSha: from.matrix.source.sha, signedMatrixSha256: from.matrixSha256 },
      to: { version: toVersion, tag: to.matrix.source.tag, sourceSha: to.matrix.source.sha, signedMatrixSha256: to.matrixSha256 },
    },
    manifestSha256: sha256(manifestBytes),
    artifacts: copied.map(({ source, ...artifact }) => artifact),
  };
  fs.writeFileSync(path.join(output, "qualification-bundle.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return report;
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) throw new Error(`invalid argument: ${argv[index] ?? "<missing>"}`);
    args.set(argv[index].slice(2), argv[index + 1]);
  }
  return args;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = prepareQualificationBundle({
      fromDirectory: path.resolve(args.get("from")),
      toDirectory: path.resolve(args.get("to")),
      validationFeed: args.get("feed"),
      output: path.resolve(args.get("output")),
    });
    process.stdout.write(`Prepared controlled ${report.pair.from.version} to ${report.pair.to.version} qualification bundle.\n`);
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Qualification bundle failed [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
