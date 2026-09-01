import { invoke } from "@tauri-apps/api/core";

import type { ProjectSettingsPort } from "./port";

/** Only this adapter knows the stable IPC command names and payload casing. */
export const projectSettingsPort: ProjectSettingsPort = {
  readRemotes: ({ path, sessionEpoch }) => invoke("read_project_remotes", { path, sessionEpoch }),
  setRemoteUrl: ({ path, sessionEpoch }, remoteName, remoteUrl) =>
    invoke("set_remote_url", { path, sessionEpoch, remoteName, remoteUrl }),
  planConnectRemote: ({ path, sessionEpoch }, remoteName, remoteUrl) =>
    invoke("plan_connect_remote", { path, sessionEpoch, remoteName, remoteUrl }),
  connectRemote: async ({ path, sessionEpoch }, remoteName, remoteUrl, stateToken) => {
    await invoke("connect_remote", { path, sessionEpoch, remoteName, remoteUrl, stateToken });
  },
  readIdentity: ({ path, sessionEpoch }) => invoke("read_project_identity", { path, sessionEpoch }),
  setIdentity: ({ path, sessionEpoch }, { name, email }) =>
    invoke("set_project_identity", { path, sessionEpoch, name, email }),
  clearIdentity: ({ path, sessionEpoch }) =>
    invoke("clear_project_identity", { path, sessionEpoch }),
  readIgnoreFile: ({ path, sessionEpoch }, scope) =>
    invoke("read_ignore_file", { path, sessionEpoch, scope }),
  writeIgnoreFile: ({ path, sessionEpoch }, scope, contents, stateToken) =>
    invoke("write_ignore_file", { path, sessionEpoch, scope, contents, stateToken }),
};
