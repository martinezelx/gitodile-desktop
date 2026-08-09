import { invoke } from "@tauri-apps/api/core";
import type { ChangesPort } from "./port";
export const changesPort: ChangesPort = {
  readFileDiff: ({ projectId: path, sessionEpoch, filePath }) => invoke("read_file_diff", { path, sessionEpoch, filePath }),
  readWorkingTreeDiffs: ({ projectId: path, sessionEpoch }) => invoke("read_working_tree_diffs", { path, sessionEpoch }),
  readFileLines: ({ projectId: path, sessionEpoch, filePath, startLine, endLine }) =>
    invoke("read_file_lines", { path, sessionEpoch, filePath, startLine, endLine }),
};
