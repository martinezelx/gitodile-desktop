import { invoke } from "@tauri-apps/api/core";
import type { ConsolePort } from "./port";

export const consolePort: ConsolePort = {
  run: ({ projectId: path, sessionEpoch, operationId }) =>
    invoke("run_console_query", { path, sessionEpoch, operationId }),
  plan: ({ projectId: path, sessionEpoch, line, runHooks }) =>
    invoke("plan_console_command", { path, sessionEpoch, line, runHooks }),
  runPlan: ({ projectId: path, sessionEpoch, planId }) =>
    invoke("run_console_plan", { path, sessionEpoch, planId }),
  runChange: ({ projectId: path, sessionEpoch, planId, answer }) =>
    invoke("run_console_change", { path, sessionEpoch, planId, answer }),
  getSettings: () => invoke("get_console_settings"),
  setConfirmChanges: ({ enabled, confirmed }) => invoke("set_console_confirm_changes", { enabled, confirmed }),
};
