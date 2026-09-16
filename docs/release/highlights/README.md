# Release highlights

One JSON file per version, `v<version>.json`, holding the two-to-five lines
that version shows in the app's What's new — in both languages, each with a
glyph from `icons.json`. The public Markdown notes beside this directory are
what GitHub shows; this is what the app shows, and the two are kept apart
because one is an English document and the other is a bilingual list.

`pnpm run release:prepare <version>` scaffolds the file with an empty list and
the day the release branch was cut. Fill it, then run
`pnpm run release:notes` so the public notes' `## Highlights` section is
rendered from the English lines (see [`../notes/README.md`](../notes/README.md));
do this before opening the release pull request. `check:docs` validates every
file and refuses notes whose rendered block is stale, and the merge
coordinator refuses a release whose file is missing or malformed or whose
notes do not carry the block its file renders. A version with an empty list
is allowed — a pipeline-only preview has nothing to tell a user — and the app
simply leaves it out of the list, except for the build being run.

The `date` in the file is only a fallback. What's new dates each version by
its `v<version>` tag, resolved when the app is built; the release pipeline
fetches tags and refuses to build a tagged release whose own tag did not
resolve, so a published build always shows the day the version was actually
published. A development checkout without the tag shows the file's date.

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
