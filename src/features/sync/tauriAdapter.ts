import { Channel, invoke } from "@tauri-apps/api/core";

import type { GetTeamChangesPhase } from "./domain";
import type { SyncPort } from "./port";

export const syncPort: SyncPort = {
  readLocal: ({ projectId: path, sessionEpoch }) =>
    invoke("read_team_sync_status", { path, sessionEpoch }),
  check: ({ projectId: path, sessionEpoch }) =>
    invoke("check_team_changes", { path, sessionEpoch }),
  planGet: ({ projectId: path, sessionEpoch }, onProgress) => {
    const channel = new Channel<GetTeamChangesPhase>();
    channel.onmessage = onProgress;
    return invoke("plan_get_team_changes", { path, sessionEpoch, onProgress: channel });
  },
  get: ({ projectId: path, sessionEpoch, stateToken, recoveryReference, onProgress }) => {
    const channel = new Channel<GetTeamChangesPhase>();
    channel.onmessage = onProgress;
    return invoke("get_team_changes", {
      path,
      sessionEpoch,
      stateToken,
      recoveryReference,
      onProgress: channel,
    });
  },
};
