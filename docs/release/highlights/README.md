# Release highlights

One JSON file per version, `v<version>.json`, holding the two-to-five lines
that version shows in the app's What's new — in both languages, each with a
glyph from `icons.json`. The public Markdown notes beside this directory are
what GitHub shows; this is what the app shows, and the two are kept apart
because one is an English document and the other is a bilingual list.

`pnpm run release:prepare <version>` scaffolds the file with an empty list and
the date the release was cut. Fill it before opening the release pull request
(`check:docs` validates every file, and the merge coordinator refuses a
release whose file is missing or malformed). A version with an empty list is
allowed — a pipeline-only preview has nothing to tell a user — and the app
simply leaves it out of the list, except for the build being run.

```json
{
  "version": "0.2.0-preview.11",
  "date": "2026-09-15",
  "highlights": [
    { "id": "inAppUpdates", "icon": "cloud-download", "en": "…", "es": "…" }
  ]
}
```

Rules: `id` is a camelCase identifier unique within the file; `icon` is a name
from `icons.json`; `en` and `es` are one plain-text sentence each, at most 240
characters; `date` is `YYYY-MM-DD`. Do not describe a version that has no
public notes.
