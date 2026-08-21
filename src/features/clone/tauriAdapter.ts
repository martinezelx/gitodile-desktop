import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { CloneProgressPhase } from "./domain";
import type { ClonePort } from "./port";

export const clonePort: ClonePort = {
  async chooseParent(initialParent) {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: initialParent || undefined,
    });
    return typeof selected === "string" ? selected : null;
  },
  plan: ({ source, destinationParent, destinationName }) =>
    invoke("plan_clone", { source, destinationParent, destinationName }),
  execute: ({ source, destinationParent, destinationName }, plan, onProgress) => {
    const channel = new Channel<CloneProgressPhase>();
    channel.onmessage = onProgress;
    return invoke("clone_repository", {
      source,
      destinationParent,
      destinationName,
      operationId: plan.operationId,
      stateToken: plan.stateToken,
      onProgress: channel,
    });
  },
  cancel: (operationId) => invoke("cancel_clone", { operationId }),
  cleanup: (destinationParent, operationId) =>
    invoke("cleanup_clone", { destinationParent, operationId }),
};
