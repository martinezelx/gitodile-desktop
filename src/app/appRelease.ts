export const APP_RELEASE_NOTE_IDS = [
  "projectSessions",
  "saveAndPublish",
  "historyTimeline",
  "truthfulStatus",
  "safeLineSwitching",
  "releaseDetails",
] as const;

export type AppReleaseNoteId = (typeof APP_RELEASE_NOTE_IDS)[number];

export type AppReleaseChannel = "alpha";

export type AppReleaseEntry = {
  version: string;
  channel: AppReleaseChannel;
  /** ISO `YYYY-MM-DD`. Formatted for the reader's language at render time
   * rather than stored pre-formatted, so one entry serves every locale. */
  date: string;
  noteIds: readonly AppReleaseNoteId[];
};

/** Newest first, and bundled with the application so opening the changelog
 * remains local-only. A future updater can compare its remote manifest with
 * the same version/channel identity without making release notes themselves
 * network-dependent.
 *
 * One entry, on purpose. `AGENTS.md` forbids inventing a historical changelog,
 * so this list starts where the app started tracking releases and grows by
 * prepending a real shipped build. */
export const APP_CHANGELOG: readonly AppReleaseEntry[] = [
  {
    version: __APP_VERSION__,
    channel: "alpha",
    date: "2026-08-30",
    // Listed one by one rather than reusing `APP_RELEASE_NOTE_IDS`, which is
    // the union of every id this app has ever shipped. Pointing an entry at it
    // works only while there is exactly one entry; the next release would
    // silently claim its predecessor's notes as its own.
    noteIds: [
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
