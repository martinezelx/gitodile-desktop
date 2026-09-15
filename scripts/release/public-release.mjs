import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareReleaseVersions, parseReleaseVersion, ReleaseValidationError, REQUIRED_TARGETS } from "./release-candidate.mjs";
import { verifyCompleteMatrix, verifyEvidenceArtifacts } from "./release-evidence.mjs";
import { qualifiedPreviewAllowed, validateQualificationRegistry } from "./qualification-evidence.mjs";

export const PUBLIC_REPOSITORY = "martinezelx/gitodile";
export const PUBLIC_RELEASE_ORIGIN = `https://github.com/${PUBLIC_REPOSITORY}/releases/download`;
export const GUIDANCE_START = "<!-- gitodile-downloads:start -->";
export const GUIDANCE_END = "<!-- gitodile-downloads:end -->";
const SOURCE_ARCHIVE = /(?:^|[-_.])(source|src)(?:[-_.]|$)/i;
const SECRET_NAME = /(?:private[-_.]?key|certificate|credential|secret|token|source[-_.]?archive)/i;
export const PREVIEW_TESTING_NOTICE = "> Testing preview: Windows and Linux installed-update qualification is not complete. This prerelease does not claim platform qualification. Windows Authenticode is deferred.\n\n> Preview de prueba: la cualificación de actualización instalada en Windows y Linux no está completa. Esta versión preliminar no declara cualificación de plataforma. Authenticode de Windows está aplazado.";

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

export { compareReleaseVersions };

export function validateQualification(qualification, candidate, mode) {
  return validateQualificationRegistry(qualification, candidate, mode);
}

/** Plain text for the manifest that keeps the notes' structure. Markdown's
 * soft line breaks (the hard-wrapped lines of one paragraph or list item)
 * become spaces; block boundaries stay: one newline between list items, a
 * blank line between paragraphs. The app renders the text pre-wrapped, so
 * what is a paragraph here is a paragraph in the update dialog. */
export function normalizeNotes(markdown) {
  if (Buffer.byteLength(markdown, "utf8") > 16_384) fail("notes_too_large", "release notes exceed 16 KiB");
  if (/https?:\/\/[^\s/@]+:[^\s/@]+@/i.test(markdown)) fail("secret_material", "release notes contain an authenticated URL");
  const inline = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^(\s*)[*+]\s+/gm, "$1- ")
    .replace(/[`_*~]/g, "");
  const blocks = [];
  let current = null;
  for (const raw of inline.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line === "" || /^[-=]{3,}$/.test(line)) { current = null; continue; }
    const heading = line.match(/^#+\s*(.*)$/);
    if (heading) {
      current = null;
      if (heading[1]) blocks.push({ kind: "paragraph", text: heading[1] });
      continue;
    }
    const item = line.match(/^(?:-|\d+[.)])\s+(.*)$/);
    if (item) {
      current = { kind: "item", text: item[1] };
      blocks.push(current);
      continue;
    }
    const text = line.replace(/^>\s*/, "");
    if (!text) continue;
    if (current) current.text += ` ${text}`;
    else {
      current = { kind: "paragraph", text };
      blocks.push(current);
    }
  }
  return blocks
    .map((block, index) => {
      const previous = blocks[index - 1];
      const separator = !previous ? "" : previous.kind === "item" && block.kind === "item" ? "\n" : "\n\n";
      return `${separator}${block.kind === "item" ? `- ${block.text}` : block.text}`;
    })
    .join("")
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

export const PUBLICATION_MODES = Object.freeze(["preview-testing", "preview-qualified", "production"]);
/** Assets rendered by the `publish` job once the release's real publication
 * time is known: the manifest carries it as `pub_date`, and the hash list
 * covers the manifest. Every other asset is fixed when the plan is prepared. */
export const DERIVED_ASSET_NAMES = Object.freeze(["latest.json", "SHA256SUMS"]);

/** The mode is derived, never chosen. A stable candidate is `production`. A
 * preview is `preview-qualified` only when the registry already proves every
 * enabled target and production approval — then it publishes without the
 * testing notice — and `preview-testing` otherwise. Anything short of a fully
 * qualified registry keeps the notice. */
export function derivePublicationMode(release, qualification) {
  if (release?.channel !== "preview" || release?.githubPrerelease !== true) return "production";
  return qualifiedPreviewAllowed(qualification) ? "preview-qualified" : "preview-testing";
}

export function preparePublication({ signedDirectory, notesMarkdown, qualification, mode, publicFiles = [] }) {
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
  const publishedNotes = mode === "preview-testing" ? `${PREVIEW_TESTING_NOTICE}\n\n${notesMarkdown}` : notesMarkdown;
  const names = new Set(DERIVED_ASSET_NAMES);
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
  // The manifest is fixed except for `pub_date`, which is the release's real
  // publication time and therefore known only to the `publish` job.
  const manifest = {
    version: candidate.release.version,
    notes: normalizeNotes(publishedNotes),
    platforms,
  };
  // Size is checked here, before the pipeline stages anything; the epoch
  // placeholder has the same length as any real timestamp.
  renderPublication({ manifest, assets }, "1970-01-01T00:00:00Z");
  for (const item of publicFiles) {
    const fileName = path.basename(item.fileName ?? item.source);
    if (names.has(fileName) || SECRET_NAME.test(fileName) || SOURCE_ARCHIVE.test(fileName)) fail("unsafe_asset", `public file name is duplicate or forbidden: ${fileName}`);
    const bytes = fs.readFileSync(item.source);
    names.add(fileName);
    assets.push({ role: item.role, target: null, fileName, size: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: item.source });
  }
  return {
    schemaVersion: 2,
    mode,
    destination: PUBLIC_REPOSITORY,
    source: { tag: candidate.source.tag, sha: candidate.source.sha },
    release: { version: candidate.release.version, channel: candidate.release.channel, githubPrerelease: parsed.githubPrerelease },
    qualification: gate,
    notesMarkdown: publishedNotes,
    manifest,
    assets,
  };
}

/** Completes a plan with the publication time GitHub recorded for the
 * release. The same plan and the same `published_at` render byte-identical
 * assets, which is what lets a reconciliation retry compare rather than
 * rewrite. Returns the channel manifest bytes and the two derived assets. */
export function renderPublication(plan, publishedAt) {
  const validShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(publishedAt ?? "");
  const parsedDate = validShape ? new Date(publishedAt) : null;
  if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().replace(".000Z", "Z") !== publishedAt) {
    fail("publication_date_invalid", "feed publication needs the release's canonical UTC publication timestamp");
  }
  const manifest = { version: plan.manifest.version, notes: plan.manifest.notes, pub_date: publishedAt, platforms: plan.manifest.platforms };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(manifestBytes) > 262_144) fail("manifest_too_large", "manifest exceeds 256 KiB");
  const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
  const manifestAsset = { role: "manifest", target: null, fileName: "latest.json", size: Buffer.byteLength(manifestBytes), sha256: sha256(manifestBytes), content: manifestBytes };
  const sums = [...plan.assets, manifestAsset].map((asset) => `${asset.sha256}  ${asset.fileName}`).sort().join("\n") + "\n";
  const sumsAsset = { role: "hashes", target: null, fileName: "SHA256SUMS", size: Buffer.byteLength(sums), sha256: sha256(sums), content: sums };
  return { manifest, manifestBytes, assets: [manifestAsset, sumsAsset] };
}

export function feedsForPromotion(plan, current = {}) {
  const previewTesting = plan.mode === "preview-testing" && plan.qualification.previewTestingAllowed === true;
  const previewQualified = plan.mode === "preview-qualified" && plan.qualification.previewQualifiedAllowed === true;
  const production = plan.mode === "production" && plan.qualification.productionAllowed === true;
  if (!previewTesting && !previewQualified && !production) {
    fail("promotion_forbidden", "only an approved preview-testing, qualified preview or qualified production plan may advance feeds");
  }
  if ((previewTesting || previewQualified) && (plan.release.channel !== "preview" || plan.release.githubPrerelease !== true)) {
    fail("promotion_forbidden", "a preview mode can never publish a stable release or feed");
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
  const guidance = `${GUIDANCE_START}\n## Downloads / Descargas\n\nTauri updater-signed Windows x86-64 NSIS installers, Linux x86-64 AppImages and their application-update files are attached to each [GitOdile release](https://github.com/${PUBLIC_REPOSITORY}/releases). Preview-testing releases may be public before installed-update qualification is complete; a prerelease label is not a qualification claim. Windows packages through 1.0.0 intentionally lack Authenticode and may show SmartScreen or unknown-publisher warnings. macOS is not yet qualified and no macOS package is published. Preview releases are marked as prereleases. Existing installers remain available for reinstall; a withdrawn update may stop appearing in the channel feed but is not silently replaced. [Application source](https://github.com/martinezelx/gitodile-desktop) is maintained separately and signing material is never published.\n\nLos instaladores NSIS de Windows x86-64 firmados para el actualizador de Tauri, las AppImage para Linux x86-64 y sus archivos de actualización se adjuntan a cada [versión de GitOdile](https://github.com/${PUBLIC_REPOSITORY}/releases). Las versiones preview-testing pueden ser públicas antes de completar la cualificación de actualización instalada; la etiqueta preliminar no declara cualificación. Los paquetes de Windows hasta 1.0.0 carecen intencionadamente de Authenticode y pueden mostrar avisos de SmartScreen o de editor desconocido. macOS todavía no está cualificado y no se publica ningún paquete para macOS. Las versiones preview se marcan como preliminares. Los instaladores anteriores se conservan para reinstalar; una actualización retirada puede dejar de aparecer en el canal, pero no se sustituye silenciosamente. El [código de la aplicación](https://github.com/martinezelx/gitodile-desktop) se mantiene por separado y el material de firma nunca se publica.\n${GUIDANCE_END}`;
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
  const serializable = { ...plan, assets: plan.assets.map(({ source, content, ...asset }) => asset) };
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
