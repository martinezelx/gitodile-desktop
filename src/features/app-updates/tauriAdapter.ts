import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import type { AppUpdatesPort } from "./port";

/** The renderer supplies only opaque IDs, source intent and a bounded draft
 * summary. Feeds, URLs, keys, targets, headers and install paths are native. */
export const appUpdatesPort: AppUpdatesPort = {
  readState: () => invoke("get_app_update_state"),
  readStartupConfirmation: () => invoke("get_startup_update_confirmation"),
  check: (source) => invoke("check_app_update", { source }),
  download: (candidateId) => invoke("download_app_update", { candidateId }),
  cancel: (operationId) => invoke("cancel_app_update", { operationId }),
  install: (candidateId, drafts) => invoke("install_app_update", {
    request: { candidateId, consent: true, drafts },
  }),
  openManualDownload: () => openUrl("https://github.com/martinezelx/gitodile-feedback/releases"),
};
