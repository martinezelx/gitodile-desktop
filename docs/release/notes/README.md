# Public release notes

The public publisher accepts curated notes only from this directory. Add one
reviewed UTF-8 Markdown file named exactly `v<version>.md` before dispatching a
publication, for example `v0.2.0-preview.4.md`. The file is copied verbatim to
the GitHub Release body and reduced to bounded plain text for the updater
manifest; it must not contain private source links, credentials, authenticated
URLs, local paths or generated commit lists.

The `## Highlights` section is not hand-written. `release:prepare` places a
block between `<!-- gitodile-highlights:start -->` and
`<!-- gitodile-highlights:end -->`, and `pnpm run release:notes [version]`
renders the English lines of `docs/release/highlights/v<version>.json` into
it — re-running replaces only that block, and the block may be moved anywhere
in the file. The rest of the notes stays hand-written. The merge coordinator
refuses to tag a release whose block is missing or differs from the
highlights file, so GitHub and the app's What's new say the same thing about
the same version. The markers are HTML comments: GitHub does not render them,
and the publisher strips comments before the text reaches the updater
manifest.

An unpublished development version does not need a file. Validation fixtures
belong in tests rather than here.
