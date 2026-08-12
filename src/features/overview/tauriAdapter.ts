import { invoke } from "@tauri-apps/api/core";

import type { PendingVersionDetailsPort } from "./port";

/** Tauri implementation of Overview's saved-version detail read boundary. */
export const pendingVersionDetailsPort: PendingVersionDetailsPort = {
  readFiles: (path, sessionEpoch, commit) =>
    invoke("read_commit_file_changes", { path, sessionEpoch, commit }),
  readDiff: (path, sessionEpoch, commit, filePath) =>
    invoke("read_commit_file_diff", { path, sessionEpoch, commit, filePath }),
};

