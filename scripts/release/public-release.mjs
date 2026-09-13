import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseReleaseVersion, ReleaseValidationError, REQUIRED_TARGETS } from "./release-candidate.mjs";
import { verifyCompleteMatrix, verifyEvidenceArtifacts } from "./release-evidence.mjs";
import { validateQualificationRegistry } from "./qualification-evidence.mjs";

export const PUBLIC_REPOSITORY = "martinezelx/gitodile-feedback";
export const PUBLIC_RELEASE_ORIGIN = `https://github.com/${PUBLIC_REPOSITORY}/releases/download`;
export const GUIDANCE_START = "<!-- gitodile-downloads:start -->";
export const GUIDANCE_END = "<!-- gitodile-downloads:end -->";
const SOURCE_ARCHIVE = /(?:^|[-_.])(source|src)(?:[-_.]|$)/i;
const SECRET_NAME = /(?:private[-_.]?key|certificate|credential|secret|token|source[-_.]?archive)/i;

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function collectEvidenceFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectEvidenceFiles(item));
    else if (entry.isFile() && entry.name === "evidence.json") result.push(item);
  }
  return result;
}

export function compareReleaseVersions(left, right) {
  const parse = (version) => {
    const release = parseReleaseVersion(version);
    const [core, prerelease] = version.split("-preview.");
    return { release, core: core.split(".").map(BigInt), preview: prerelease ? BigInt(prerelease) : null };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] < b.core[index]) return -1;
    if (a.core[index] > b.core[index]) return 1;
  }
  if (a.preview === b.preview) return 0;
  if (a.preview === null) return 1;
  if (b.preview === null) return -1;
  return a.preview < b.preview ? -1 : 1;
}

export function validateQualification(qualification, candidate, mode) {
  return validateQualificationRegistry(qualification, candidate, mode);
}

function normalizeNotes(markdown) {
  if (Buffer.byteLength(markdown, "utf8") > 16_384) fail("notes_too_large", "release notes exceed 16 KiB");
  if (/https?:\/\/[^\s/@]+:[^\s/@]+@/i.test(markdown)) fail("secret_material", "release notes contain an authenticated URL");
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[#>*+-]+\s*/gm, "")
    .replace(/[`_*~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validateMatrixRecord(record, candidate) {
  if (
    record?.schemaVersion !== 1 || record?.result !== "passed" || record?.publicPromotionAllowed !== false ||
    record.source?.tag !== candidate.source.tag || record.source?.sha !== candidate.source.sha ||
    record.release?.version !== candidate.release.version || record.release?.channel !== candidate.release.channel ||
    JSON.stringify(record.targets) !== JSON.stringify(candidate.matrix.requiredTargets)
  ) fail("matrix_record_invalid", "private matrix authorization does not match the signed candidate");
}

export function preparePublication({ signedDirectory, notesMarkdown, qualification, mode, publishedAt, publicFiles = [] }) {
  const matrixPath = path.join(signedDirectory, "matrix.json");
  if (!fs.existsSync(matrixPath)) fail("matrix_record_missing", "private signed matrix record is missing");
  const matrix = readJson(matrixPath);
  const candidate = { schemaVersion: 1, source: matrix.source, release: matrix.release, matrix: {
    requiredTargets: matrix.targets,
    targets: matrix.targets.map((key) => ({ key })),
  } };
  if (!candidate.source?.tag || !candidate.source?.sha || !candidate.release?.version) {
    fail("matrix_record_invalid", "private matrix identity is incomplete");
  }
  const parsed = parseReleaseVersion(candidate.release.version);
  if (candidate.source.tag !== `v${parsed.version}` || candidate.release.channel !== parsed.channel ||
      candidate.release.githubPrerelease !== parsed.githubPrerelease || candidate.release.publicPromotionAllowed !== false) {
    fail("release_identity_mismatch", "tag, version, channel or GitHub flag disagree");
  }
  if (JSON.stringify(matrix.targets) !== JSON.stringify(REQUIRED_TARGETS)) {
    fail("matrix_incomplete", "the signed matrix does not contain the complete required target set");
  }
  validateMatrixRecord(matrix, candidate);
  const evidenceFiles = collectEvidenceFiles(signedDirectory);
  const evidence = evidenceFiles.map((file) => {
    const item = readJson(file);
    verifyEvidenceArtifacts(item, path.dirname(file));
    return item;
  });
  const ordered = verifyCompleteMatrix(evidence, candidate, { requiredPhase: "signed" });
  const gate = validateQualification(qualification, candidate, mode);
  if (mode === "production") {
    const validShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(publishedAt ?? "");
    const parsedDate = validShape ? new Date(publishedAt) : null;
    if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().replace(".000Z", "Z") !== publishedAt) {
      fail("publication_date_invalid", "production publication needs a valid fixed UTC timestamp");
    }
  }
  const names = new Set();
  const assets = [];
  const platforms = {};
  for (const item of ordered) {
    const updater = item.artifacts.find((artifact) => artifact.role === "updater" || artifact.role === "first-install-and-updater");
    const signature = item.artifacts.find((artifact) => artifact.role === "updater-signature");
    if (!updater || !signature) fail("artifact_missing", `${item.target} lacks updater bytes or signature`);
    const signatureText = fs.readFileSync(path.join(path.dirname(evidenceFiles.find((file) => readJson(file).target === item.target)), signature.fileName), "utf8").trim();
    if (!signatureText || Buffer.byteLength(signatureText, "utf8") > 4096) fail("signature_invalid", `${item.target} signature is empty or oversized`);
    for (const artifact of item.artifacts) {
      if (names.has(artifact.fileName) || SECRET_NAME.test(artifact.fileName) || SOURCE_ARCHIVE.test(artifact.fileName)) {
        fail("unsafe_asset", `asset name is duplicate or forbidden: ${artifact.fileName}`);
      }
      names.add(artifact.fileName);
      assets.push({ ...artifact, target: item.target, source: path.join(path.dirname(evidenceFiles.find((file) => readJson(file).target === item.target)), artifact.fileName) });
    }
    const url = `${PUBLIC_RELEASE_ORIGIN}/${candidate.source.tag}/${encodeURIComponent(updater.fileName)}`;
    platforms[item.target] = { signature: signatureText, url, size: updater.size };
  }
  const manifest = {
    version: candidate.release.version,
    notes: normalizeNotes(notesMarkdown),
    pub_date: mode === "production" ? publishedAt : null,
    platforms,
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(manifestBytes) > 262_144) fail("manifest_too_large", "manifest exceeds 256 KiB");
  const manifestHash = crypto.createHash("sha256").update(manifestBytes).digest("hex");
  if (names.has("latest.json")) fail("unsafe_asset", "latest.json collides with a package name");
  names.add("latest.json");
  assets.push({ role: "manifest", target: null, fileName: "latest.json", size: Buffer.byteLength(manifestBytes), sha256: manifestHash, content: manifestBytes });
  for (const item of publicFiles) {
    const fileName = path.basename(item.fileName ?? item.source);
    if (names.has(fileName) || SECRET_NAME.test(fileName) || SOURCE_ARCHIVE.test(fileName)) fail("unsafe_asset", `public file name is duplicate or forbidden: ${fileName}`);
    const bytes = fs.readFileSync(item.source);
    names.add(fileName);
    assets.push({ role: item.role, target: null, fileName, size: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: item.source });
  }
  if (names.has("SHA256SUMS")) fail("unsafe_asset", "SHA256SUMS collides with another asset name");
  const sums = assets.map((asset) => `${asset.sha256}  ${asset.fileName}`).sort().join("\n") + "\n";
  assets.push({ role: "hashes", target: null, fileName: "SHA256SUMS", size: Buffer.byteLength(sums), sha256: crypto.createHash("sha256").update(sums).digest("hex"), content: sums });
  return {
    schemaVersion: 1,
    mode,
    destination: PUBLIC_REPOSITORY,
    source: { tag: candidate.source.tag, sha: candidate.source.sha },
    release: { version: candidate.release.version, channel: candidate.release.channel, githubPrerelease: parsed.githubPrerelease, publishedAt: mode === "production" ? publishedAt : null },
    qualification: gate,
    notesMarkdown,
    manifest,
    manifestBytes,
    assets,
  };
}

export function feedsForPromotion(plan, current = {}) {
  if (plan.mode !== "production" || plan.qualification.productionAllowed !== true) {
    fail("promotion_forbidden", "only a qualified production plan may advance feeds");
  }
  const result = {};
  const consider = (channel) => {
    const existing = current[channel];
    if (!existing) return plan.manifestBytes;
    const comparison = compareReleaseVersions(plan.release.version, existing.version);
    if (comparison < 0) fail("feed_regression", `${channel} would regress from ${existing.version}`);
    if (comparison === 0) {
      const bytes = `${JSON.stringify(existing, null, 2)}\n`;
      if (bytes !== plan.manifestBytes) fail("feed_conflict", `${channel} already has different bytes for this version`);
      return null;
    }
    return plan.manifestBytes;
  };
  if (plan.release.channel === "preview") result.preview = consider("preview");
  else {
    result.stable = consider("stable");
    const preview = current.preview;
    result.preview = !preview || compareReleaseVersions(plan.release.version, preview.version) > 0 ? plan.manifestBytes : null;
  }
  return result;
}

export function updateFeedbackReadme(readme) {
  const guidance = `${GUIDANCE_START}\n## Downloads / Descargas\n\nSigned Windows x86-64 NSIS installers, Linux x86-64 AppImages and their application-update files are attached to each [GitOdile release](https://github.com/${PUBLIC_REPOSITORY}/releases). macOS is not yet qualified and no macOS package is published. Preview releases are marked as prereleases. Existing installers remain available for reinstall; a withdrawn update may stop appearing in the channel feed but is not silently replaced. Application source is maintained in a separate repository and signing material is never published.\n\nLos instaladores NSIS firmados para Windows x86-64, las AppImage para Linux x86-64 y sus archivos de actualización se adjuntan a cada [versión de GitOdile](https://github.com/${PUBLIC_REPOSITORY}/releases). macOS todavía no está cualificado y no se publica ningún paquete para macOS. Las versiones preview se marcan como preliminares. Los instaladores anteriores se conservan para reinstalar; una actualización retirada puede dejar de aparecer en el canal, pero no se sustituye silenciosamente. El código de la aplicación se mantiene en otro repositorio y el material de firma nunca se publica.\n${GUIDANCE_END}`;
  if (readme.includes(GUIDANCE_START)) {
    const pattern = new RegExp(`${GUIDANCE_START}[\\s\\S]*?${GUIDANCE_END}`);
    if (!pattern.test(readme)) fail("readme_contract", "download guidance markers are malformed");
    return readme.replace(pattern, guidance);
  }
  const cleaned = readme
    .replace("There is no source code here, and there are no pull requests to send. Issues,\n", "There is no application source code here, and there are no source pull requests to send. Issues,\n")
    .replace("El código de la aplicación es privado. Este repositorio no contiene código de\nla aplicación ni descargas.", "El código de la aplicación no se mantiene en este repositorio.");
  return `${cleaned.trimEnd()}\n\n${guidance}\n`;
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith("--") || argv[i + 1] === undefined) throw new Error(`invalid argument: ${argv[i] ?? "<missing>"}`);
    const key = argv[i].slice(2);
    if (key === "public-file") args.set(key, [...(args.get(key) ?? []), argv[i + 1]]);
    else args.set(key, argv[i + 1]);
  }
  return args;
}

export function runPrepareCli(argv) {
  const args = parseArgs(argv);
  const plan = preparePublication({
    signedDirectory: path.resolve(args.get("signed")),
    notesMarkdown: fs.readFileSync(path.resolve(args.get("notes")), "utf8"),
    qualification: readJson(path.resolve(args.get("qualification"))),
    mode: args.get("mode"),
    publishedAt: args.get("published-at") ?? null,
    publicFiles: (args.get("public-file") ?? []).map((value) => {
      const separator = value.indexOf("=");
      if (separator < 1) throw new Error("public-file must use role=path");
      return { role: value.slice(0, separator), source: path.resolve(value.slice(separator + 1)) };
    }),
  });
  const output = path.resolve(args.get("output"));
  fs.mkdirSync(output, { recursive: true });
  for (const asset of plan.assets) {
    const destination = path.join(output, asset.fileName);
    if (asset.content !== undefined) fs.writeFileSync(destination, asset.content, { flag: "wx" });
    else fs.copyFileSync(asset.source, destination, fs.constants.COPYFILE_EXCL);
  }
  const serializable = { ...plan, manifestBytes: undefined, assets: plan.assets.map(({ source, content, ...asset }) => asset) };
  fs.writeFileSync(path.join(output, "publication-plan.json"), `${JSON.stringify(serializable, null, 2)}\n`, { flag: "wx" });
  return plan;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const plan = runPrepareCli(process.argv.slice(2));
    process.stdout.write(`Prepared ${plan.mode} publication plan for ${plan.source.tag}.\n`);
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Public release preparation failed [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
