/** The open project a call is scoped to. */
export type OverviewProjectQuery = { path: string; sessionEpoch: string };

/** Where the project lives, as Rust read it from the remote its branch
 * publishes to (else `origin`, else the first one). The configured address
 * never crosses IPC; only what the header names. */
export type RemoteHome = {
  remote: string;
  provider: "github" | "gitlab" | "bitbucket" | "other";
  /** `owner/name` (with GitLab's groups), or the folder of a local remote. */
  label: string;
  /** Whether Rust can derive a web page for it and open it. */
  hasWebPage: boolean;
};

/** Overview's own reach into Rust: where the project lives, and its page. */
export interface OverviewPort {
  /** `null` when the project has no remote at all. */
  readRemoteHome(query: OverviewProjectQuery): Promise<RemoteHome | null>;
  /** Opens the named remote's web page. Rust derives the address from the
   * project's configuration; the renderer never supplies one. */
  openRemoteHome(query: OverviewProjectQuery & { remote: string }): Promise<void>;
}
