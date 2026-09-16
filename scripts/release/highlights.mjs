import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareReleaseVersions, parseReleaseVersion, ReleaseValidationError } from "./release-candidate.mjs";

/**
 * Release highlights: the two-to-five sentences a version shows in the app's
 * What's new, one JSON file per version under `docs/release/highlights/`.
 *
 * The public notes in `docs/release/notes/` are English Markdown for the
 * GitHub release; the app is bilingual and shows one short line per change
 * with a glyph, so it reads a separate, structured file. `release:prepare`
 * scaffolds it beside the notes, `check:docs` validates every file and the
 * merge coordinator refuses to tag a release whose file is missing or
 * malformed. The frontend assembles the changelog from the directory at
 * build time, so adding a version is writing this one file.
 */

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const HIGHLIGHTS_DIRECTORY = path.join("docs", "release", "highlights");
export const NOTES_DIRECTORY = path.join("docs", "release", "notes");

/** The glyph catalogue, shared with the dialog by file so the two cannot
 * disagree: a name outside it fails the check before it reaches the app. */
export const HIGHLIGHT_ICONS = Object.freeze(
  JSON.parse(fs.readFileSync(path.join(moduleRoot, HIGHLIGHTS_DIRECTORY, "icons.json"), "utf8")),
);

/** Long enough for one honest sentence, short enough that the dialog stays a
 * list rather than a document. */
export const HIGHLIGHT_TEXT_LIMIT = 240;
const ID = /^[a-z][A-Za-z0-9]*$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

/** `Date.parse` would quietly roll "2026-02-30" over to March; a date the
 * app will print beside a version has to exist on the calendar. */
function isCalendarDate(value) {
  if (!DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function highlightsFileName(version) {
  return `v${version}.json`;
}

/** The public notes' `## Highlights` section is rendered from the English
 * lines of the highlights file, between these two markers. The script owns
 * everything between them and replaces it on every run; the rest of the
 * notes stays hand-written. HTML comments do not render on GitHub and are
 * stripped before the text reaches the updater manifest. */
export const HIGHLIGHTS_BLOCK_START = "<!-- gitodile-highlights:start -->";
export const HIGHLIGHTS_BLOCK_END = "<!-- gitodile-highlights:end -->";

export function renderHighlightsBlock(highlights) {
  const body = highlights.length === 0
    ? ["<!-- This version has no user-facing highlights; What's new lists it without lines. -->"]
    : ["## Highlights", "", ...highlights.map((entry) => `- ${entry.en}`)];
  return [HIGHLIGHTS_BLOCK_START, ...body, HIGHLIGHTS_BLOCK_END].join("\n");
}

/** The marked block as it stands in the notes, or `null` when there is none.
 * Half a pair of markers is an error rather than "none": the script would
 * otherwise insert a second block beside the broken one. */
export function extractHighlightsBlock(notes) {
  const text = notes.replace(/\r\n?/g, "\n");
  const start = text.indexOf(HIGHLIGHTS_BLOCK_START);
  const end = text.indexOf(HIGHLIGHTS_BLOCK_END);
  if (start < 0 && end < 0) return null;
  if (start < 0 || end < start) fail("notes_invalid", "the highlights markers in the release notes are malformed");
  return text.slice(start, end + HIGHLIGHTS_BLOCK_END.length);
}

/** Notes with the block rendered from `highlights`: replaced in place when
 * the markers exist, inserted under the title otherwise. Re-running changes
 * only the marked block. */
export function applyHighlightsBlock(notes, highlights) {
  const text = notes.replace(/\r\n?/g, "\n");
  const block = renderHighlightsBlock(highlights);
  const existing = extractHighlightsBlock(text);
  // A function replacement: a string one would expand `$&`, `$$` and friends
  // inside a highlight line.
  if (existing !== null) return text.replace(existing, () => block);
  const title = text.match(/^# [^\n]*\n/);
  if (!title) fail("notes_invalid", "release notes must start with a `# GitOdile <version>` title line");
  const rest = text.slice(title[0].length).replace(/^\n+/, "");
  return `${title[0]}\n${block}\n${rest === "" ? "" : `\n${rest}`}`;
}

/** Local calendar date, the day the release was cut: the one fact the
 * preparation step knows without the network, a tag or the pipeline. */
export function todayIsoDate(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function scaffoldHighlights(version, date) {
  return `${JSON.stringify({ version, date, highlights: [] }, null, 2)}\n`;
}

/** Parses and validates one file. `name` is the file name, used both for the
 * error message and to insist the file is named after the version it holds. */
export function parseHighlights(name, text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail("highlights_invalid", `${name}: not valid JSON (${error.message})`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("highlights_invalid", `${name}: expected an object`);
  const allowedKeys = new Set(["version", "date", "highlights"]);
  for (const key of Object.keys(value)) if (!allowedKeys.has(key)) fail("highlights_invalid", `${name}: unexpected field "${key}"`);
  if (typeof value.version !== "string") fail("highlights_invalid", `${name}: "version" must be a string`);
  const release = (() => {
    try {
      return parseReleaseVersion(value.version);
    } catch (error) {
      return fail("highlights_invalid", `${name}: ${error.message}`);
    }
  })();
  if (name !== highlightsFileName(value.version)) fail("highlights_invalid", `${name}: file name does not match version ${value.version}`);
  if (typeof value.date !== "string" || !isCalendarDate(value.date)) {
    fail("highlights_invalid", `${name}: "date" must be a calendar date as YYYY-MM-DD`);
  }
  if (!Array.isArray(value.highlights)) fail("highlights_invalid", `${name}: "highlights" must be an array`);
  const ids = new Set();
  const highlights = value.highlights.map((entry, index) => {
    const where = `${name}: highlights[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) fail("highlights_invalid", `${where}: expected an object`);
    const entryKeys = new Set(["id", "icon", "en", "es"]);
    for (const key of Object.keys(entry)) if (!entryKeys.has(key)) fail("highlights_invalid", `${where}: unexpected field "${key}"`);
    if (typeof entry.id !== "string" || !ID.test(entry.id)) fail("highlights_invalid", `${where}: "id" must be a camelCase identifier`);
    if (ids.has(entry.id)) fail("highlights_invalid", `${where}: duplicate id "${entry.id}"`);
    ids.add(entry.id);
    if (!HIGHLIGHT_ICONS.includes(entry.icon)) fail("highlights_invalid", `${where}: unknown icon "${entry.icon}" (see ${HIGHLIGHTS_DIRECTORY}/icons.json)`);
    for (const language of ["en", "es"]) {
      const text = entry[language];
      if (typeof text !== "string" || text.trim() === "" || text.trim() !== text) fail("highlights_invalid", `${where}: "${language}" must be a non-empty, trimmed sentence`);
      if (text.length > HIGHLIGHT_TEXT_LIMIT) fail("highlights_invalid", `${where}: "${language}" exceeds ${HIGHLIGHT_TEXT_LIMIT} characters`);
      if (/[<>]/.test(text)) fail("highlights_invalid", `${where}: "${language}" must be plain text`);
    }
    return { id: entry.id, icon: entry.icon, en: entry.en, es: entry.es };
  });
  return { version: value.version, channel: release.channel, date: value.date, highlights };
}

/** Every file in the directory, validated, newest version first. */
export function readHighlightsDirectory(root = moduleRoot) {
  const directory = path.join(root, HIGHLIGHTS_DIRECTORY);
  const entries = [];
  for (const name of fs.readdirSync(directory).sort()) {
    if (name === "icons.json" || name === "README.md") continue;
    if (!/^v.+\.json$/.test(name)) fail("highlights_invalid", `${name}: only v<version>.json files belong in ${HIGHLIGHTS_DIRECTORY}`);
    entries.push(parseHighlights(name, fs.readFileSync(path.join(directory, name), "utf8")));
  }
  return entries.sort((left, right) => compareReleaseVersions(right.version, left.version));
}

/** The repository-wide rules on top of each file's own: the version being
 * developed has its file, no highlights describe a version that has no
 * public notes, and notes that carry the highlights block carry the one
 * their highlights file renders. Notes written before the block existed
 * have no markers and are left alone; the merge coordinator is what
 * requires the block for a release being prepared. */
export function checkHighlights(root = moduleRoot) {
  const entries = readHighlightsDirectory(root);
  const current = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  if (!entries.some((entry) => entry.version === current)) {
    fail("highlights_missing", `${HIGHLIGHTS_DIRECTORY}/${highlightsFileName(current)} is missing for the current version`);
  }
  for (const entry of entries) {
    const notesPath = path.join(root, NOTES_DIRECTORY, `v${entry.version}.md`);
    if (!fs.existsSync(notesPath)) {
      fail("highlights_invalid", `${highlightsFileName(entry.version)}: no public notes exist at ${NOTES_DIRECTORY}/v${entry.version}.md`);
    }
    const block = extractHighlightsBlock(fs.readFileSync(notesPath, "utf8"));
    if (block !== null && block !== renderHighlightsBlock(entry.highlights)) {
      fail("notes_stale", `${NOTES_DIRECTORY}/v${entry.version}.md: the highlights block differs from ${highlightsFileName(entry.version)}; run pnpm run release:notes ${entry.version}`);
    }
  }
  return entries;
}
