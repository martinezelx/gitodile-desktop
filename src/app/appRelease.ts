export const APP_RELEASE_NOTE_IDS = [
  "truthfulStatus",
  "safeLineSwitching",
  "releaseDetails",
] as const;

export type AppReleaseNoteId = (typeof APP_RELEASE_NOTE_IDS)[number];

export type AppReleaseInfo = {
  version: string;
  channel: "alpha";
  noteIds: readonly AppReleaseNoteId[];
};

/** Bundled with the application so opening About remains local-only. A future
 * updater can compare its remote manifest with this same version/channel
 * identity without making release notes themselves network-dependent. */
export const CURRENT_APP_RELEASE: AppReleaseInfo = {
  version: __APP_VERSION__,
  channel: "alpha",
  noteIds: APP_RELEASE_NOTE_IDS,
};
