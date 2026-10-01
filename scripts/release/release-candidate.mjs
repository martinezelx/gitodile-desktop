import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const updateContract = JSON.parse(
  fs.readFileSync(path.join(moduleRoot, "docs", "architecture", "065-9-1-app-update-contract.json"), "utf8"),
);
export const ALL_TARGETS = Object.freeze(updateContract.targets.map((target) => target.key));
export const REQUIRED_TARGETS = Object.freeze(
  updateContract.targets.filter((target) => target.releaseEnabled).map((target) => target.key),
);
export const TARGET_CONTRACTS = Object.freeze(
  Object.fromEntries(updateContract.targets.map((target) => [target.key, Object.freeze({ ...target })])),
);

const RELEASE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
/** Every version up to `0.3.0-preview.1` was a preview of the retired
 * two-channel model. History, installed builds and the legacy feed still
 * carry the shape, so it stays readable; it is never released again. */
const LEGACY_PREVIEW = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-preview\.([1-9][0-9]*)$/;
const RELEASE_TAG = /^v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))$/;

export class ReleaseValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReleaseValidationError";
    this.code = code;
  }
}

/** A version that may be released: plain `X.Y.Z`. There is one channel, so
 * a release carries no channel and is never a GitHub prerelease. */
export function parseReleaseVersion(version) {
  if (RELEASE.test(version)) return { version };
  throw new ReleaseValidationError("invalid_tag", `unsupported release version: ${version} (releases are X.Y.Z)`);
}

/** A version the scripts may meet in history: a release, or a legacy
 * `X.Y.Z-preview.N` from before the single channel. */
export function parseKnownVersion(version) {
  if (RELEASE.test(version)) return { version, legacyPreview: false };
  if (LEGACY_PREVIEW.test(version)) return { version, legacyPreview: true };
  throw new ReleaseValidationError("invalid_tag", `unsupported version: ${version}`);
}

/** SemVer order over releases and legacy previews: every `X.Y.Z-preview.N`
 * precedes its `X.Y.Z` release. */
export function compareReleaseVersions(left, right) {
  const parse = (version) => {
    parseKnownVersion(version);
    const [core, prerelease] = version.split("-preview.");
    return { core: core.split(".").map(BigInt), preview: prerelease ? BigInt(prerelease) : null };
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

export function parseReleaseTag(tag) {
  const match = RELEASE_TAG.exec(tag);
  if (!match) {
    throw new ReleaseValidationError("invalid_tag", "tag must be exactly vX.Y.Z");
  }
  return parseReleaseVersion(match[1]);
}

function runGit(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) {
    throw new ReleaseValidationError("git_error", `git ${args[0]} failed`);
  }
  return result;
}

function gitText(root, args) {
  return runGit(root, args).stdout.trim();
}

function readAtRevision(root, revision, relativePath) {
  const result = runGit(root, ["show", `${revision}:${relativePath.replaceAll("\\", "/")}`], {
    allowFailure: true,
  });
  if (result.status !== 0) {
    throw new ReleaseValidationError("metadata_missing", `required metadata is missing: ${relativePath}`);
  }
  return result.stdout;
}

export function readReleaseMetadata(root, revision = null) {
  const read = revision
    ? (relativePath) => readAtRevision(root, revision, relativePath)
    : (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
  const packageJson = JSON.parse(read("package.json"));
  const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
  const cargoToml = read("src-tauri/Cargo.toml");
  const cargoLock = read("src-tauri/Cargo.lock");
  const cargoVersion = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
  const lockVersion = cargoLock.match(/^name = "gitodile"\r?\nversion = "([^"]+)"/m)?.[1];
  return {
    "package.json": packageJson.version,
    "src-tauri/Cargo.toml": cargoVersion,
    "src-tauri/Cargo.lock": lockVersion,
    "src-tauri/tauri.conf.json": tauri.version,
  };
}

export function validateReleaseCandidate({
  root,
  tag,
  sha,
  mainRef = "refs/remotes/origin/main",
  metadataRevision = null,
  requireHead = true,
}) {
  const release = parseReleaseTag(tag);
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(sha)) {
    throw new ReleaseValidationError("invalid_revision", "source revision must be a full lowercase object ID");
  }

  const tagRevision = gitText(root, ["rev-parse", `${tag}^{commit}`]);
  if (tagRevision !== sha) {
    throw new ReleaseValidationError("revision_mismatch", "tag does not resolve to the requested source revision");
  }
  if (requireHead && gitText(root, ["rev-parse", "HEAD"]) !== sha) {
    throw new ReleaseValidationError("revision_mismatch", "checked-out HEAD differs from the tagged source revision");
  }
  if (runGit(root, ["merge-base", "--is-ancestor", sha, mainRef], { allowFailure: true }).status !== 0) {
    throw new ReleaseValidationError("wrong_ancestry", "tagged source revision is not in approved main history");
  }

  const metadata = readReleaseMetadata(root, metadataRevision ?? (requireHead ? null : sha));
  for (const [owner, version] of Object.entries(metadata)) {
    if (version !== release.version) {
      throw new ReleaseValidationError(
        "metadata_mismatch",
        `${owner} version ${version ?? "<missing>"} differs from tag version ${release.version}`,
      );
    }
  }

  return {
    schemaVersion: 1,
    source: { tag, sha, approvedMainRef: mainRef },
    release: {
      ...release,
      publicPromotionAllowed: false,
    },
    matrix: {
      requiredTargets: [...REQUIRED_TARGETS],
      targets: updateContract.targets
        .filter((target) => target.releaseEnabled)
        .map(({ key, rustTarget }) => ({ key, rustTarget })),
    },
  };
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) throw new Error(`invalid argument: ${name ?? "<missing>"}`);
    args.set(name.slice(2), value);
  }
  return args;
}

export function runCandidateCli(argv, environment = process.env) {
  const args = parseArgs(argv);
  const event = args.get("event");
  if (event !== "coordinator_dispatch") {
    throw new ReleaseValidationError("invalid_event", "release candidates require a trusted merge-coordinator dispatch");
  }
  const tag = args.get("tag");
  const refType = args.get("ref-type") ?? environment.GITHUB_REF_TYPE;
  if (refType && refType !== "tag") {
    throw new ReleaseValidationError("invalid_event", "release candidate ref must be a tag");
  }
  const candidate = validateReleaseCandidate({
    root: path.resolve(args.get("root") ?? "."),
    tag,
    sha: args.get("sha"),
    mainRef: args.get("main-ref") ?? "refs/remotes/origin/main",
    metadataRevision: args.get("metadata-revision") ?? null,
    requireHead: args.get("require-head") !== "false",
  });
  const output = args.get("output");
  if (output) fs.writeFileSync(output, `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx" });
  return candidate;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const candidate = runCandidateCli(process.argv.slice(2));
    process.stdout.write(
      `Validated ${candidate.source.tag} at ${candidate.source.sha}.\n`,
    );
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Release candidate validation failed [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
