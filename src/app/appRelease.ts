/* The glyph catalogue lives with the component that draws it, which the
   update dialog shares; the release model names it from there. */
import { HIGHLIGHT_ICONS, type HighlightIcon } from "../shared/ui";

export { HIGHLIGHT_ICONS, type HighlightIcon };

export type AppReleaseChannel = "stable" | "preview";

/** One line of What's new, in both languages the app speaks. Stored as text
 * rather than as a translation key because a release's highlights belong to
 * the release, not to the dictionary: the file that describes a version is
 * the one place its wording lives. */
export type ReleaseHighlight = Readonly<{
  id: string;
  icon: HighlightIcon;
  en: string;
  es: string;
}>;

export type AppReleaseEntry = Readonly<{
  version: string;
  channel: AppReleaseChannel;
  /** The day the release was published — its tag's date — as ISO
   * `YYYY-MM-DD`, formatted for the reader's language at render time. A
   * version whose tag the build could not see (a development checkout, or
   * the candidate before it is tagged) falls back to the day its release
   * branch was cut. Null only for a build whose highlights file does not
   * exist yet — a development checkout between two releases. */
  date: string | null;
  highlights: readonly ReleaseHighlight[];
}>;

/** What `docs/release/highlights/v<version>.json` holds. `release:prepare`
 * scaffolds it and `check:docs` validates it, so by the time it is bundled it
 * has this shape; the build does not validate it again. */
type ReleaseHighlightsFile = Readonly<{
  version: string;
  date: string;
  highlights: readonly ReleaseHighlight[];
}>;

/** Channel identity is encoded in the release version itself. Keeping a
 * second handwritten channel beside it would allow the updater feed, status
 * bar and changelog to disagree about the same build. */
export function appReleaseChannel(version: string): AppReleaseChannel {
  const number = "(?:0|[1-9]\\d*)";
  if (new RegExp(`^${number}\\.${number}\\.${number}$`).test(version)) return "stable";
  if (new RegExp(`^${number}\\.${number}\\.${number}-preview\\.[1-9]\\d*$`).test(version)) {
    return "preview";
  }
  throw new Error(`Unsupported GitOdile release version: ${version}`);
}

/** SemVer order over the two supported shapes: every `X.Y.Z-preview.N`
 * precedes its `X.Y.Z` stable successor. Mirrors the release scripts'
 * `compareReleaseVersions`, which the frontend cannot import. */
export function compareAppReleaseVersions(left: string, right: string): number {
  const parse = (version: string) => {
    const [core, preview] = version.split("-preview.");
    return { core: core.split(".").map(Number), preview: preview === undefined ? null : Number(preview) };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
  }
  if (a.preview === b.preview) return 0;
  if (a.preview === null) return 1;
  if (b.preview === null) return -1;
  return a.preview < b.preview ? -1 : 1;
}

/**
 * The changelog, newest first, from every highlights file plus the running
 * build.
 *
 * A version with nothing to tell a user — a pipeline-only preview — is left
 * out rather than shown as an empty disclosure, with one exception: the build
 * being run is always listed, because the dialog's "you are running this"
 * marker is the one fact it has to state before any note means anything. A
 * running build with no file at all (a checkout between releases) gets a
 * dateless entry rather than a crash.
 */
export function buildAppChangelog(
  files: readonly ReleaseHighlightsFile[],
  currentVersion: string,
  tagDates: Readonly<Record<string, string>> = {},
): readonly AppReleaseEntry[] {
  const entries: AppReleaseEntry[] = files
    .filter((file) => file.highlights.length > 0 || file.version === currentVersion)
    .map((file) => ({
      version: file.version,
      channel: appReleaseChannel(file.version),
      date: tagDates[file.version] ?? file.date,
      highlights: file.highlights,
    }));
  if (!entries.some((entry) => entry.version === currentVersion)) {
    entries.push({
      version: currentVersion,
      channel: appReleaseChannel(currentVersion),
      date: null,
      highlights: [],
    });
  }
  return entries.sort((left, right) => compareAppReleaseVersions(right.version, left.version));
}

/** Bundled with the application so opening the changelog remains local-only:
 * every `v*.json` in the highlights directory, read at build time. Adding a
 * release is adding its file; nothing here changes. */
const HIGHLIGHT_FILES = Object.values(
  import.meta.glob<ReleaseHighlightsFile>("/docs/release/highlights/v*.json", { eager: true, import: "default" }),
);

export const APP_CHANGELOG: readonly AppReleaseEntry[] = buildAppChangelog(
  HIGHLIGHT_FILES,
  __APP_VERSION__,
  __APP_RELEASE_DATES__,
);

/** The build the user is running. The status bar, About's diagnostics, and
 * the changelog's "you are here" marker all have to agree on one version, and
 * `buildAppChangelog` guarantees it is listed. */
export const CURRENT_APP_RELEASE: AppReleaseEntry =
  APP_CHANGELOG.find((entry) => entry.version === __APP_VERSION__) ?? APP_CHANGELOG[0];
