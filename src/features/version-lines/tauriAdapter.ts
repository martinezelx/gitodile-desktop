import { invoke } from "@tauri-apps/api/core";

import type { VersionLinesPort } from "./port";

/** Only this adapter knows the stable task-025 IPC contract. */
export const versionLinesPort: VersionLinesPort = {
  read: ({ projectId: path, sessionEpoch }) =>
    invoke("get_version_lines", { path, sessionEpoch }),
  readHistory: ({ projectId: path, sessionEpoch, name }) =>
    invoke("get_version_line_history", { path, sessionEpoch, name }),
  planCreate: ({ projectId: path, sessionEpoch, name, switchToNew, startCommit }) =>
    invoke("plan_create_version_line", { path, sessionEpoch, name, switch: switchToNew, startCommit }),
  create: ({ projectId: path, sessionEpoch, name, switchToNew, startCommit, stateToken }) =>
    invoke("create_version_line", { path, sessionEpoch, name, switch: switchToNew, startCommit, stateToken }),
  planSwitch: ({ projectId: path, sessionEpoch, target }) =>
    invoke("plan_switch_version_line", { path, sessionEpoch, target }),
  switch: ({ projectId: path, sessionEpoch, target, stateToken }) =>
    invoke("switch_version_line", { path, sessionEpoch, target, stateToken }),
  planDelete: ({ projectId: path, sessionEpoch, name }) =>
    invoke("plan_delete_version_line", { path, sessionEpoch, name }),
  delete: ({ projectId: path, sessionEpoch, name, deleteRemote, stateToken }) =>
    invoke("delete_version_line", { path, sessionEpoch, name, deleteRemote, stateToken }),
  planRename: ({ projectId: path, sessionEpoch, name, newName }) =>
    invoke("plan_rename_version_line", { path, sessionEpoch, name, newName }),
  rename: ({ projectId: path, sessionEpoch, name, newName, stateToken }) =>
    invoke("rename_version_line", { path, sessionEpoch, name, newName, stateToken }),
};
