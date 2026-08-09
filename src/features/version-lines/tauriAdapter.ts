import { invoke } from "@tauri-apps/api/core";

import type { VersionLinesPort } from "./port";

/** Only this adapter knows the stable task-025 IPC contract. */
export const versionLinesPort: VersionLinesPort = {
  read: ({ projectId: path, sessionEpoch }) =>
    invoke("get_version_lines", { path, sessionEpoch }),
  planCreate: ({ projectId: path, sessionEpoch, name, switchToNew }) =>
    invoke("plan_create_version_line", { path, sessionEpoch, name, switch: switchToNew }),
  create: ({ projectId: path, sessionEpoch, name, switchToNew, stateToken }) =>
    invoke("create_version_line", { path, sessionEpoch, name, switch: switchToNew, stateToken }),
  planSwitch: ({ projectId: path, sessionEpoch, target }) =>
    invoke("plan_switch_version_line", { path, sessionEpoch, target }),
  switch: ({ projectId: path, sessionEpoch, target, stateToken }) =>
    invoke("switch_version_line", { path, sessionEpoch, target, stateToken }),
  planDelete: ({ projectId: path, sessionEpoch, name }) =>
    invoke("plan_delete_version_line", { path, sessionEpoch, name }),
  delete: ({ projectId: path, sessionEpoch, name, stateToken }) =>
    invoke("delete_version_line", { path, sessionEpoch, name, stateToken }),
};
