import { invoke } from "@tauri-apps/api/core";
import type { SaveVersionPort } from "./port";

/** Only this adapter knows the stable IPC command names and payload casing. */
export const saveVersionPort: SaveVersionPort = {
  plan: ({ projectId: path, sessionEpoch, selectedPaths }) =>
    invoke("plan_save_version", { path, sessionEpoch, selectedPaths }),
  save: ({ projectId: path, sessionEpoch, title, description, stateToken, selectedPaths, runHooks }) =>
    invoke("save_version", {
      path,
      sessionEpoch,
      title,
      description,
      stateToken,
      selectedPaths,
      runHooks,
    }),
};
