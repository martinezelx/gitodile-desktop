import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { InitializeProgressPhase } from "./domain";
import type { InitializeProjectPort } from "./port";

export const initializeProjectPort: InitializeProjectPort = {
  async chooseFolder(initialPath, title) {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: initialPath || undefined,
      title,
    });
    return typeof selected === "string" ? selected : null;
  },
  plan: (request) => invoke("plan_initialize_project", request),
  execute: (request, plan, onProgress) => {
    const channel = new Channel<InitializeProgressPhase>();
    channel.onmessage = onProgress;
    return invoke("initialize_project", {
      ...request,
      operationId: plan.operationId,
      stateToken: plan.stateToken,
      onProgress: channel,
    });
  },
  cleanup: (plan) =>
    invoke("cleanup_initialize_project", {
      destinationPath: plan.destinationPath,
      targetKind: plan.targetKind,
      operationId: plan.operationId,
    }),
  planRemote: ({ projectId: path, sessionEpoch, remoteName, remoteUrl }) =>
    invoke("plan_connect_remote", { path, sessionEpoch, remoteName, remoteUrl }),
  connectRemote: ({ projectId: path, sessionEpoch, remoteName, remoteUrl }, stateToken) =>
    invoke("connect_remote", { path, sessionEpoch, remoteName, remoteUrl, stateToken }),
};
