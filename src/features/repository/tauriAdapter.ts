import { invoke } from "@tauri-apps/api/core";

import type { RepositoryPort } from "./port";

export const repositoryPort: RepositoryPort = {
  open: ({ selectedPath: path, sessionEpoch }) =>
    invoke("open_repository", { path, sessionEpoch }),
};
