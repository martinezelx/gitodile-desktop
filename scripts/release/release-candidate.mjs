import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const updateContract = JSON.parse(
  fs.readFileSync(path.join(moduleRoot, "docs", "architecture", "065-9-1-app-update-contract.json"), "utf8"),
);
export const REQUIRED_TARGETS = Object.freeze(updateContract.targets.map((target) => target.key));
export const TARGET_CONTRACTS = Object.freeze(
  Object.fromEntries(updateContract.targets.map((target) => [target.key, Object.freeze({ ...target })])),
);
export const QUALIFICATION_PAIR = Object.freeze([...updateContract.validationBuilds]);

const STABLE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const PREVIEW = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-preview\.([1-9][0-9]*)$/;
const RELEASE_TAG = /^v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-preview\.[1-9][0-9]*)?)$/;

export class ReleaseValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReleaseValidationError";
    this.code = code;
  }
}

export function parseReleaseVersion(version) {
  if (STABLE.test(version)) return { version, channel: "stable", githubPrerelease: false };
  if (PREVIEW.test(version)) return { version, channel: "preview", githubPrerelease: true };
  throw new ReleaseValidationError("invalid_tag", `unsupported release version: ${version}`);
}

export function parseReleaseTag(tag) {
  const match = RELEASE_TAG.exec(tag);
  if (!match) {
    throw new ReleaseValidationError("invalid_tag", "tag must be exactly vX.Y.Z or vX.Y.Z-preview.N");
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

function readMetadata(root, revision) {
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
  claimedChannel = null,
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

  const metadata = readMetadata(root, metadataRevision ?? (requireHead ? null : sha));
  for (const [owner, version] of Object.entries(metadata)) {
    if (version !== release.version) {
      throw new ReleaseValidationError(
        "metadata_mismatch",
        `${owner} version ${version ?? "<missing>"} differs from tag version ${release.version}`,
      );
    }
  }
  if (claimedChannel !== null && claimedChannel !== release.channel) {
    throw new ReleaseValidationError("channel_mismatch", "claimed channel disagrees with the version-derived channel");
  }

  return {
    schemaVersion: 1,
    source: { tag, sha, approvedMainRef: mainRef },
    release: {
      ...release,
      purpose: QUALIFICATION_PAIR.includes(release.version) ? "qualification" : "release_candidate",
      signingProfile: QUALIFICATION_PAIR.includes(release.version) ? "validation" : "production",
      publicPromotionAllowed: false,
    },
    matrix: {
      requiredTargets: [...REQUIRED_TARGETS],
      targets: updateContract.targets.map(({ key, rustTarget }) => ({ key, rustTarget })),
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
  if (event !== "push") {
    throw new ReleaseValidationError("invalid_event", "release candidates can only originate from a tag push");
  }
  const tag = args.get("tag");
  if (environment.GITHUB_REF_TYPE && environment.GITHUB_REF_TYPE !== "tag") {
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
      `Validated ${candidate.source.tag} at ${candidate.source.sha} for ${candidate.release.channel}.\n`,
    );
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Release candidate validation failed [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
