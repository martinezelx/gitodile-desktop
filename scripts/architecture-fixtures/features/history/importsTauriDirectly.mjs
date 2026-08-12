// Seeded violation: feature transport belongs in that feature's tauriAdapter.
import { invoke } from "@tauri-apps/api/core";

export const forbiddenInvoke = invoke;

