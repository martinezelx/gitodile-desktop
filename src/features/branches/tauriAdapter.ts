import { invoke } from "@tauri-apps/api/core";

import type { BranchesPort } from "./port";

/** Only this adapter knows the stable task-025 IPC contract. */
export const branchesPort: BranchesPort = {
  read: ({ projectId: path, sessionEpoch }) =>
    invoke("get_branches", { path, sessionEpoch }),
  readHistory: ({ projectId: path, sessionEpoch, name }) =>
    invoke("get_branch_history", { path, sessionEpoch, name }),
  planCreate: ({ projectId: path, sessionEpoch, name, switchToNew, startCommit }) =>
    invoke("plan_create_branch", { path, sessionEpoch, name, switch: switchToNew, startCommit }),
  create: ({ projectId: path, sessionEpoch, name, switchToNew, startCommit, stateToken }) =>
    invoke("create_branch", { path, sessionEpoch, name, switch: switchToNew, startCommit, stateToken }),
  planSwitch: ({ projectId: path, sessionEpoch, target }) =>
    invoke("plan_switch_branch", { path, sessionEpoch, target }),
  switch: ({ projectId: path, sessionEpoch, target, stateToken }) =>
    invoke("switch_branch", { path, sessionEpoch, target, stateToken }),
  planDelete: ({ projectId: path, sessionEpoch, name }) =>
    invoke("plan_delete_branch", { path, sessionEpoch, name }),
  delete: ({ projectId: path, sessionEpoch, name, deleteRemote, stateToken }) =>
    invoke("delete_branch", { path, sessionEpoch, name, deleteRemote, stateToken }),
  planCleanUp: ({ projectId: path, sessionEpoch, names }) =>
    invoke("plan_clean_up_branches", { path, sessionEpoch, names }),
  cleanUp: ({ projectId: path, sessionEpoch, branches, deleteRemote }) =>
    invoke("clean_up_branches", { path, sessionEpoch, branches, deleteRemote }),
  planRename: ({ projectId: path, sessionEpoch, name, newName }) =>
    invoke("plan_rename_branch", { path, sessionEpoch, name, newName }),
  rename: ({ projectId: path, sessionEpoch, name, newName, stateToken }) =>
    invoke("rename_branch", { path, sessionEpoch, name, newName, stateToken }),
};
