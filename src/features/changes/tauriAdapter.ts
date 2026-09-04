import { invoke } from "@tauri-apps/api/core";
import type { ChangesPort } from "./port";
export const changesPort: ChangesPort = {
  readFileDiff: ({ projectId: path, sessionEpoch, filePath }) => invoke("read_file_diff", { path, sessionEpoch, filePath }),
  readWorkingTreeDiffs: ({ projectId: path, sessionEpoch }) => invoke("read_working_tree_diffs", { path, sessionEpoch }),
  readFileLines: ({ projectId: path, sessionEpoch, filePath, startLine, endLine }) =>
    invoke("read_file_lines", { path, sessionEpoch, filePath, startLine, endLine }),
  readFileImagePreview: ({ projectId: path, sessionEpoch, filePath, originalPath, commit }) =>
    invoke("read_file_image_preview", { path, sessionEpoch, filePath, originalPath, commit }),
  planDiscard: ({ projectId: path, sessionEpoch, selectedPath }) =>
    invoke("plan_discard_changes", { path, sessionEpoch, selectedPath }),
  discard: ({ projectId: path, sessionEpoch, selectedPath, stateToken }) =>
    invoke("discard_changes", { path, sessionEpoch, selectedPath, stateToken }),
  getDiscardRecovery: ({ projectId: path, sessionEpoch }) =>
    invoke("get_discard_recovery", { path, sessionEpoch }),
  restoreDiscard: ({ projectId: path, sessionEpoch, recoveryId, stateToken }) =>
    invoke("restore_discarded_changes", { path, sessionEpoch, recoveryId, stateToken }),
};
