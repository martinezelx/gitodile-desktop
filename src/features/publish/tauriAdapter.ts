import { invoke } from "@tauri-apps/api/core";
import type { PublishPort } from "./port";

/** Only this adapter knows the stable IPC command names and payload casing. */
export const publishPort: PublishPort = {
  plan: ({ projectId: path, sessionEpoch, remote, upTo }) =>
    invoke("plan_publish", { path, sessionEpoch, remote, upTo }),
  discoverRemotes: ({ projectId: path, sessionEpoch }) =>
    invoke("discover_remotes", { path, sessionEpoch }),
  readCommitFileChanges: ({ projectId: path, sessionEpoch, commit }) =>
    invoke("read_commit_file_changes", { path, sessionEpoch, commit }),
  publish: ({ projectId: path, sessionEpoch, remote, stateToken, upTo }) =>
    invoke("publish", { path, sessionEpoch, remote, stateToken, upTo }),
};
