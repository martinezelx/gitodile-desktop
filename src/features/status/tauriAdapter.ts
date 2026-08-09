import { invoke } from "@tauri-apps/api/core";

import type { StatusPort } from "./port";

export const statusPort: StatusPort = {
  readWorkingTree: ({ projectId: path, sessionEpoch }) =>
    invoke("read_working_tree_status", { path, sessionEpoch }),
  readPendingVersions: ({ projectId: path, sessionEpoch }) =>
    invoke("list_unpublished_versions", { path, sessionEpoch }),
};
