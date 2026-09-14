import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feedsForPromotion, PUBLIC_REPOSITORY, updateFeedbackReadme } from "./public-release.mjs";
import { ReleaseValidationError } from "./release-candidate.mjs";

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export const RELEASE_PIPELINE = Object.freeze({
  path: ".github/workflows/release-pipeline.yml",
  event: "workflow_dispatch",
  // The workflow declares `run-name`, and the Actions API then reports that
  // per-run title in `name` rather than the workflow name.
  runName: /^Release v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-preview\.[1-9][0-9]*)? at [0-9a-f]{40}$/,
});

/** The signed bytes come from the same run that publishes them, so the run is
 * still in progress when this is checked; a completed run is only accepted as
 * a success. The workflow path, event and branch identify the release
 * pipeline loaded from protected `main`. */
export function validateSourceRun(run, expectedRepository) {
  const healthy = (run?.status === "in_progress" && run?.conclusion === null) ||
    (run?.status === "completed" && run?.conclusion === "success");
  if (
    !Number.isSafeInteger(run?.id) || run.id <= 0 ||
    typeof run?.name !== "string" || !RELEASE_PIPELINE.runName.test(run.name) ||
    run?.event !== RELEASE_PIPELINE.event ||
    !healthy || run?.repository?.full_name !== expectedRepository ||
    run?.path !== RELEASE_PIPELINE.path || run?.head_branch !== "main"
  ) fail("source_run_invalid", "artifact source is not a healthy release pipeline run on main");
  return true;
}

export function reconcileAssets(expected, existing, downloadedHashes, finalized) {
  const byName = new Map(existing.map((asset) => [asset.name, asset]));
  if (byName.size !== existing.length) fail("asset_conflict", "release contains duplicate asset names");
  const expectedNames = new Set(expected.map((asset) => asset.fileName));
  for (const asset of existing) {
    if (!expectedNames.has(asset.name)) fail("asset_conflict", `release contains unexpected asset ${asset.name}`);
  }
  const upload = [];
  for (const asset of expected) {
    const remote = byName.get(asset.fileName);
    if (!remote) {
      if (finalized) fail("finalized_asset_missing", `finalized release lacks ${asset.fileName}`);
      upload.push(asset);
      continue;
    }
    if (remote.size !== asset.size || downloadedHashes.get(asset.fileName) !== asset.sha256) {
      fail("immutable_asset_conflict", `published asset differs: ${asset.fileName}`);
    }
  }
  return upload;
}

class GitHubClient {
  constructor(token, fetchImpl = fetch) {
    if (!token) fail("credentials_unavailable", "missing destination credential name: GITODILE_PUBLIC_RELEASE_TOKEN");
    this.token = token;
    this.fetch = fetchImpl;
  }

  async request(url, options = {}, accepted = [200]) {
    const response = await this.fetch(url.startsWith("https://") ? url : `https://api.github.com${url}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "User-Agent": "GitOdile-public-release-publisher",
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
      signal: AbortSignal.timeout(30_000),
      redirect: options.redirect ?? "error",
    });
    if (!accepted.includes(response.status)) fail("github_api", `GitHub ${options.method ?? "GET"} ${url} returned HTTP ${response.status}`);
    if (response.status === 204) return null;
    return response.json();
  }

  api(pathname, options, accepted) {
    return this.request(`/repos/${PUBLIC_REPOSITORY}${pathname}`, options, accepted);
  }

  async assetHash(url) {
    const response = await this.fetch(url, {
      headers: { Accept: "application/octet-stream", Authorization: `Bearer ${this.token}`, "User-Agent": "GitOdile-public-release-publisher", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(60_000), redirect: "follow",
    });
    if (!response.ok) fail("github_api", `authenticated asset download returned HTTP ${response.status}`);
    return sha256(Buffer.from(await response.arrayBuffer()));
  }
}

export async function anonymousHash(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: { "User-Agent": "GitOdile-anonymous-release-check" }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!response.ok) fail("anonymous_download_failed", `anonymous download returned HTTP ${response.status}`);
  return sha256(Buffer.from(await response.arrayBuffer()));
}

/** `GET /releases/tags/{tag}` only resolves published releases: a draft is
 * not bound to its tag until it is published, so reconciling an interrupted
 * publication has to list releases (drafts included, which the destination
 * credential can read) and match the tag name. */
async function releaseByTag(client, tag) {
  for (let page = 1; page <= 10; page += 1) {
    const releases = await client.api(`/releases?per_page=100&page=${page}`);
    const matches = releases.filter((release) => release.tag_name === tag);
    if (matches.length > 1) fail("release_conflict", `destination holds ${matches.length} releases named ${tag}`);
    if (matches.length === 1) return matches[0];
    if (releases.length < 100) return null;
  }
  fail("release_conflict", "destination release list is unexpectedly long");
}

async function publicMain(client) {
  const repository = await client.api("");
  if (repository.visibility !== "public" || repository.archived || repository.default_branch !== "main") {
    fail("destination_invalid", "feedback destination must be the active public main repository");
  }
  const ref = await client.api("/git/ref/heads/main");
  return ref.object.sha;
}

async function ensurePublicTag(client, tag, mainSha) {
  try {
    const ref = await client.api(`/git/ref/tags/${encodeURIComponent(tag)}`);
    if (ref.object.type !== "commit") fail("public_tag_conflict", "public release tag is not a public commit");
  } catch (error) {
    if (!(error instanceof ReleaseValidationError) || !/HTTP 404/.test(error.message)) throw error;
    await client.api("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/tags/${tag}`, sha: mainSha }) }, [201]);
  }
}

async function downloadExistingHashes(release, expected, fetchImpl = fetch) {
  const hashes = new Map();
  for (const asset of release.assets ?? []) {
    if (expected.some((item) => item.fileName === asset.name)) hashes.set(asset.name, await anonymousHash(asset.browser_download_url, fetchImpl));
  }
  return hashes;
}

async function uploadAsset(client, release, directory, asset) {
  const bytes = fs.readFileSync(path.join(directory, asset.fileName));
  if (bytes.length !== asset.size || sha256(bytes) !== asset.sha256) fail("local_asset_changed", `staged asset differs: ${asset.fileName}`);
  const uploadUrl = release.upload_url.replace("{?name,label}", `?name=${encodeURIComponent(asset.fileName)}`);
  await client.request(uploadUrl, { method: "POST", headers: { Accept: "application/vnd.github+json", "Content-Type": "application/octet-stream" }, body: bytes }, [201]);
}

async function readPublicFile(client, file) {
  try {
    const value = await client.api(`/contents/${file}?ref=main`);
    if (value.encoding !== "base64") fail("destination_invalid", `${file} has unexpected encoding`);
    return { bytes: Buffer.from(value.content, "base64"), sha: value.sha };
  } catch (error) {
    if (error instanceof ReleaseValidationError && /HTTP 404/.test(error.message)) return null;
    throw error;
  }
}

export async function atomicPublicCommit(client, baseSha, files, message) {
  const base = await client.api(`/git/commits/${baseSha}`);
  const tree = [];
  for (const [file, bytes] of Object.entries(files)) {
    const blob = await client.api("/git/blobs", { method: "POST", body: JSON.stringify({ content: Buffer.from(bytes).toString("base64"), encoding: "base64" }) }, [201]);
    tree.push({ path: file, mode: "100644", type: "blob", sha: blob.sha });
  }
  const nextTree = await client.api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree }) }, [201]);
  const commit = await client.api("/git/commits", { method: "POST", body: JSON.stringify({ message, tree: nextTree.sha, parents: [baseSha] }) }, [201]);
  await client.api("/git/refs/heads/main", { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) }, [200]);
  return commit.sha;
}

async function loadCurrentFeeds(client) {
  const result = {};
  for (const channel of ["stable", "preview"]) {
    const file = await readPublicFile(client, `updates/${channel}.json`);
    if (file) result[channel] = JSON.parse(file.bytes.toString("utf8"));
  }
  return result;
}

export async function publish({ directory, token, sourceRun, sourceRepository, fetchImpl = fetch }) {
  validateSourceRun(sourceRun, sourceRepository);
  const plan = JSON.parse(fs.readFileSync(path.join(directory, "publication-plan.json"), "utf8"));
  if (plan.destination !== PUBLIC_REPOSITORY) fail("destination_invalid", "publication plan targets another repository");
  const client = new GitHubClient(token, fetchImpl);
  let mainSha = await publicMain(client);
  let release = await releaseByTag(client, plan.source.tag);
  if (!release) {
    await ensurePublicTag(client, plan.source.tag, mainSha);
    release = await client.api("/releases", { method: "POST", body: JSON.stringify({
      tag_name: plan.source.tag, target_commitish: mainSha, name: `GitOdile ${plan.release.version}`,
      body: plan.notesMarkdown, draft: true, prerelease: plan.release.githubPrerelease,
    }) }, [201]);
  } else if (release.tag_name !== plan.source.tag || release.prerelease !== plan.release.githubPrerelease || release.body !== plan.notesMarkdown) {
    fail("release_conflict", "existing release metadata differs from the immutable plan");
  }
  const hashes = release.draft ? new Map() : await downloadExistingHashes(release, plan.assets, fetchImpl);
  if (release.draft) {
    for (const asset of release.assets ?? []) {
      if (plan.assets.some((item) => item.fileName === asset.name)) hashes.set(asset.name, await client.assetHash(asset.url));
    }
  }
  for (const asset of reconcileAssets(plan.assets, release.assets ?? [], hashes, !release.draft)) await uploadAsset(client, release, directory, asset);
  release = await client.api(`/releases/${release.id}`);
  if (release.draft) release = await client.api(`/releases/${release.id}`, { method: "PATCH", body: JSON.stringify({ draft: false, prerelease: plan.release.githubPrerelease }) }, [200]);
  const freshHashes = await downloadExistingHashes(release, plan.assets, fetchImpl);
  reconcileAssets(plan.assets, release.assets ?? [], freshHashes, true);
  const currentFeeds = await loadCurrentFeeds(client);
  const feeds = feedsForPromotion({ ...plan, manifestBytes: fs.readFileSync(path.join(directory, "latest.json"), "utf8") }, currentFeeds);
  const files = Object.fromEntries(Object.entries(feeds).filter(([, bytes]) => bytes !== null).map(([channel, bytes]) => [`updates/${channel}.json`, bytes]));
  const readme = await readPublicFile(client, "README.md");
  if (!readme) fail("readme_contract", "public feedback README is missing");
  const nextReadme = updateFeedbackReadme(readme.bytes.toString("utf8"));
  if (nextReadme !== readme.bytes.toString("utf8")) files["README.md"] = nextReadme;
  if (Object.keys(files).length > 0) {
    mainSha = await atomicPublicCommit(client, mainSha, files, `release: publish GitOdile ${plan.release.version}`);
  }
  return { state: "published", releaseId: release.id, publicCommit: mainSha, feedsChanged: Object.keys(feeds).filter((key) => feeds[key] !== null) };
}

function parseArgs(argv) {
  const result = new Map();
  for (let i = 0; i < argv.length; i += 2) result.set(argv[i]?.replace(/^--/, ""), argv[i + 1]);
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const sourceRun = JSON.parse(fs.readFileSync(path.resolve(args.get("source-run")), "utf8"));
    const result = await publish({ directory: path.resolve(args.get("directory")), token: process.env.GITODILE_PUBLIC_RELEASE_TOKEN, sourceRun, sourceRepository: args.get("source-repository") });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Public release failed [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
