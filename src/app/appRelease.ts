export const APP_RELEASE_NOTE_IDS = [
  "projectSessions",
  "saveAndPublish",
  "historyTimeline",
  "truthfulStatus",
  "safeLineSwitching",
  "releaseDetails",
  "publicIssueReporting",
  "previewVersions",
  "canonicalIdentity",
  "inAppUpdates",
] as const;

export type AppReleaseNoteId = (typeof APP_RELEASE_NOTE_IDS)[number];

export type AppReleaseChannel = "stable" | "preview";

export type AppReleaseEntry = {
  version: string;
  channel: AppReleaseChannel;
  /** Publication date as ISO `YYYY-MM-DD`, or null for an unpublished
   * candidate. Formatted for the reader's language at render time. */
  date: string | null;
  noteIds: readonly AppReleaseNoteId[];
};

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

function release(
  version: string,
  date: string | null,
  noteIds: readonly AppReleaseNoteId[],
): AppReleaseEntry {
  return { version, channel: appReleaseChannel(version), date, noteIds };
}

/** Newest first, and bundled with the application so opening the changelog
 * remains local-only. A future updater can compare its remote manifest with
 * the same version/channel identity without making release notes themselves
 * network-dependent.
 *
 * The first entry describes the running build, including unpublished
 * candidates. Retain historical entries only for actual shipped releases;
 * `AGENTS.md` forbids inventing a historical changelog. */
export const APP_CHANGELOG: readonly AppReleaseEntry[] = [
  release(
    __APP_VERSION__,
    null,
    // Listed one by one rather than reusing `APP_RELEASE_NOTE_IDS`, which is
    // the union of every id this app has ever shipped. Pointing an entry at it
    // works only while there is exactly one entry; the next release would
    // silently claim its predecessor's notes as its own.
    [
      "inAppUpdates",
      "publicIssueReporting",
      "previewVersions",
      "releaseDetails",
      "canonicalIdentity",
    ],
  ),
  release(
    "0.1.0",
    "2026-08-27",
    [
      "projectSessions",
      "saveAndPublish",
      "historyTimeline",
      "truthfulStatus",
      "safeLineSwitching",
    ],
  ),
];

/** The build the user is running. It is the head of the changelog by
 * definition: the status bar, About's diagnostics, and the changelog's
 * "you are here" marker all have to agree on one version. */
export const CURRENT_APP_RELEASE: AppReleaseEntry = APP_CHANGELOG[0];
