import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  HIGHLIGHT_ICONS,
  HIGHLIGHT_TEXT_LIMIT,
  checkHighlights,
  parseHighlights,
  readHighlightsDirectory,
  scaffoldHighlights,
  todayIsoDate,
} from "./highlights.mjs";
import { ReleaseValidationError } from "./release-candidate.mjs";

function expectCode(code, callback) {
  assert.throws(callback, (error) => error instanceof ReleaseValidationError && error.code === code);
}

const line = { id: "inAppUpdates", icon: "cloud-download", en: "Update from inside the app.", es: "Actualiza desde la aplicación." };
const file = (overrides = {}, entries = [line]) => JSON.stringify({ version: "0.2.0-preview.11", date: "2026-09-15", highlights: entries, ...overrides });

test("a highlights file names its version, dates it and lists bilingual lines with known glyphs", () => {
  const parsed = parseHighlights("v0.2.0-preview.11.json", file());
  assert.deepEqual(parsed, { version: "0.2.0-preview.11", channel: "preview", date: "2026-09-15", highlights: [line] });
  assert.deepEqual(JSON.parse(scaffoldHighlights("0.3.0", "2026-10-01")), { version: "0.3.0", date: "2026-10-01", highlights: [] });
  assert.equal(parseHighlights("v0.3.0.json", scaffoldHighlights("0.3.0", "2026-10-01")).channel, "stable");
  assert.equal(todayIsoDate(new Date(2026, 8, 5)), "2026-09-05");
  assert.ok(HIGHLIGHT_ICONS.includes("cloud-download"));
});

test("every malformed shape is refused with a message naming the file and the field", () => {
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", "{"));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", "[]"));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.12.json", file()));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-alpha.1.json", file({ version: "0.2.0-alpha.1" })));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({ date: "2026-13-01" })));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({ date: "2026-02-30" })));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({ extra: true })));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({}, [{ ...line, icon: "rocket" }])));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({}, [{ ...line, id: "In-App" }])));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({}, [line, line])));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({}, [{ ...line, es: "" }])));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({}, [{ ...line, en: " padded" }])));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({}, [{ ...line, en: "x".repeat(HIGHLIGHT_TEXT_LIMIT + 1) }])));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({}, [{ ...line, en: "<b>bold</b>" }])));
  expectCode("highlights_invalid", () => parseHighlights("v0.2.0-preview.11.json", file({}, [{ ...line, fr: "non" }])));
});

test("the directory check orders versions, requires the current one and refuses orphans", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitodile-highlights-"));
  const highlights = path.join(root, "docs", "release", "highlights");
  const notes = path.join(root, "docs", "release", "notes");
  fs.mkdirSync(highlights, { recursive: true });
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "0.2.0-preview.11" }));
  for (const version of ["0.1.0", "0.2.0-preview.9", "0.2.0-preview.11"]) {
    fs.writeFileSync(path.join(highlights, `v${version}.json`), scaffoldHighlights(version, "2026-09-15"));
    fs.writeFileSync(path.join(notes, `v${version}.md`), `# GitOdile ${version}\n`);
  }
  fs.writeFileSync(path.join(highlights, "icons.json"), JSON.stringify(HIGHLIGHT_ICONS));
  fs.writeFileSync(path.join(highlights, "README.md"), "# notes\n");

  assert.deepEqual(readHighlightsDirectory(root).map((entry) => entry.version), ["0.2.0-preview.11", "0.2.0-preview.9", "0.1.0"]);
  assert.equal(checkHighlights(root).length, 3);

  fs.writeFileSync(path.join(highlights, "v0.2.0-preview.10.json"), scaffoldHighlights("0.2.0-preview.10", "2026-09-15"));
  expectCode("highlights_invalid", () => checkHighlights(root));
  fs.rmSync(path.join(highlights, "v0.2.0-preview.10.json"));

  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "0.2.0-preview.12" }));
  expectCode("highlights_missing", () => checkHighlights(root));

  fs.writeFileSync(path.join(highlights, "stray.json"), "{}");
  expectCode("highlights_invalid", () => readHighlightsDirectory(root));
});

test("the repository's own highlights pass the check", () => {
  const entries = checkHighlights();
  assert.ok(entries.length >= 3);
  for (const entry of entries) assert.ok(entry.highlights.every((item) => HIGHLIGHT_ICONS.includes(item.icon)));
});
