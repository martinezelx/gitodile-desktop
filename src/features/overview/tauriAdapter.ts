import { invoke } from "@tauri-apps/api/core";

import type { OverviewPort } from "./port";

export const overviewPort: OverviewPort = {
  readRemoteHome: ({ path, sessionEpoch }) => invoke("read_remote_home", { path, sessionEpoch }),
  openRemoteHome: ({ path, sessionEpoch, remote }) => invoke("open_remote_home", { path, sessionEpoch, remote }),
};
