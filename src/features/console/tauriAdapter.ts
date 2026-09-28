import { invoke } from "@tauri-apps/api/core";
import type { ConsolePort } from "./port";

export const consolePort: ConsolePort = {
  run: ({ projectId: path, sessionEpoch, operationId }) =>
    invoke("run_console_query", { path, sessionEpoch, operationId }),
};
