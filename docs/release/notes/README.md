# Public release notes

The public publisher accepts curated notes only from this directory. Add one
reviewed UTF-8 Markdown file named exactly `v<version>.md` before dispatching a
publication, for example `v0.2.0-preview.4.md`. The file is copied verbatim to
the GitHub Release body and reduced to bounded plain text for the updater
manifest; it must not contain private source links, credentials, authenticated
URLs, local paths or generated commit lists.

An unpublished development version does not need a file. Validation fixtures
belong in tests rather than here.
