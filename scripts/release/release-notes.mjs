import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HIGHLIGHTS_DIRECTORY, NOTES_DIRECTORY, applyHighlightsBlock, highlightsFileName, parseHighlights } from "./highlights.mjs";
import { parseReleaseVersion, ReleaseValidationError } from "./release-candidate.mjs";

/**
 * `pnpm run release:notes [version]`: renders the `## Highlights` section of
 * `docs/release/notes/v<version>.md` from the English lines of
 * `docs/release/highlights/v<version>.json`, between the markers the
 * highlights module owns. Everything outside the markers is left as written.
 * Without a version it renders the notes of the version being developed,
 * the one `package.json` names. The merge coordinator refuses to tag a
 * release whose notes and highlights file disagree, so this is the step
 * between filling the highlights and opening the release pull request.
 */

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

export function renderReleaseNotes({ root, version }) {
  const repositoryRoot = path.resolve(root);
  const release = parseReleaseVersion(version);
  const highlightsPath = path.join(repositoryRoot, HIGHLIGHTS_DIRECTORY, highlightsFileName(release.version));
  const notesPath = path.join(repositoryRoot, NOTES_DIRECTORY, `v${release.version}.md`);
  if (!fs.existsSync(highlightsPath)) fail("highlights_missing", `${HIGHLIGHTS_DIRECTORY}/${highlightsFileName(release.version)} does not exist; run release:prepare first`);
  if (!fs.existsSync(notesPath)) fail("notes_missing", `${NOTES_DIRECTORY}/v${release.version}.md does not exist; run release:prepare first`);
  const highlights = parseHighlights(highlightsFileName(release.version), fs.readFileSync(highlightsPath, "utf8"));
  const before = fs.readFileSync(notesPath, "utf8");
  const after = applyHighlightsBlock(before, highlights.highlights);
  const changed = after !== before;
  if (changed) fs.writeFileSync(notesPath, after);
  return {
    notes: path.relative(repositoryRoot, notesPath).replaceAll("\\", "/"),
    lines: highlights.highlights.length,
    changed,
  };
}

/** One optional positional argument, the version; pnpm's forwarded `--` is
 * accepted and dropped as `release:prepare` does. */
export function parseCommandLine(args, currentVersion) {
  const positional = args[0] === "--" ? args.slice(1) : args;
  if (positional.length > 1) fail("usage", "usage: pnpm run release:notes [semver]");
  return { version: positional[0] ?? currentVersion };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const current = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")).version;
    const { version } = parseCommandLine(process.argv.slice(2), current);
    const result = renderReleaseNotes({ root: process.cwd(), version });
    process.stdout.write(`${result.changed ? "Rendered" : "Already current:"} ${result.lines} highlight line(s) in ${result.notes}.\n`);
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Release notes rendering failed [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
