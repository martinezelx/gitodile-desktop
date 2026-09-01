import type {
  ConnectRemotePlan,
  IdentityDraft,
  IgnoreFile,
  IgnoreScope,
  ProjectIdentity,
  ProjectRemotes,
  ProjectSettingsTarget,
} from "./domain";

/**
 * Everything this panel can ask of the open project.
 *
 * The mirror image of `SettingsPort`: every call here is repository-scoped and
 * carries the project's current session epoch, because every answer is a fact
 * about one repository rather than about the machine. There is no shape for a
 * closed project, which is also why the gear only appears where one is open.
 *
 * The three mutations return the fresh state rather than `void`, so the panel
 * never has to guess what Git ended up with — the remote-URL write in
 * particular is verified in Rust and reports what the configuration actually
 * says afterwards.
 */
export interface ProjectSettingsPort {
  readRemotes(project: ProjectSettingsTarget): Promise<ProjectRemotes>;
  /** Rejects with `invalid_remote_url` when Git would not accept the address,
   * `remote_not_found` when the remote is gone, and `remote_connect_uncertain`
   * when the write could not be verified afterwards. */
  setRemoteUrl(
    project: ProjectSettingsTarget,
    remoteName: string,
    remoteUrl: string,
  ): Promise<ProjectRemotes>;
  /** Connecting a project's first remote goes through the same plan/confirm
   * pair as creating a project does, so the two cannot drift apart. */
  planConnectRemote(
    project: ProjectSettingsTarget,
    remoteName: string,
    remoteUrl: string,
  ): Promise<ConnectRemotePlan>;
  connectRemote(
    project: ProjectSettingsTarget,
    remoteName: string,
    remoteUrl: string,
    stateToken: string,
  ): Promise<void>;
  readIdentity(project: ProjectSettingsTarget): Promise<ProjectIdentity>;
  setIdentity(project: ProjectSettingsTarget, identity: IdentityDraft): Promise<ProjectIdentity>;
  /** Removes the local override so the project inherits again. */
  clearIdentity(project: ProjectSettingsTarget): Promise<ProjectIdentity>;
  readIgnoreFile(project: ProjectSettingsTarget, scope: IgnoreScope): Promise<IgnoreFile>;
  /** `stateToken` is the one from the read this edit started from; a file
   * changed on disk since then is refused rather than overwritten. */
  writeIgnoreFile(
    project: ProjectSettingsTarget,
    scope: IgnoreScope,
    contents: string,
    stateToken: string,
  ): Promise<IgnoreFile>;
}
