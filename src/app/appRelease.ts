export const APP_RELEASE_NOTE_IDS = [
  "projectSessions",
  "saveAndPublish",
  "historyTimeline",
  "truthfulStatus",
  "safeLineSwitching",
  "releaseDetails",
  "publicIssueReporting",
  "previewVersions",
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

/** Newest first, and bundled with the application so opening the changelog
 * remains local-only. A future updater can compare its remote manifest with
 * the same version/channel identity without making release notes themselves
 * network-dependent.
 *
 * The first entry describes the running build, including unpublished
 * candidates. Retain historical entries only for actual shipped releases;
 * `AGENTS.md` forbids inventing a historical changelog. */
export const APP_CHANGELOG: readonly AppReleaseEntry[] = [
  {
    version: __APP_VERSION__,
    channel: "preview",
    date: null,
    // Listed one by one rather than reusing `APP_RELEASE_NOTE_IDS`, which is
    // the union of every id this app has ever shipped. Pointing an entry at it
    // works only while there is exactly one entry; the next release would
    // silently claim its predecessor's notes as its own.
    noteIds: [
      "publicIssueReporting",
      "previewVersions",
      "projectSessions",
      "saveAndPublish",
      "historyTimeline",
      "truthfulStatus",
      "safeLineSwitching",
      "releaseDetails",
    ],
  },
];

/** The build the user is running. It is the head of the changelog by
 * definition: the status bar, About's diagnostics, and the changelog's
 * "you are here" marker all have to agree on one version. */
export const CURRENT_APP_RELEASE: AppReleaseEntry = APP_CHANGELOG[0];
