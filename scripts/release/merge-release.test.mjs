import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  decideTag,
  parseReleaseBranch,
  REQUIRED_RELEASE_CHECKS,
  SOURCE_REPOSITORY,
  validateAuthorization,
  validateMergedPullRequest,
  validateReleasePreparation,
  validateRequiredChecks,
} from "./merge-release.mjs";
import { NOTES_PLACEHOLDER, parseCommandLine, prepareRelease } from "./release-prepare.mjs";
import { applyHighlightsBlock, renderHighlightsBlock, scaffoldHighlights } from "./highlights.mjs";
import { ReleaseValidationError } from "./release-candidate.mjs";

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => error instanceof ReleaseValidationError && error.code === code);
}

function writeVersion(root, version, notes = null, highlights = scaffoldHighlights(version, "2026-09-15")) {
  fs.mkdirSync(path.join(root, "src-tauri"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs", "release", "notes"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs", "release", "highlights"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ name: "gitodile", version }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "src-tauri", "Cargo.toml"), `[package]\nname = "gitodile"\nversion = "${version}"\n`);
  fs.writeFileSync(path.join(root, "src-tauri", "Cargo.lock"), `name = "gitodile"\nversion = "${version}"\n`);
  fs.writeFileSync(path.join(root, "src-tauri", "tauri.conf.json"), `${JSON.stringify({ version }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "README.md"), `Current development version: **${version}**.\n`);
  if (notes !== null) fs.writeFileSync(path.join(root, "docs", "release", "notes", `v${version}.md`), notes);
  if (highlights !== null) fs.writeFileSync(path.join(root, "docs", "release", "highlights", `v${version}.json`), highlights);
}

function repository(baseline = "0.2.5") {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "gitodile-merge-release-"));
  const bare = path.join(parent, "origin.git");
  const root = path.join(parent, "work");
  git(parent, "init", "--bare", bare);
  git(parent, "init", "-b", "main", root);
  git(root, "config", "user.email", "release@example.invalid");
  git(root, "config", "user.name", "Release Test");
  writeVersion(root, baseline);
  git(root, "add", ".");
  git(root, "commit", "-m", "baseline");
  git(root, "remote", "add", "origin", bare);
  git(root, "push", "-u", "origin", "main");
  return { root, bare };
}

function pull(overrides = {}) {
  const version = overrides.version ?? "0.3.0";
  const repository = { full_name: SOURCE_REPOSITORY };
  return {
    action: "closed",
    repository,
    pull_request: {
      number: 65,
      merged: true,
      merge_commit_sha: "a".repeat(40),
      base: { ref: "main", repo: repository },
      head: { ref: `release/${version}`, repo: repository },
      ...overrides.pull_request,
    },
    ...overrides.event,
  };
}

test("release branch grammar accepts only canonical X.Y.Z releases", () => {
  assert.deepEqual(parseReleaseBranch("release/0.3.0"), {
    version: "0.3.0", branch: "release/0.3.0", tag: "v0.3.0",
  });
  for (const branch of ["0.3.0", "release/v0.3.0", "release/0.3.0-beta.1", "release/0.2.0-rc.0", "release/03.0.0", "feature/x"]) {
    assert.throws(() => parseReleaseBranch(branch), ReleaseValidationError);
  }
});

test("merged PR validation rejects forks, wrong bases, unmerged events and renamed branches", () => {
  assert.equal(validateMergedPullRequest(pull()).tag, "v0.3.0");
  expectCode("invalid_event", () => validateMergedPullRequest(pull({ event: { action: "opened" } })));
  expectCode("invalid_pull_request", () => validateMergedPullRequest(pull({ pull_request: { merged: false } })));
  expectCode("invalid_pull_request", () => validateMergedPullRequest(pull({ pull_request: { base: { ref: "develop", repo: { full_name: SOURCE_REPOSITORY } } } })));
  expectCode("invalid_pull_request", () => validateMergedPullRequest(pull({ pull_request: { head: { ref: "release/0.3.0", repo: { full_name: "someone/fork" } } } })));
  assert.throws(() => validateMergedPullRequest(pull({ pull_request: { head: { ref: "releases/0.3.0", repo: { full_name: SOURCE_REPOSITORY } } } })), ReleaseValidationError);
});

test("every exact required check must complete successfully", () => {
  const checks = REQUIRED_RELEASE_CHECKS.map((name, index) => ({ id: index + 1, name, status: "completed", conclusion: "success" }));
  assert.equal(validateRequiredChecks(checks).length, REQUIRED_RELEASE_CHECKS.length);
  expectCode("required_checks_pending", () => validateRequiredChecks(checks.slice(1)));
  expectCode("required_check_failed", () => validateRequiredChecks(checks.with(0, { ...checks[0], conclusion: "failure" })));
  expectCode("required_checks_pending", () => validateRequiredChecks(checks.with(0, { ...checks[0], status: "in_progress", conclusion: null })));
  const retried = [...checks, { ...checks[0], id: 999, conclusion: "failure" }];
  expectCode("required_check_failed", () => validateRequiredChecks(retried));
});

test("tag reconciliation is idempotent only for the exact commit", () => {
  const sha = "b".repeat(40);
  assert.equal(decideTag(null, sha), "create");
  assert.equal(decideTag(sha, sha), "existing");
  expectCode("tag_conflict", () => decideTag("c".repeat(40), sha));
  expectCode("tag_conflict", () => decideTag("not-a-commit", sha));
});

test("release preparation writes every authority on a new clean current branch and never pushes", () => {
  const repo = repository();
  const result = prepareRelease({ root: repo.root, version: "0.3.0", runChecks: false, expectedOrigin: repo.bare });
  assert.equal(result.branch, "release/0.3.0");
  assert.equal(git(repo.root, "branch", "--show-current"), result.branch);
  const notes = fs.readFileSync(path.join(repo.root, result.notes), "utf8");
  assert.match(notes, new RegExp(NOTES_PLACEHOLDER));
  // The notes start with the block for the empty list, so the coordinator's
  // notes/highlights agreement holds from the first commit on the branch.
  assert.equal(notes, `# GitOdile 0.3.0\n\n${renderHighlightsBlock([])}\n\n<!-- ${NOTES_PLACEHOLDER} -->\n`);
  const highlights = JSON.parse(fs.readFileSync(path.join(repo.root, result.highlights), "utf8"));
  assert.equal(highlights.version, "0.3.0");
  assert.match(highlights.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(highlights.highlights, []);
  // The previous version was never tagged in this fixture, so no hint list.
  assert.deepEqual(result.changesSince, []);
  assert.equal(git(repo.root, "ls-remote", "--heads", "origin", result.branch), "");
  for (const file of ["package.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/tauri.conf.json", "README.md"]) {
    assert.match(fs.readFileSync(path.join(repo.root, file), "utf8"), /0\.3\.0/);
  }
});

test("release preparation takes one version, with or without pnpm's forwarded separator", () => {
  assert.deepEqual(parseCommandLine(["0.3.1"]), { version: "0.3.1" });
  assert.deepEqual(parseCommandLine(["--", "0.3.1"]), { version: "0.3.1" });
  expectCode("usage", () => parseCommandLine([]));
  expectCode("usage", () => parseCommandLine(["--"]));
  expectCode("usage", () => parseCommandLine(["0.3.1", "extra"]));
});

test("release preparation turns a work branch into the release branch in place", () => {
  const repo = repository();
  git(repo.root, "switch", "-c", "feature/work");
  fs.writeFileSync(path.join(repo.root, "feature.txt"), "product work\n");
  git(repo.root, "add", ".");
  git(repo.root, "commit", "-m", "feat: product work");
  const work = git(repo.root, "rev-parse", "HEAD");
  const result = prepareRelease({ root: repo.root, version: "0.3.0", runChecks: false, expectedOrigin: repo.bare });
  assert.equal(result.branch, "release/0.3.0");
  assert.equal(result.renamedFrom, "feature/work");
  assert.equal(git(repo.root, "branch", "--show-current"), result.branch);
  assert.equal(git(repo.root, "rev-parse", "HEAD"), work);
  assert.equal(git(repo.root, "branch", "--list", "feature/work"), "");
  assert.match(fs.readFileSync(path.join(repo.root, "package.json"), "utf8"), /0\.3\.0/);
});

test("release preparation rejects dirty, detached, stale, automation-carrying and unchanged starts", () => {
  const dirty = repository();
  fs.writeFileSync(path.join(dirty.root, "dirty.txt"), "x");
  expectCode("working_tree_dirty", () => prepareRelease({ root: dirty.root, version: "0.3.0", runChecks: false, expectedOrigin: dirty.bare }));
  const detached = repository();
  git(detached.root, "switch", "--detach");
  expectCode("wrong_branch", () => prepareRelease({ root: detached.root, version: "0.3.0", runChecks: false, expectedOrigin: detached.bare }));
  const otherRelease = repository();
  git(otherRelease.root, "switch", "-c", "release/0.2.1");
  expectCode("wrong_branch", () => prepareRelease({ root: otherRelease.root, version: "0.3.0", runChecks: false, expectedOrigin: otherRelease.bare }));
  const stale = repository();
  git(stale.root, "switch", "-c", "feature/stale");
  git(stale.root, "switch", "main");
  fs.writeFileSync(path.join(stale.root, "main.txt"), "x");
  git(stale.root, "add", "."); git(stale.root, "commit", "-m", "main moves on"); git(stale.root, "push", "origin", "main");
  git(stale.root, "switch", "feature/stale");
  expectCode("main_not_current", () => prepareRelease({ root: stale.root, version: "0.3.0", runChecks: false, expectedOrigin: stale.bare }));
  const automation = repository();
  git(automation.root, "switch", "-c", "feature/automation");
  fs.mkdirSync(path.join(automation.root, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(automation.root, ".github", "workflows", "x.yml"), "name: x\n");
  git(automation.root, "add", "."); git(automation.root, "commit", "-m", "ci: change");
  expectCode("release_scope_invalid", () => prepareRelease({ root: automation.root, version: "0.3.0", runChecks: false, expectedOrigin: automation.bare }));
  assert.equal(git(automation.root, "branch", "--show-current"), "feature/automation");
  const released = repository("0.3.0");
  expectCode("version_unchanged", () => prepareRelease({ root: released.root, version: "0.3.0", runChecks: false, expectedOrigin: released.bare }));
  const older = repository();
  expectCode("version_not_newer", () => prepareRelease({ root: older.root, version: "0.1.0", runChecks: false, expectedOrigin: older.bare }));
  // There is one channel: a prerelease is never prepared.
  const prerelease = repository();
  expectCode("invalid_tag", () => prepareRelease({ root: prerelease.root, version: "0.3.0-beta.1", runChecks: false, expectedOrigin: prerelease.bare }));
  assert.equal(git(prerelease.root, "branch", "--show-current"), "main");
});

test("merge preparation binds metadata, scope, curated notes and authorization bytes", () => {
  const repo = repository();
  git(repo.root, "switch", "-c", "release/0.3.0");
  const notes = applyHighlightsBlock("# GitOdile 0.3.0\n\nA reviewed release with safer release automation.\n", []);
  writeVersion(repo.root, "0.3.0", notes);
  git(repo.root, "add", ".");
  git(repo.root, "commit", "-m", "chore(release): prepare 0.3.0");
  const mergeSha = git(repo.root, "rev-parse", "HEAD");
  const identity = { ...parseReleaseBranch("release/0.3.0"), pullRequestNumber: 65, mergeSha };
  const files = ["README.md", "package.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/tauri.conf.json", "docs/release/notes/v0.3.0.md", "docs/release/highlights/v0.3.0.json"];
  assert.match(validateReleasePreparation({ root: repo.root, authorization: identity, changedFiles: files }).notesSha256, /^[0-9a-f]{64}$/);
  // Highlights are part of the preparation contract: a release without its
  // file, or with one that does not parse, is not tagged.
  expectCode("release_scope_invalid", () => validateReleasePreparation({ root: repo.root, authorization: identity, changedFiles: files.filter((file) => !file.endsWith(".json")) }));
  git(repo.root, "switch", "-c", "release/broken");
  writeVersion(repo.root, "0.3.0", notes, `${JSON.stringify({ version: "0.3.0", date: "2026-09-15", highlights: [{ id: "x", icon: "nope", en: "a", es: "b" }] })}\n`);
  git(repo.root, "add", "."); git(repo.root, "commit", "-m", "broken highlights");
  expectCode("highlights_invalid", () => validateReleasePreparation({ root: repo.root, authorization: { ...identity, mergeSha: git(repo.root, "rev-parse", "HEAD") }, changedFiles: files }));
  // The notes' Highlights section is rendered from the highlights file; a
  // release whose two descriptions disagree, or whose notes lack the block,
  // is not tagged.
  git(repo.root, "switch", "-c", "release/drifted");
  const line = { id: "inAppUpdates", icon: "cloud-download", en: "Update from inside the app.", es: "Actualiza desde la aplicación." };
  writeVersion(repo.root, "0.3.0", notes, `${JSON.stringify({ version: "0.3.0", date: "2026-09-15", highlights: [line] })}\n`);
  git(repo.root, "add", "."); git(repo.root, "commit", "-m", "highlights without notes");
  expectCode("notes_incomplete", () => validateReleasePreparation({ root: repo.root, authorization: { ...identity, mergeSha: git(repo.root, "rev-parse", "HEAD") }, changedFiles: files }));
  writeVersion(repo.root, "0.3.0", applyHighlightsBlock(notes, [line]), `${JSON.stringify({ version: "0.3.0", date: "2026-09-15", highlights: [line] })}\n`);
  git(repo.root, "add", "."); git(repo.root, "commit", "-m", "notes rendered");
  assert.match(validateReleasePreparation({ root: repo.root, authorization: { ...identity, mergeSha: git(repo.root, "rev-parse", "HEAD") }, changedFiles: files }).notesSha256, /^[0-9a-f]{64}$/);
  writeVersion(repo.root, "0.3.0", "# GitOdile 0.3.0\n\n## Highlights\n\n- Update from inside the app.\n", `${JSON.stringify({ version: "0.3.0", date: "2026-09-15", highlights: [line] })}\n`);
  git(repo.root, "add", "."); git(repo.root, "commit", "-m", "block without markers");
  expectCode("notes_incomplete", () => validateReleasePreparation({ root: repo.root, authorization: { ...identity, mergeSha: git(repo.root, "rev-parse", "HEAD") }, changedFiles: files }));
  git(repo.root, "switch", "release/0.3.0");
  // Product work may ride along, including removals and renames.
  assert.match(validateReleasePreparation({
    root: repo.root,
    authorization: identity,
    changedFiles: [
      ...files,
      { filename: "src/app/App.tsx", status: "modified" },
      { filename: "src/old.ts", status: "removed" },
      { filename: "src/new.ts", previous_filename: "src/renamed.ts", status: "renamed" },
    ],
  }).notesSha256, /^[0-9a-f]{64}$/);
  // Release automation may not, in any direction.
  expectCode("release_scope_invalid", () => validateReleasePreparation({ root: repo.root, authorization: identity, changedFiles: [...files, "scripts/release/evil.mjs"] }));
  expectCode("release_scope_invalid", () => validateReleasePreparation({ root: repo.root, authorization: identity, changedFiles: [...files, ".github/workflows/merge-driven-release.yml"] }));
  expectCode("release_scope_invalid", () => validateReleasePreparation({
    root: repo.root,
    authorization: identity,
    changedFiles: [...files, { filename: "scripts/moved.mjs", previous_filename: "scripts/release/merge-release.mjs", status: "renamed" }],
  }));
  expectCode("release_scope_invalid", () => validateReleasePreparation({
    root: repo.root,
    authorization: identity,
    changedFiles: files.map((filename) => filename === "package.json" ? { filename, status: "removed" } : filename),
  }));
  expectCode("release_scope_invalid", () => validateReleasePreparation({
    root: repo.root,
    authorization: identity,
    changedFiles: files.map((filename) => filename === "README.md"
      ? { filename, previous_filename: "src/removed.ts", status: "renamed" }
      : { filename, status: "modified" }),
  }));
  const checks = REQUIRED_RELEASE_CHECKS.map((name, index) => ({ name, id: index + 1, conclusion: "success" }));
  assert.equal(validateAuthorization({ schemaVersion: 1, repository: SOURCE_REPOSITORY, ...identity, requiredChecks: checks, changedFiles: files, notesSha256: "d".repeat(64) }).mergeSha, mergeSha);
});

test("placeholder notes and metadata mismatches fail before tag authorization", () => {
  const repo = repository();
  git(repo.root, "switch", "-c", "release/0.3.0");
  writeVersion(repo.root, "0.3.0", `# GitOdile 0.3.0\n\n<!-- ${NOTES_PLACEHOLDER} -->\n`);
  git(repo.root, "add", "."); git(repo.root, "commit", "-m", "placeholder");
  const identity = { ...parseReleaseBranch("release/0.3.0"), pullRequestNumber: 65, mergeSha: git(repo.root, "rev-parse", "HEAD") };
  const files = ["README.md", "package.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/tauri.conf.json", "docs/release/notes/v0.3.0.md", "docs/release/highlights/v0.3.0.json"];
  expectCode("notes_incomplete", () => validateReleasePreparation({ root: repo.root, authorization: identity, changedFiles: files }));
});
