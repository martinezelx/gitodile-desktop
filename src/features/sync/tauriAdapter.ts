import { invoke } from "@tauri-apps/api/core";

import type { SyncPort } from "./port";

export const syncPort: SyncPort = {
  readLocal: ({ projectId: path, sessionEpoch }) =>
    invoke("read_team_sync_status", { path, sessionEpoch }),
  check: ({ projectId: path, sessionEpoch }) =>
    invoke("check_team_changes", { path, sessionEpoch }),
};
